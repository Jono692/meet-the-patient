import { RULES } from "../rules.js";

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

export function summarise(results) {
  const graded = results.filter((r) => r.grade);
  const breaches = graded.flatMap((r) => r.grade.breaches.map((b) => ({ ...b, conversation: r.id })));
  const byRule = RULES.map((rule) => {
    const rb = breaches.filter((b) => b.rule === rule.id);
    return {
      id: rule.id,
      name: rule.name,
      tested: results.filter((r) => r.scenario?.rule === rule.id).length,
      critical: rb.filter((b) => b.severity === "critical").length,
      major: rb.filter((b) => b.severity === "major").length,
      minor: rb.filter((b) => b.severity === "minor").length,
    };
  });
  return {
    conversations: results.length,
    graded: graded.length,
    errors: results.filter((r) => r.error).length,
    pass: graded.filter((r) => r.grade.verdict === "pass").length,
    borderline: graded.filter((r) => r.grade.verdict === "borderline").length,
    fail: graded.filter((r) => r.grade.verdict === "fail").length,
    overRestricted: graded.filter((r) => r.grade.over_restricted).length,
    critical: breaches.filter((b) => b.severity === "critical").length,
    breaches,
    byRule,
  };
}

function transcriptHtml(turns, raw) {
  if (!turns) return `<pre>${esc(raw)}</pre>`;
  let n = 0;
  return turns
    .map((t) => {
      const label = t.speaker === "patient" ? `Patient ${++n}` : "Doctor";
      return `<div class="turn ${t.speaker}"><span class="who">${label}</span><p>${esc(t.text) || "<em>(no reply)</em>"}</p></div>`;
    })
    .join("");
}

