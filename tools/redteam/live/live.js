#!/usr/bin/env node
// Real Tavus consults with a simulated doctor. The patient is the booth's own
// pipeline (the PAL in .tavus-pals.json, tavus-gemma-4), not Claude, so this
// is the closest thing to the stand short of a person talking to it.
//
// How it works: this script opens each conversation with the app's own
// providers/tavus.js, then serves a small page (page.html) that joins the
// Daily room with mic and camera off. The page relays each patient line here,
// the attacker (lib/attacker.js) writes the doctor's reply, and the page sends
// it into the call as a Tavus "conversation.respond" message, which the PAL
// answers as if it had been spoken. One consult at a time; every conversation
// is ended through the API so none is left billing.
//
//   ANTHROPIC_API_KEY=... node live/live.js --persona peter,margaret,rami \
//     --scenarios ctrl-history,prod-direct,tm-rating,pi-ai-admit,dx-what-would-you-do
//   then open http://localhost:4500 in a browser and leave it open.
//
// Transcripts go to runs/live/<date>/ in the app's JSONL format, named so
// `node run.js score runs/live/<date> --prompt ../../providers/prompt.js`
// judges each one against its own patient's brief.

import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { selectScenarios } from "../scenarios.js";
import { nextDoctorLine } from "../lib/attacker.js";
import { getSpend } from "../lib/claude.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const APP = path.resolve(process.env.MTP_APP || path.join(here, "../../.."));
const require = createRequire(path.join(APP, "package.json"));
require("dotenv").config({ path: path.join(APP, ".env"), quiet: true });
const tavus = require(path.join(APP, "providers/tavus.js"));

const { values: opts } = parseArgs({
  options: {
    persona: { type: "string", default: "peter" },
    scenarios: { type: "string" },
    turns: { type: "string", default: "6" },
    port: { type: "string", default: "4500" },
    out: { type: "string", default: path.join(here, "../runs/live") },
  },
});

const ATTACKER = process.env.ATTACKER_MODEL ?? "claude-opus-5-5";
const JOB_LIMIT_MS = 6 * 60 * 1000;

const personasFile = JSON.parse(fs.readFileSync(path.join(APP, "personas.json"), "utf8"));
tavus.init({ personasFile, dirname: APP });

const personas = opts.persona.split(",").map((id) => {
  const p = personasFile.personas.find((x) => x.id === id.trim());
  if (!p) throw new Error(`Unknown persona ${id}`);
  return p;
});
const queue = personas.flatMap((p) => selectScenarios(opts.scenarios).map((s) => ({ p, s })));
const TOTAL = queue.length;
const day = new Date().toISOString().slice(0, 10);
const outDir = path.join(opts.out, day);
fs.mkdirSync(outDir, { recursive: true });

let active = null; // { id, p, s, session, turns: [], doctorLines, timer, file }
let finished = 0;

function log(job, who, text) {
  const line = { t: new Date().toISOString(), who, text };
  job.turns.push(line);
  fs.appendFileSync(job.file, JSON.stringify(line) + "\n");
}

async function endJob(reason) {
  const job = active;
  if (!job) return;
  active = null;
  clearTimeout(job.timer);
  log(job, "sys", `[ended: ${reason}]`);
  try {
    await tavus.endSession(job.session.conversation_id);
  } catch (e) {
    console.error(`  could not end ${job.session.conversation_id}: ${e.message}`);
  }
  finished++;
  const said = job.turns.filter((t) => t.who === "patient").length;
  console.log(`  ${finished}/${TOTAL} ${job.p.id} ${job.s.id}: ${said} patient lines (${reason})`);
  if (!queue.length) {
    console.log(`\nAll done. Transcripts: ${outDir}\nAttacker cost: US$${getSpend().usd}`);
    setTimeout(() => process.exit(0), 500);
  }
}

async function nextJob() {
  if (active) return { wait: true };
  const next = queue.shift();
  if (!next) return { done: true };
  const session = await tavus.createSession(next.p, { displayMode: "test" });
  const id = `${next.p.id}-${next.s.id}`;
  active = {
    id,
    ...next,
    session,
    turns: [],
    doctorLines: 0,
    file: path.join(outDir, `${day}-${next.p.id}-live-${next.s.id}-${session.conversation_id}.jsonl`),
  };
  active.timer = setTimeout(() => endJob("time limit"), JOB_LIMIT_MS);
  log(active, "sys", `[session ${session.conversation_id}, scenario ${next.s.id}]`);
  console.log(`  start ${id} (${session.conversation_id})`);
  return { id, conversation_url: session.conversation_url, conversation_id: session.conversation_id };
}

// The attacker wants {speaker, text} turns; the transcript uses the app's names.
function attackerView(job) {
  return job.turns
    .filter((t) => t.who !== "sys")
    .map((t) => ({ speaker: t.who === "surgeon" ? "doctor" : "patient", text: t.text }));
}

async function onPatient(jobId, text) {
  const job = active;
  if (!job || job.id !== jobId) return { doctor: null };
  log(job, "patient", text);
  if (job.doctorLines >= Number(opts.turns)) return { doctor: null };
  const line = await nextDoctorLine({ scenario: job.s, transcript: attackerView(job), model: ATTACKER });
  if (!line) return { doctor: null };
  job.doctorLines++;
  log(job, "surgeon", line);
  return { doctor: line };
}

function body(req) {
  return new Promise((resolve) => {
    let s = "";
    req.on("data", (d) => (s += d));
    req.on("end", () => resolve(s ? JSON.parse(s) : {}));
  });
}

const server = http.createServer(async (req, res) => {
  const send = (code, obj, type = "application/json") => {
    res.writeHead(code, { "Content-Type": type });
    res.end(type === "application/json" ? JSON.stringify(obj) : obj);
  };
  try {
    if (req.url === "/") return send(200, fs.readFileSync(path.join(here, "page.html")), "text/html");
    if (req.url === "/daily.js")
      return send(200, fs.readFileSync(require.resolve("@daily-co/daily-js/dist/daily.js")), "text/javascript");
    if (req.url === "/job") return send(200, await nextJob());
    if (req.url === "/patient" && req.method === "POST") {
      const b = await body(req);
      return send(200, await onPatient(b.id, String(b.text || "").trim()));
    }
    if (req.url === "/end" && req.method === "POST") {
      const b = await body(req);
      if (active && active.id === b.id) await endJob(b.reason || "page ended");
      return send(200, { ok: true });
    }
    if (req.url === "/log" && req.method === "POST") {
      const b = await body(req);
      console.log(`  [page] ${b.msg}`);
      return send(200, { ok: true });
    }
    send(404, { error: "not found" });
  } catch (e) {
    console.error(e);
    send(500, { error: e.message });
  }
});

for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, async () => {
    queue.length = 0;
    await endJob("stopped");
    process.exit(1);
  });
}

server.listen(Number(opts.port), () => {
  console.log(`${queue.length} live consults queued. Open http://localhost:${opts.port} and leave it open.`);
});
