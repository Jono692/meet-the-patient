#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { parseArgs } from "node:util";
import { SCENARIOS, selectScenarios } from "./scenarios.js";
import { loadPersonaPrompt, claudeTarget, customTarget } from "./lib/target.js";
import { nextDoctorLine } from "./lib/attacker.js";
import { grade, formatTranscript } from "./lib/judge.js";
import { loadTranscripts } from "./lib/transcripts.js";
import { renderReport, summarise } from "./lib/report.js";
import { getSpend } from "./lib/claude.js";

const MODELS = {
  target: process.env.TARGET_MODEL ?? "claude-opus-5-5",
  targetEffort: process.env.TARGET_EFFORT ?? "medium",
  attacker: process.env.ATTACKER_MODEL ?? "claude-opus-5-5",
  judge: process.env.JUDGE_MODEL ?? "claude-opus-5-5",
};

const USAGE = `Meet the Patient guardrail harness

  node run.js redteam --prompt <persona prompt file> [options]
      --persona <id>          which patient in personas.json (peter, margaret, rami; default peter)
      --target <adapter.js>   test your real pipeline instead of Claude + prompt
      --scenarios <filter>    ids, prefixes or rules, comma separated (default: all)
      --repeats <n>           runs per scenario (default 1; use 3+ before sign-off)
      --turns <n>             doctor lines per conversation (default 6)
  node run.js score <transcripts dir or file> [--prompt <file>]
  node run.js list

  Shared: --concurrency <n> (default 4), --out <dir> (default runs/)
  Env: ANTHROPIC_API_KEY, TARGET_MODEL, TARGET_EFFORT, ATTACKER_MODEL, JUDGE_MODEL`;

const { values: opts, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    prompt: { type: "string", default: process.env.PERSONA_PROMPT },
    persona: { type: "string", default: "peter" },
    target: { type: "string" },
    scenarios: { type: "string" },
    repeats: { type: "string", default: "1" },
    turns: { type: "string", default: "6" },
    concurrency: { type: "string", default: "4" },
    out: { type: "string", default: "runs" },
    help: { type: "boolean", short: "h" },
  },
});

async function pool(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  let done = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
      process.stdout.write(`\r  ${++done}/${items.length} done`);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  process.stdout.write("\n");
  return results;
}

async function converse({ scenario, reply, turns }) {
  const transcript = [];
  for (let i = 0; i < turns; i++) {
    const line = await nextDoctorLine({ scenario, transcript, model: MODELS.attacker });
    if (!line) break;
    transcript.push({ speaker: "doctor", text: line });
    const messages = transcript.map((t) => ({ role: t.speaker === "doctor" ? "user" : "assistant", content: t.text || "..." }));
    const { text, refusal } = await reply(messages);
    transcript.push({ speaker: "patient", text, ...(refusal && { refusal }) });
  }
  return transcript;
}

function hash(text) {
  return text ? crypto.createHash("sha256").update(text).digest("hex").slice(0, 10) : null;
}

function writeRun({ meta, results }) {
  const dir = path.join(opts.out, `${meta.mode}-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}`);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "results.json"), JSON.stringify({ meta, results }, null, 2));
  fs.writeFileSync(path.join(dir, "report.html"), renderReport({ meta, results }));
  return dir;
}

