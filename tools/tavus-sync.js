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

(async () => {
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
