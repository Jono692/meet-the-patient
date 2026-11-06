// Push the current personas.json prompt to Tavus and read it back.
//
//   node tools/tavus-sync.js          check only: is each cached PAL current?
//   node tools/tavus-sync.js --push   create PALs for any persona whose prompt changed
//
// Uses the same palFor() as the server, so the PAL ids land in .tavus-pals.json
// and the server reuses them. Restart the server afterwards: it reads
// personas.json once at boot, and with the old prompt in memory it would make
// a fresh PAL from the old text on the next consult.

const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
require("dotenv").config({ path: path.join(root, ".env"), quiet: true });
const tavus = require("../providers/tavus");
const { buildPrompt } = require("../providers/prompt");

const personasFile = JSON.parse(fs.readFileSync(path.join(root, "personas.json"), "utf8"));
const push = process.argv.includes("--push");

// Cross-patient leak check, before anything is pushed. On 7 Nov 2026 at RANZCO, Margaret
// described her scans as "inferior steepening, worse in the right eye", which is Peter's
// topography: shared_rules carried his real result as a worked example of how to speak.
// So: build every patient's prompt and look in it for three-word runs taken from the OTHER
// patients' clinical files. A run that also occurs in the patient's own file is allowed
// (two patients can both have "normal OCT"). Anything else refuses the push, exit code 3.
function shingles(text) {
  const w = String(text).toLowerCase().replace(/[^a-z0-9+./ -]+/g, " ").split(/\s+/).filter(Boolean);
  const out = new Set();
  for (let i = 0; i + 3 <= w.length; i++) out.add(w.slice(i, i + 3).join(" "));
  return out;
}
function fileText(p) {
  return Object.entries(p.clinical_file || {}).filter(([k]) => !k.startsWith("_")).map(([, v]) => v).join(" \n ");
}
function leakCheck() {
  const found = [];
  for (const p of personasFile.personas) {
    const prompt = shingles(buildPrompt(personasFile, p));
    const own = shingles(fileText(p));
    for (const o of personasFile.personas) {
      if (o.id === p.id) continue;
      for (const sh of shingles(fileText(o))) {
        if (prompt.has(sh) && !own.has(sh)) found.push(`${p.id}'s prompt contains ${o.id}'s "${sh}"`);
      }
    }
  }
  return found;
}

(async () => {
  const leaks = leakCheck();
  if (leaks.length) {
    console.error("REFUSED: another patient's clinical values appear in a prompt. Nothing pushed.");
    leaks.forEach((l) => console.error("  - " + l));
    process.exitCode = 3;
    return;
  }
  console.log("leak check  no patient's clinical values appear in another patient's prompt");
  tavus.init({ personasFile, dirname: root });
  const cachePath = path.join(root, ".tavus-pals.json");
  let bad = 0;
  for (const p of personasFile.personas) {
    const cache = fs.existsSync(cachePath) ? JSON.parse(fs.readFileSync(cachePath, "utf8")) : {};
    const id = push ? await tavus.ensurePal(p) : cache[p.id]?.id;
    if (!id) {
      console.log(`${p.id.padEnd(9)} no PAL yet`);
      bad++;
      continue;
    }
    const pal = await tavus.getPal(id);
    const stored = pal.system_prompt ?? pal.data?.system_prompt ?? "";
    const ok = stored === buildPrompt(personasFile, p);
    if (!ok) bad++;
    console.log(`${p.id.padEnd(9)} ${id}  ${ok ? "matches personas.json" : "DIFFERENT from personas.json"}  (${stored.length} chars)`);
  }
  process.exitCode = bad ? 1 : 0;
})().catch((e) => {
  console.error(e.message);
  process.exitCode = 2;
});
