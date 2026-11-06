// Alcon "Meet the Patient" prototype: backend.
//
// Serves the front end and mints avatar session tokens. The avatar platform is
// a config switch: AVATAR_PROVIDER=liveavatar|anam|tavus in .env. Each provider lives
// in providers/ and exposes createSession(persona); personas.json stays the
// single source of the characters for all of them.
//
// Run:  npm install && npm run build && npm start
// Then open http://localhost:3000

require("dotenv").config();
const express = require("express");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 3000;
const PROVIDER_NAME = (process.env.AVATAR_PROVIDER || "liveavatar").toLowerCase();

const PROVIDERS = {
  liveavatar: require("./providers/liveavatar"),
  anam: require("./providers/anam"),
  tavus: require("./providers/tavus"),
};

const provider = PROVIDERS[PROVIDER_NAME];
if (!provider) {
  console.error(`Unknown AVATAR_PROVIDER "${PROVIDER_NAME}". Use one of: ${Object.keys(PROVIDERS).join(", ")}`);
  process.exit(1);
}

const personasFile = JSON.parse(fs.readFileSync(path.join(__dirname, "personas.json"), "utf8"));

try {
  provider.init({ personasFile, dirname: __dirname });
} catch (e) {
  console.error(e.message);
  process.exit(1);
}

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// Which platform the front end should talk to.
app.get("/api/config", (req, res) =>
  res.json({
    provider: PROVIDER_NAME,
    // The patients were filmed on green, so the booth background is keyed in
    // the browser. Tavus cannot do it server-side on Phoenix-4.5 faces.
    // Read through setting(), so config.local.json tuning lands on the next consult
    // with no restart. Picture tuning is exactly what you want to change mid-show.
    chroma: setting("CHROMA_KEY", "false") === "true",
    background: setting("BACKGROUND_COLOR", "#003595"),
    chromaKey: setting("CHROMA_KEY_COLOR", "") || null,
    similarity: parseFloat(setting("CHROMA_SIMILARITY", "0.36")),
    smoothness: parseFloat(setting("CHROMA_SMOOTHNESS", "0.10")),
    spill: parseFloat(setting("CHROMA_SPILL", "0.14")),
    displayMode: DISPLAY_MODE,
    roomId: ROOM_ID,
    hasPeer: !!PEER_URL,
    pinRequired: !!CONTROL_PIN,
    rotation: ROTATION,
    keys: {
      start: setting("KEY_START", "PageDown"),
      end: setting("KEY_END", "PageUp"),
      skip: setting("KEY_SKIP", "."),
      debounceMs: parseInt(setting("KEY_DEBOUNCE_MS", "1500"), 10),
    },
    // LIVE never writes or displays a transcript, whatever the testing flag says.
    keepTranscripts: !LIVE && process.env.KEEP_TRANSCRIPTS === "true" && !pastCutoff(),
  })
);

// ---------------------------------------------------------------------------
// Live operations, borrowed from Hello Operator, which proved the pattern over three
// events: a non-secret overlay for tuning, a restart you can request from outside, and
// an append-only log you can report from.
//
// config.local.json is tuning only and carries no secrets, so it can be edited on a
// show machine without ever opening the file that holds the API key.
//
// DELIBERATELY NOT OVERRIDABLE HERE: DISPLAY_MODE and KEEP_TRANSCRIPTS. Alcon promised
// surgeons that nothing is recorded. That promise must not be reversible by editing a
// file that is explicitly described as safe to edit.
const LOCAL_CONFIG = path.join(__dirname, "config.local.json");
let local = {};
function loadLocal() {
  try {
    local = JSON.parse(fs.readFileSync(LOCAL_CONFIG, "utf8"));
    delete local.DISPLAY_MODE;
    delete local.KEEP_TRANSCRIPTS;
    delete local.TRANSCRIPTS_CUTOFF;
    console.log("  [config] overlay loaded: " + (Object.keys(local).join(", ") || "empty"));
  } catch (e) {
    if (e.code !== "ENOENT") console.error("  [config] " + e.message);
    local = {};
  }
}
loadLocal();
try {
  fs.watch(__dirname, (ev, file) => { if (file === "config.local.json") setTimeout(loadLocal, 200); });
} catch {}

