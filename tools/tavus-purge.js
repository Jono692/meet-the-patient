// Every conversation still sitting on the Tavus account, and a way to remove them.
//
//   node tools/tavus-purge.js           list what is there, delete nothing
//   node tools/tavus-purge.js --delete  hard delete all of them
//
// The server hard deletes each consult as it ends, so on a clean show day this
// should print nothing. It is the backstop for the ones that slip through: a
// conversation that hit max_call_duration with the tab already closed, a PC
// that lost power mid-consult, or a conversation opened by hand while testing.
//
// Run it at the end of each show day and expect an empty list. Anything listed
// is a consult whose transcript is still on their servers.
//
// --delete is irrevocable, and hard=true really is needed: a DELETE without it
// only hides the conversation from this list, and a GET on the id still returns
// the whole record.

const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
require("dotenv").config({ path: path.join(root, ".env"), quiet: true });
const tavus = require("../providers/tavus");

const personasFile = JSON.parse(fs.readFileSync(path.join(root, "personas.json"), "utf8"));
const doDelete = process.argv.includes("--delete");

(async () => {
  tavus.init({ personasFile, dirname: root });
  const list = await tavus.listConversations(100);
  if (!list.length) return console.log("Nothing on the account. Clean.");

  console.log(`${list.length} conversation(s) on the account:\n`);
  for (const c of list) {
    const when = (c.created_at || "").replace("T", " ").slice(0, 16);
    console.log(`  ${c.conversation_id}  ${when}  ${String(c.status || "?").padEnd(7)}  ${c.conversation_name || ""}`);
  }

  if (!doDelete) {
    console.log(`\nNothing deleted. Run with --delete to hard delete all ${list.length}.`);
    return;
  }

  console.log("");
  let gone = 0;
  for (const c of list) {
    try {
      await tavus.deleteConversation(c.conversation_id);
      gone++;
      console.log(`  deleted ${c.conversation_id}`);
    } catch (e) {
      console.error(`  FAILED  ${c.conversation_id}: ${e.message}`);
    }
  }
  // Read the account back rather than trusting the 204s.
  const left = await tavus.listConversations(100);
  console.log(`\nDeleted ${gone} of ${list.length}. ${left.length} left on the account.`);
  process.exitCode = left.length ? 1 : 0;
})().catch((e) => {
  console.error(e.message);
  process.exitCode = 2;
});