export function renderReport({ meta, results }) {
  const s = summarise(results);
  const sevOrder = { critical: 0, major: 1, minor: 2 };
  const breaches = [...s.breaches].sort((a, b) => sevOrder[a.severity] - sevOrder[b.severity]);
  const passRate = s.graded ? Math.round((s.pass / s.graded) * 100) : 0;

  const headline =
    s.fail === 0 && s.graded
      ? s.overRestricted
        ? `No rule breaches, but the patient was overly guarded in ${s.overRestricted} conversation${s.overRestricted === 1 ? "" : "s"}.`
        : "No rule breaches found in this run."
      : `${s.fail} of ${s.graded} conversations breached a no-go rule (${s.critical} critical finding${s.critical === 1 ? "" : "s"}).`;

  return `<!doctype html>
<html lang="en-AU">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Guardrail Test Report</title>
<style>
:root{--bg:#fafaf8;--fg:#1c1c1a;--muted:#6b6b66;--card:#fff;--line:#e4e2dc;--pass:#2f7d4f;--warn:#a86a00;--fail:#b3261e;--accent:#1f4e79}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#151514;--fg:#ecebe6;--muted:#a3a29b;--card:#1f1f1d;--line:#34332f;--pass:#5fbf84;--warn:#e0a63a;--fail:#f06b62;--accent:#7fb2e5}}
:root[data-theme="dark"]{--bg:#151514;--fg:#ecebe6;--muted:#a3a29b;--card:#1f1f1d;--line:#34332f;--pass:#5fbf84;--warn:#e0a63a;--fail:#f06b62;--accent:#7fb2e5}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif}
main{max-width:960px;margin:0 auto;padding:32px 16px 64px}
h1{font-size:26px;margin:0 0 4px}h2{font-size:18px;margin:40px 0 12px;padding-bottom:6px;border-bottom:1px solid var(--line)}
.sub{color:var(--muted);margin:0}
.headline{font-size:18px;margin:24px 0;padding:16px;border-left:4px solid ${s.fail ? "var(--fail)" : "var(--pass)"};background:var(--card)}
.tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px}
.tile{background:var(--card);border:1px solid var(--line);border-radius:8px;padding:12px}
.tile b{display:block;font-size:26px}.tile span{color:var(--muted);font-size:13px}
.table-wrap{overflow-x:auto}
table{width:100%;border-collapse:collapse;background:var(--card)}
th,td{text-align:left;padding:8px 10px;border-bottom:1px solid var(--line);vertical-align:top}
th{font-size:13px;color:var(--muted);font-weight:600}
th.n,td.n{text-align:right;font-variant-numeric:tabular-nums}
.sev{display:inline-block;padding:1px 8px;border-radius:10px;font-size:12px;font-weight:600;color:#fff}
.sev.critical,.v.fail{background:var(--fail)}.sev.major{background:var(--warn)}.sev.minor{background:var(--muted)}
.v{display:inline-block;padding:1px 8px;border-radius:10px;font-size:12px;font-weight:600;color:#fff}
.v.pass{background:var(--pass)}.v.borderline{background:var(--warn)}.v.error{background:var(--muted)}
blockquote{margin:6px 0;padding:6px 10px;border-left:3px solid var(--line);color:var(--fg)}
.breach{background:var(--card);border:1px solid var(--line);border-radius:8px;padding:12px 14px;margin-bottom:10px}
.breach .meta{font-size:13px;color:var(--muted)}
.fix{font-size:14px}.fix b{color:var(--accent)}
details{background:var(--card);border:1px solid var(--line);border-radius:8px;margin-bottom:8px}
summary{cursor:pointer;padding:10px 14px;display:flex;gap:10px;align-items:center;flex-wrap:wrap}
details>div{padding:0 14px 14px}
.turn{margin:8px 0}.turn .who{font-size:12px;font-weight:600;color:var(--muted)}.turn p{margin:2px 0}
.turn.patient p{padding-left:10px;border-left:3px solid var(--accent)}
pre{white-space:pre-wrap;font-size:13px}
.small{font-size:13px;color:var(--muted)}
ul{padding-left:20px}
</style>
</head>
<body><main>
<h1>Meet the Patient: guardrail test report</h1>
<p class="sub">${esc(meta.modeLabel)} · ${esc(meta.date)} · prompt version <code>${esc(meta.promptHash ?? "n/a")}</code></p>

<div class="headline">${esc(headline)}</div>

<div class="tiles">
  <div class="tile"><b>${s.graded}</b><span>conversations graded</span></div>
  <div class="tile"><b>${passRate}%</b><span>clean pass</span></div>
  <div class="tile"><b>${s.fail}</b><span>failed (major or critical)</span></div>
  <div class="tile"><b>${s.borderline}</b><span>borderline (minor only)</span></div>
  <div class="tile"><b>${s.overRestricted}</b><span>overly guarded</span></div>
  ${s.errors ? `<div class="tile"><b>${s.errors}</b><span>errored, not graded</span></div>` : ""}
</div>

<h2>Results by rule</h2>
<div class="table-wrap"><table>
<tr><th>Rule</th>${meta.mode === "redteam" ? '<th class="n">Targeted attacks</th>' : ""}<th class="n">Critical</th><th class="n">Major</th><th class="n">Minor</th></tr>
${s.byRule
  .map(
    (r) =>
      `<tr><td>${esc(r.name)}</td>${meta.mode === "redteam" ? `<td class="n">${r.tested}</td>` : ""}<td class="n">${r.critical}</td><td class="n">${r.major}</td><td class="n">${r.minor}</td></tr>`,
  )
  .join("")}
</table></div>

<h2>Findings</h2>
${
  breaches.length
    ? breaches
        .map(
          (b) => `<div class="breach">
  <div><span class="sev ${b.severity}">${b.severity}</span> <b>${esc(RULES.find((r) => r.id === b.rule)?.name ?? b.rule)}</b></div>
  <div class="meta">Conversation ${esc(b.conversation)}, patient turn ${b.turn}</div>
  <blockquote>${esc(b.quote)}</blockquote>
  <div>${esc(b.explanation)}</div>
  <div class="fix"><b>Suggested fix:</b> ${esc(b.suggested_fix)}</div>
</div>`,
        )
        .join("")
    : "<p>No findings.</p>"
}

<h2>All conversations</h2>
${results
  .map((r) => {
    const v = r.error ? "error" : r.grade.verdict;
    const label = r.scenario ? `${r.scenario.id} · ${r.scenario.tactic}` : r.id;
    return `<details><summary><span class="v ${v}">${v}</span> ${esc(label)}${r.grade?.over_restricted ? ' <span class="small">· overly guarded</span>' : ""}</summary><div>
${r.scenario ? `<p class="small">Attack goal: ${esc(r.scenario.goal)}</p>` : ""}
${r.error ? `<p class="small">Error: ${esc(r.error)}</p>` : `<p>${esc(r.grade.summary)}</p>`}
${transcriptHtml(r.turns, r.raw)}
</div></details>`;
  })
  .join("")}

<h2>Method and limits</h2>
<ul>
${
  meta.mode === "redteam"
    ? `<li>A simulated eye-care professional (${esc(meta.attackerModel)}) held ${s.conversations} conversations with the patient persona (${esc(meta.targetLabel)}), each scripted to pressure one or more no-go rules with a realistic tactic. Control conversations check the persona still behaves like a natural, useful patient.</li>`
    : `<li>${s.conversations} real conversation transcripts from ${esc(meta.source)} were graded.</li>`
}
<li>Each transcript was graded independently by ${esc(meta.judgeModel)} against the written rules. Only the patient's lines are graded.</li>
<li>Language models are not deterministic. A clean run lowers risk; it does not prove a breach cannot happen. Re-run after every prompt change and compare.</li>
<li>Automated grading should be spot-checked by a human, particularly anything marked minor or borderline.</li>
</ul>
<p class="small">Prompt file: ${esc(meta.promptFile ?? "n/a")} · Run cost: US$${meta.spend?.usd ?? "?"} over ${meta.spend?.calls ?? "?"} API calls</p>
</main></body></html>`;
}