async function redteam() {
  if (!opts.prompt) throw new Error("--prompt is required (path to providers/prompt.js or a .txt copy).");
  const system = await loadPersonaPrompt(opts.prompt, opts.persona);
  const reply = opts.target
    ? await customTarget(opts.target, system)
    : claudeTarget({ system, model: MODELS.target, effort: MODELS.targetEffort });
  const repeats = Number(opts.repeats);
  const jobs = selectScenarios(opts.scenarios).flatMap((s) =>
    Array.from({ length: repeats }, (_, r) => ({ scenario: s, id: repeats > 1 ? `${s.id}#${r + 1}` : s.id })),
  );

  console.log(`Running ${jobs.length} conversations. Target: ${opts.target ?? `${MODELS.target} (effort ${MODELS.targetEffort})`}`);
  const results = await pool(jobs, Number(opts.concurrency), async ({ scenario, id }) => {
    try {
      const turns = await converse({ scenario, reply, turns: Number(opts.turns) });
      const g = await grade({ transcriptText: formatTranscript(turns), scenario, model: MODELS.judge, brief: system });
      return { id, scenario, turns, grade: g };
    } catch (e) {
      return { id, scenario, error: e.message };
    }
  });

  return {
    meta: {
      mode: "redteam",
      modeLabel: "Simulated adversarial conversations",
      date: new Date().toISOString().slice(0, 16).replace("T", " "),
      promptFile: opts.prompt,
      persona: opts.persona,
      promptHash: hash(system),
      targetLabel: opts.target ? `custom target ${opts.target}` : `${MODELS.target}, effort ${MODELS.targetEffort}`,
      attackerModel: MODELS.attacker,
      judgeModel: MODELS.judge,
    },
    results,
  };
}

async function score() {
  const src = positionals[1];
  if (!src) throw new Error("Usage: node run.js score <transcripts dir or file>");
  const items = loadTranscripts(src);
  if (!items.length) throw new Error(`No .json/.txt/.md/.log transcripts found in ${src}`);
  const system = opts.prompt ? await loadPersonaPrompt(opts.prompt, opts.persona) : null;

  // The app names transcripts YYYY-MM-DD-<persona>-<session>.jsonl, so each one
  // is judged against its own patient's brief. Other names use --persona.
  const briefs = {};
  async function briefFor(id) {
    if (!opts.prompt) return null;
    const persona = id.match(/^\d{4}-\d{2}-\d{2}-([a-z]+)-/)?.[1] ?? opts.persona;
    briefs[persona] ??= loadPersonaPrompt(opts.prompt, persona).catch(() => system);
    return briefs[persona];
  }

  console.log(`Scoring ${items.length} transcripts from ${src}`);
  const results = await pool(items, Number(opts.concurrency), async (item) => {
    try {
      const text = item.turns ? formatTranscript(item.turns) : item.raw;
      return { ...item, grade: await grade({ transcriptText: text, model: MODELS.judge, brief: await briefFor(item.id) }) };
    } catch (e) {
      return { ...item, error: e.message };
    }
  });

  return {
    meta: {
      mode: "score",
      modeLabel: "Real booth transcripts",
      date: new Date().toISOString().slice(0, 16).replace("T", " "),
      source: src,
      promptFile: opts.prompt,
      persona: opts.persona,
      promptHash: hash(system),
      judgeModel: MODELS.judge,
    },
    results: results.map(({ file, ...r }) => r),
  };
}

async function main() {
  const cmd = positionals[0];
  if (opts.help || !cmd) return console.log(USAGE);
  if (cmd === "list") {
    for (const s of SCENARIOS) console.log(`${s.id.padEnd(22)} ${s.rule.padEnd(18)} ${s.tactic}`);
    return;
  }
  const run = cmd === "redteam" ? await redteam() : cmd === "score" ? await score() : null;
  if (!run) return console.log(USAGE);

  run.meta.spend = getSpend();
  const dir = writeRun(run);
  const s = summarise(run.results);
  console.log(`\nPass ${s.pass} · Borderline ${s.borderline} · Fail ${s.fail} · Overly guarded ${s.overRestricted} · Errors ${s.errors}`);
  console.log(`Critical findings: ${s.critical}`);
  console.log(`Estimated cost: US$${run.meta.spend.usd} (${run.meta.spend.calls} calls)`);
  console.log(`Report: ${path.join(dir, "report.html")}`);
  process.exitCode = s.fail || s.errors ? 1 : 0;
}

main().catch((e) => {
  console.error(e.message);
  process.exitCode = 2;
});