// Settings read through this honour the overlay; anything read straight from
// process.env does not, which is what keeps the two above immutable.
function setting(key, fallback) {
  if (local[key] !== undefined && local[key] !== null) return String(local[key]);
  return process.env[key] !== undefined ? process.env[key] : fallback;
}

// ---------------------------------------------------------------------------
// Event log. Counts and timings only - never a word anyone said. This is metadata,
// not a transcript, which is why it runs at the show when transcripts do not.
const EVENTS = path.join(__dirname, "events.jsonl");
function logEvent(event, extra = {}) {
  const row = { t: new Date().toISOString(), room: process.env.ROOM_ID || "A", event, ...extra };
  try { fs.appendFileSync(EVENTS, JSON.stringify(row) + "\n"); }
  catch (e) { console.error("  [events] " + e.message); }
}

// ---------------------------------------------------------------------------
// restart.flag, actioned BETWEEN consults only. A restart that fires while a surgeon
// is mid-sentence is the one thing that must never happen, so a flag dropped during a
// live consult waits until it ends. The wrapper in show-start.ps1 relaunches us.
const RESTART_FLAG = path.join(__dirname, "restart.flag");
let restartWanted = false;
setInterval(() => {
  if (!restartWanted && fs.existsSync(RESTART_FLAG)) {
    restartWanted = true;
    console.log("  [restart] requested - will restart once this room is idle");
  }
  if (!restartWanted) return;
  if (room.state === "live") return;          // wait for the consult to finish
  try { fs.unlinkSync(RESTART_FLAG); } catch {}
  logEvent("restart");
  console.log("  [restart] restarting now");
  process.exit(0);
}, 2000);

// Display mode. TEST is the rehearsal screen and keeps everything: clinical file,
// reveal card, transcript, operator buttons. LIVE is what a surgeon sees at the stand:
// the patient and nothing else. Defaults to LIVE so an unset flag cannot put operator
// chrome or patient text on a show screen.
const DISPLAY_MODE = (process.env.DISPLAY_MODE || "live").toLowerCase() === "test" ? "test" : "live";
const LIVE = DISPLAY_MODE === "live";
console.log(
  LIVE
    ? "  [display] LIVE - patient only. No file panel, reveal, transcript, captions or operator UI."
    : "  [display] TEST - rehearsal screen. File panel, reveal card, transcript and operator buttons all on."
);

// Stand wiring. Each room runs its own PC with its own ROOM_ID, and the rotation is
// offset per room so A and B are never on the same patient at the same time.
const ROOM_ID = (process.env.ROOM_ID || "A").toUpperCase();
const ROTATION = (process.env.ROTATION || "margaret,peter,rami")
  .split(",").map((x) => x.trim()).filter(Boolean);
// Presenter clickers are just keyboards. Page Down and Page Up are what the Logitech
// R400 sends on its two main buttons; its third sends F5, which would reload the page,
// so the client swallows that.
// Three separate buttons, not a toggle: a toggle makes a mis-press destructive, and
// on the R400 these are the forward, back and blank-screen keys.
const KEYS = {
  start: process.env.KEY_START || "PageDown",
  end: process.env.KEY_END || "PageUp",
  skip: process.env.KEY_SKIP || ".",
  debounceMs: parseInt(process.env.KEY_DEBOUNCE_MS || "1500", 10),
};

// A PIN on the host page. This is a deterrent against a passer-by with the URL, not
// real authentication - the relay hostname is unguessable and the page does nothing
// but drive two screens.
const CONTROL_PIN = process.env.CONTROL_PIN || "";
const PEER_URL = (process.env.PEER_URL || "").replace(/\/$/, "");
function pinOk(req) {
  return !CONTROL_PIN || req.get("x-control-pin") === CONTROL_PIN;
}

// What the host's phone reads, and the one command slot it can write.
// Seeded from the rotation offset so the host page is truthful even before the stand
// screen has come up and reported in.
const startIdx = ((ROOM_ID.charCodeAt(0) - 65) % ROTATION.length + ROTATION.length) % ROTATION.length;
const room = { id: ROOM_ID, state: "idle", persona: ROTATION[startIdx] || null, since: Date.now(), error: null };
let pending = null;

