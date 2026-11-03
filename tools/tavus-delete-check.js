// Prove on THIS machine that a consult's conversation is really removed from Tavus.
//
//   node tools/tavus-delete-check.js
//
// Opens a throwaway conversation exactly as a consult does, runs it through the
// same endSession() the server calls, then asks Tavus for it again. A pass means
// the whole chain works here: this PC, this network, this API key.
//
// It costs a few seconds of stream time and nobody joins the room. Run it once
// on each PC after an update and before doors.
//
// The check that matters is the GET at the end. A plain DELETE without hard=true
// is a SOFT delete: the conversation disappears from the list and a GET on its id
// still returns the whole record, transcript and all. So "gone from the list" is
// not proof and is not what this tests.

const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
require("dotenv").config({ path: path.join(root, ".env"), quiet: true });
const tavus = require("../providers/tavus");

const personasFile = JSON.parse(fs.readFileSync(path.join(root, "personas.json"), "utf8"));

(async () => {
  tavus.init({ personasFile, dirname: root });
  const p = personasFile.personas[0];

  const s = await tavus.createSession(p, { displayMode: "test" });
  console.log(`opened   ${s.conversation_id}  (${p.name})`);

  const out = await tavus.endSession(s.conversation_id);
  console.log(`ended    ${JSON.stringify(out)}`);

  const r = await fetch(`https://tavusapi.com/v2/conversations/${s.conversation_id}`, {
    headers: { "x-api-key": process.env.TAVUS_API_KEY },
  });
  const text = (await r.text()).trim();
  console.log(`asked for it again -> HTTP ${r.status} ${text.slice(0, 80)}`);

  if (r.status === 200) {
    console.error("\nFAIL: Tavus still has this conversation. It was not hard deleted.");
    process.exitCode = 1;
    return;
  }
  console.log("\nPASS: the conversation is gone from Tavus.");
})().catch((e) => {
  console.error("FAILED: " + e.message);
  process.exitCode = 2;
});
