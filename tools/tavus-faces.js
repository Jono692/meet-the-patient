// Lists the Tavus faces on the account so .env can be filled in with real ids.
//   node tools/tavus-faces.js          your own trained faces
//   node tools/tavus-faces.js all      stock faces too
require("dotenv").config();

const key = process.env.TAVUS_API_KEY;
if (!key) { console.error("TAVUS_API_KEY missing. Put it in .env"); process.exit(1); }

(async () => {
  const q = new URLSearchParams({ limit: "100", verbose: "true" });
  if (process.argv[2] !== "all") q.set("face_type", "user");
  const res = await fetch("https://tavusapi.com/v2/faces?" + q, { headers: { "x-api-key": key } });
  const text = await res.text();
  if (!res.ok) { console.error(res.status, text.slice(0, 400)); process.exit(1); }
  const body = JSON.parse(text);
  const rows = body.data || [];
  console.log(`${rows.length} of ${body.total_count} faces\n`);
  for (const f of rows) {
    console.log(
      [
        (f.face_name || "(unnamed)").padEnd(18),
        (f.face_id || "").padEnd(16),
        (f.model_name || "?").padEnd(12),
        "status " + (f.status || "?"),
        f.finetune_status ? "finetune " + f.finetune_status : "",
        "progress " + (f.training_progress || "?"),
        f.default_voice_id ? "voice " + f.default_voice_id : "no default voice",
      ].join("  ")
    );
  }
})().catch((e) => { console.error(e.message); process.exit(1); });