console.log(
  `  [room] ${ROOM_ID}  rotation ${ROTATION.join(" > ")}  keys ${KEYS.start}=start ${KEYS.end}=end ${KEYS.skip}=skip` +
  `  pin ${CONTROL_PIN ? "set" : "NOT SET"}${PEER_URL ? "  peer " + PEER_URL : ""}`
);

// A comma-separated SHOW_PERSONAS hides the rest, so a client link can be held to one
// patient without touching personas.json.
const SHOWN = (process.env.SHOW_PERSONAS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const visible = () =>
  SHOWN.length ? personasFile.personas.filter((p) => SHOWN.includes(p.id)) : personasFile.personas;

// Public persona data: everything except the prompt internals.
app.get("/api/personas", (req, res) => {
  res.json(
    visible().map((p) => ({
      id: p.id,
      name: p.name,
      age: p.age,
      tagline: p.tagline,
      // Withheld in LIVE. The screen cannot leak what the page was never sent.
      ...(LIVE ? {} : {
        clinical_file: p.clinical_file,
        target_lens: p.target_lens,
        rationale: p.rationale_placeholder,
      }),
    }))
  );
});

app.get("/api/avatars", async (req, res) => {
  try {
    res.json(await provider.listAvatars(req.query));
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

app.get("/api/voices", async (req, res) => {
  try {
    res.json(await provider.listVoices(req.query));
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

// Mint a session for a persona. The front end gets only the session token.
// The stand screen reports its state here so the host's phone can show it without
// anything appearing on the screen itself.
app.post("/api/room/state", (req, res) => {
  const b = req.body || {};
  const changed = b.state && b.state !== room.state;
  const wasLive = room.state === "live";
  const ranFor = Date.now() - room.since;
  // Who was actually in the chair. The client sends the NEXT patient when it returns
  // to idle, so reading the incoming value here would credit every consult to the
  // wrong person in the client report.
  const consulted = room.persona;
  if (changed) room.since = Date.now();
  if (b.state) room.state = b.state;
  if ("persona" in b) room.persona = b.persona;
  if ("error" in b) room.error = b.error;
  if (b.error) console.error(`  [room ${ROOM_ID}] ${b.error}`);
  // Metadata only: which patient, how long, what failed. Never what was said.
  if (changed) {
    if (b.state === "live") logEvent("consult_start", { persona: room.persona });
    else if (wasLive) logEvent("consult_end", { persona: consulted, ms: ranFor, error: b.error || null });
    else logEvent(b.state, { persona: room.persona });
  } else if (b.error) {
    logEvent("error", { persona: room.persona, error: b.error });
  }
  res.json({ ok: true });
});

// The raw log, newest last. PIN-protected because it says when the stand was busy.
app.get("/api/events", (req, res) => {
  if (!pinOk(req)) return res.status(401).json({ error: "bad pin" });
  const limit = Math.min(parseInt(req.query.limit || "200", 10), 2000);
  try {
    const rows = fs.existsSync(EVENTS)
      ? fs.readFileSync(EVENTS, "utf8").split("\n").filter(Boolean).slice(-limit).map(JSON.parse)
      : [];
    res.json({ room: ROOM_ID, count: rows.length, events: rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// What you report to the client afterwards: how many consults, how long, who was picked.
app.get("/api/usage", (req, res) => {
  if (!pinOk(req)) return res.status(401).json({ error: "bad pin" });
  try {
    const rows = fs.existsSync(EVENTS)
      ? fs.readFileSync(EVENTS, "utf8").split("\n").filter(Boolean).map(JSON.parse)
      : [];
    const ends = rows.filter((r) => r.event === "consult_end");
    const byDay = {}, byPersona = {};
    let total = 0;
    for (const r of ends) {
      const day = r.t.slice(0, 10);
      byDay[day] = (byDay[day] || 0) + 1;
      if (r.persona) byPersona[r.persona] = (byPersona[r.persona] || 0) + 1;
      total += r.ms || 0;
    }
    res.json({
      room: ROOM_ID,
      consults: ends.length,
      errors: rows.filter((r) => r.event === "error" || r.error).length,
      averageSeconds: ends.length ? Math.round(total / ends.length / 1000) : 0,
      totalMinutes: Math.round(total / 60000),
      byDay,
      byPersona,
      note: "Counts and timings only. No conversation content is recorded at any point.",
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get("/api/room", (req, res) =>
  res.json({ ...room, elapsedMs: Date.now() - room.since, rotation: ROTATION })
);

// The phone leaves a command; the stand screen picks it up on its next poll. One slot,
// because a backlog of queued start/stop presses is the last thing we want.
app.post("/api/room/command", (req, res) => {
  if (!pinOk(req)) return res.status(401).json({ error: "bad pin" });
  const { command, persona } = req.body || {};
  const known = ["start", "end", "skip", "close", "open", "pick", "tune", "reload"];
  if (!known.includes(command)) return res.status(400).json({ error: "unknown command" });
  if (command === "pick" && !ROTATION.includes(persona)) {
    return res.status(400).json({ error: "unknown persona" });
  }
  // tune carries live display settings. Whitelisted, numbers and short strings only:
  // this ends up driving CSS on the stand screen, so nothing arbitrary goes through.
  let params = null;
  if (command === "tune") {
    const allow = ["framing", "fill", "ox", "sim", "smooth", "spill", "bg"];
    const src = (req.body && req.body.params) || {};
    params = {};
    for (const k of allow) {
      if (src[k] == null) continue;
      const v = String(src[k]).slice(0, 24);
      if (!/^[A-Za-z0-9.#-]+$/.test(v)) continue;
      params[k] = v;
    }
    if (!Object.keys(params).length) return res.status(400).json({ error: "tune needs at least one of: " + allow.join(", ") });
  }
  pending = { command, persona: persona || null, params };
  res.json({ ok: true, queued: pending });
});

// The host's phone talks to one room and that room relays to the other, so a single
// page drives both without any cross-origin handling. Either room's URL works, which
// also means a dead PC in one room does not take the control page down with it.
// Returns the other room's status alongside its body. Handing back only the body meant a
// command the other room REJECTED came out of here as a 200, so the phone showed nothing
// at all - the same silent failure as the broken /api/command route, one layer down.
async function peer(path, init) {
  if (!PEER_URL) throw Object.assign(new Error("no peer configured"), { status: 503 });
  const r = await fetch(PEER_URL + path, { ...init, signal: AbortSignal.timeout(4000) });
  let body;
  try { body = await r.json(); } catch { body = { error: "unreadable reply from the other room" }; }
  return { status: r.status, body };
}

app.get("/api/peer/room", async (req, res) => {
  try { const p = await peer("/api/room"); res.status(p.status).json(p.body); }
  catch (e) { res.status(e.status || 502).json({ error: e.message }); }
});

app.post("/api/peer/command", async (req, res) => {
  if (!pinOk(req)) return res.status(401).json({ error: "bad pin" });
  try {
    const p = await peer("/api/room/command", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-control-pin": CONTROL_PIN },
      body: JSON.stringify(req.body || {}),
    });
    // The relay authenticates to the other room with its own PIN, so the two PCs must
    // share one CONTROL_PIN. Say so plainly rather than echoing a bare "bad pin".
    // Reported as 502, not 401: a 401 out of here tells the phone the host's own PIN is
    // wrong and locks the page. The host's PIN was fine - it is the two PCs that disagree.
    if (p.status === 401) {
      return res.status(502).json({
        error: "The other room rejected the PIN. CONTROL_PIN must match on both PCs.",
      });
    }
    res.status(p.status).json(p.body);
  } catch (e) { res.status(e.status || 502).json({ error: e.message }); }
});

app.get("/api/room/command", (req, res) => {
  const c = pending;
  pending = null;
  res.json({ command: c });
});

// A public link spends real money, so cap the number of consults it can start.
// SESSION_BUDGET is the number of sessions allowed before the link stops minting them.
const BUDGET = parseInt(process.env.SESSION_BUDGET || "0", 10);
let spent = 0;

app.get("/api/budget", (req, res) =>
  res.json({ budget: BUDGET || null, spent, remaining: BUDGET ? Math.max(0, BUDGET - spent) : null })
);

app.post("/api/session", async (req, res) => {
  try {
    // Hidden personas must not be reachable by hand-crafting a request either.
    const p = visible().find((x) => x.id === req.body.persona);
    if (!p) return res.status(400).json({ error: "unknown persona" });
    if (BUDGET && spent >= BUDGET) {
      console.warn(`  [budget] refused: ${spent}/${BUDGET} sessions used`);
      return res.status(429).json({ error: "This demo has reached its session limit for today." });
    }
    spent++;
    console.log(`  [budget] session ${spent}${BUDGET ? "/" + BUDGET : ""}`);
    const s = await provider.createSession(p, { displayMode: DISPLAY_MODE });
    // The id is logged the moment it exists. A PC rebooted mid-consult never reaches
    // /api/session-end, so without this row nothing would know the conversation was
    // ever opened; the boot sweep below reads these rows. Metadata only, never content.
    if (s && s.conversation_id) logEvent("session-created", { conversation_id: s.conversation_id, persona: p.id });
    res.json(s);
  } catch (e) {
    console.error(e);
    res.status(e.status || 500).json({ error: e.message });
  }
});

// Transcripts are kept during testing so a consult can be read back afterwards.
// OFF unless KEEP_TRANSCRIPTS is explicitly "true". Alcon has promised surgeons that
// nothing is recorded at the stand, so the show build must never set it. Default off
// means forgetting the flag fails safe.
// A hard date stop as well as the flag. Alcon promised surgeons nothing is recorded,
// and bump-in day is the worst possible day to rely on someone remembering a setting.
// On or after the cutoff the server refuses to write, whatever the flag says.
const CUTOFF = process.env.TRANSCRIPTS_CUTOFF || "2026-11-06";
const pastCutoff = () => new Date().toISOString().slice(0, 10) >= CUTOFF;
const KEEP_TRANSCRIPTS = process.env.KEEP_TRANSCRIPTS === "true";
const TDIR = path.join(__dirname, "transcripts");
if (LIVE) {
  console.log("  [transcripts] off - LIVE mode records nothing, whatever KEEP_TRANSCRIPTS says.");
} else if (KEEP_TRANSCRIPTS && pastCutoff()) {
  console.log(`  [transcripts] OFF - past the ${CUTOFF} cutoff. Nothing is recorded, flag ignored.`);
} else if (KEEP_TRANSCRIPTS) {
  console.log(`  [transcripts] ON - testing mode, writing to ./transcripts. Stops automatically on ${CUTOFF}.`);
} else {
  console.log("  [transcripts] off - nothing is recorded");
}
app.post("/api/transcript", (req, res) => {
  if (LIVE) return res.json({ ok: true, skipped: "live-mode" });
  if (!KEEP_TRANSCRIPTS) return res.json({ ok: true, skipped: "disabled" });
  // Checked per request, not just at boot, so a machine left running over the date stops.
  if (pastCutoff()) return res.json({ ok: true, skipped: "past-cutoff" });
  try {
    const { session, persona, who, text, replaces } = req.body || {};
    if (!text) return res.json({ ok: true, skipped: "empty" });
    if (!fs.existsSync(TDIR)) fs.mkdirSync(TDIR);
    const day = new Date().toISOString().slice(0, 10);
    const file = path.join(TDIR, `${day}-${persona || "unknown"}-${session || "nosession"}.jsonl`);
    const line = JSON.stringify({ t: new Date().toISOString(), who, text });
    // A growing partial rewrites the line it extends, so the file matches the screen.
    if (replaces && fs.existsSync(file)) {
      const rows = fs.readFileSync(file, "utf8").split("\n").filter(Boolean);
      const last = rows.length ? JSON.parse(rows[rows.length - 1]) : null;
      if (last && last.who === who && last.text === replaces) {
        rows[rows.length - 1] = line;
        fs.writeFileSync(file, rows.join("\n") + "\n");
        return res.json({ ok: true, replaced: true });
      }
    }
    fs.appendFileSync(file, line + "\n");
    res.json({ ok: true });
  } catch (e) {
    console.error("  [transcript] " + e.message);
    res.json({ ok: false, error: e.message });
  }
});

// Tavus only: leaving the room does not end the conversation, and an unended
// conversation keeps billing. The front end has no API key, so it asks us.
app.post("/api/session-end", async (req, res) => {
  if (!provider.endSession) return res.json({ ok: true, skipped: PROVIDER_NAME });
  const id = req.body && req.body.conversation_id;
  try {
    const out = await provider.endSession(id);
    // Logged either way: the record of a consult deleted is the thing Alcon may
    // be asked for, and a consult NOT deleted is the thing we need to chase.
    // out.deleted, not "not false": endSession answers without a deleted flag at
    // all when there was no conversation id, and the log must not claim a
    // deletion that never happened.
    logEvent(out.deleted ? "session-deleted" : "session-not-deleted", {
      conversation_id: id || null,
      ...(out.error ? { error: out.error } : {}),
    });
    res.json(out);
  } catch (e) {
    console.error("  [session-end] " + e.message);
    logEvent("session-not-deleted", { conversation_id: id || null, error: e.message });
    res.status(e.status || 500).json({ error: e.message });
  }
});

// The front end reports what the session actually ran with. Printed here so it
// is visible in the terminal during a clean-mode take, where the transcript
// drawer is hidden.
app.post("/api/session-info", (req, res) => {
  const i = req.body || {};
  const bits = [];
  if (i.provider) bits.push("provider " + i.provider);
  if (i.region) bits.push("REGION " + i.region);
  if (i.firstWordMs != null) bits.push("first word " + i.firstWordMs + "ms");
  if (i.sessionId) bits.push("session " + i.sessionId);
  console.log("  [session] " + (bits.join("  |  ") || "no info reported"));
  res.json({ ok: true });
});

// Boot sweep. Every consult is ended and hard deleted when it finishes, but a PC rebooted
// mid-consult never reaches /api/session-end and that conversation sits on Tavus as
// "ended". Seen at RANZCO on 7 Nov: Room B rebooted at 18:42 UTC during a consult opened
// at 18:39, and the record was still there an hour later. So at every boot, each
// session-created row in events.jsonl with no later session-deleted or sweep-deleted row
// for the same id is ended and hard deleted now. A failed delete stays in the list and is
// retried at the next boot. Ids come only from our own log and must look like Tavus ids.
async function sweepOrphans() {
  if (!provider.endSession || !fs.existsSync(EVENTS)) return;
  let rows = [];
  try {
    rows = fs.readFileSync(EVENTS, "utf8").split("\n").filter(Boolean)
      .map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  } catch (e) { console.error("  [sweep] " + e.message); return; }
  const open = new Map();
  for (const r of rows) {
    const id = r.conversation_id;
    if (!id || !/^c[0-9a-f]{8,}$/i.test(id)) continue;
    if (r.event === "session-created") open.set(id, r.persona || null);
    else if (r.event === "session-deleted" || r.event === "sweep-deleted") open.delete(id);
  }
  if (!open.size) return;
  console.log(`  [sweep] ${open.size} conversation(s) opened but never deleted - deleting now`);
  for (const [id, persona] of [...open].slice(0, 20)) {
    try {
      const out = await provider.endSession(id);
      logEvent(out.deleted ? "sweep-deleted" : "sweep-not-deleted",
        { conversation_id: id, persona, ...(out.error ? { error: out.error } : {}) });
    } catch (e) {
      logEvent("sweep-not-deleted", { conversation_id: id, persona, error: e.message });
    }
  }
}

logEvent("boot", { mode: DISPLAY_MODE });
sweepOrphans().catch((e) => console.error("  [sweep] " + e.message));
app.listen(PORT, () => {
  const extra = PROVIDER_NAME === "liveavatar" ? `  (sandbox: ${process.env.LIVEAVATAR_SANDBOX === "true"})` : "";
  console.log(`Meet the Patient prototype on http://localhost:${PORT}  [provider: ${PROVIDER_NAME}]${extra}`);
});
