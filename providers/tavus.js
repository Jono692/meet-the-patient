// Tavus provider. Their "CVI" stack: a PAL (prompt + layers) is created once
// per persona and cached on disk, then each consult opens a conversation
// against a face. The transport is a Daily room, so the client adapter uses
// daily-js rather than a vendor SDK.
//
// Naming: Tavus renamed replicas to FACES and personas to PALS. The old
// /v2/replicas and /v2/personas paths still work as aliases; we use the
// current names so the code matches their docs.
//
// .env:  TAVUS_API_KEY,
//        TAVUS_FACE_<persona> / TAVUS_FACE_DEFAULT,
//        TAVUS_LLM_MODEL, TAVUS_LLM_BASE_URL, TAVUS_LLM_API_KEY  (bring-your-own LLM),
//        TAVUS_VOICE_<persona> / TAVUS_VOICE_DEFAULT + TAVUS_TTS_ENGINE, TAVUS_TTS_API_KEY,
//        TAVUS_MAX_CALL_SECONDS, TAVUS_GREENSCREEN, TAVUS_PERCEPTION

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { buildPrompt } = require("./prompt");

const API = "https://tavusapi.com";

let personasFile = null;
let cacheFile = null;
let palCache = {};

function key() {
  return process.env.TAVUS_API_KEY;
}

function init(ctx) {
  personasFile = ctx.personasFile;
  cacheFile = path.join(ctx.dirname, ".tavus-pals.json");
  palCache = fs.existsSync(cacheFile) ? JSON.parse(fs.readFileSync(cacheFile, "utf8")) : {};
  if (!key()) throw new Error("TAVUS_API_KEY missing. Put it in .env");
}

async function tv(pathname, opts = {}) {
  const res = await fetch(API + pathname, {
    ...opts,
    headers: { "Content-Type": "application/json", "x-api-key": key(), ...(opts.headers || {}) },
  });
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = { raw: text }; }
  if (!res.ok) {
    const err = new Error(`Tavus ${pathname} ${res.status}: ${text.slice(0, 300)}`);
    err.status = res.status;
    throw err;
  }
  return body;
}

function faceFor(p) {
  return process.env["TAVUS_FACE_" + p.id] || process.env.TAVUS_FACE_DEFAULT;
}

// Voice: unset by default on purpose. With no tts layer Tavus uses the face's
// own cloned voice, which is what we want. Setting TAVUS_VOICE_<persona>
// overrides it with an external voice (ElevenLabs or Cartesia).
function ttsLayer(p) {
  const voice = process.env["TAVUS_VOICE_" + p.id] || process.env.TAVUS_VOICE_DEFAULT;
  if (!voice) return null;
  const tts = { tts_engine: process.env.TAVUS_TTS_ENGINE || "elevenlabs", external_voice_id: voice };
  if (process.env.TAVUS_TTS_API_KEY) tts.api_key = process.env.TAVUS_TTS_API_KEY;
  if (process.env.TAVUS_TTS_MODEL) tts.tts_model_name = process.env.TAVUS_TTS_MODEL;
  return tts;
}

// Hosted model by default. base_url + api_key switch it to our own endpoint,
// which is the whole reason Tavus is on the table: LiveAvatar FULL cannot.
function llmLayer() {
  const llm = { model: process.env.TAVUS_LLM_MODEL || "tavus-gemma-4" };
  if (process.env.TAVUS_LLM_BASE_URL) {
    llm.base_url = process.env.TAVUS_LLM_BASE_URL;
    llm.api_key = process.env.TAVUS_LLM_API_KEY;
  }
  return llm;
}

function layersFor(p) {
  const layers = {
    llm: llmLayer(),
    // The booth has a microphone, not a camera, so vision earns nothing and
    // costs latency. TAVUS_PERCEPTION=raven-1 turns it back on.
    perception: { perception_model: process.env.TAVUS_PERCEPTION || "off" },
  };
  const tts = ttsLayer(p);
  if (tts) layers.tts = tts;
  // Alcon, 30 Oct: the patient replies too fast and cuts in when a surgeon pauses
  // mid-question. We were sending nothing here, so we were on Tavus defaults of
  // medium/medium. Their own docs list "high" patience under medical consultations.
  // sparrow-2 is set explicitly rather than relied on as a default, and is the model
  // documented as robust in noisy rooms - which a conference floor certainly is.
  layers.conversational_flow = {
    turn_detection_model: process.env.TAVUS_TURN_MODEL || "sparrow-2",
    turn_taking_patience: process.env.TAVUS_TURN_PATIENCE || "high",
    pal_interruptibility: process.env.TAVUS_INTERRUPTIBILITY || "high",
  };
  return layers;
}

// Create or reuse a PAL for a persona, the same trick as LiveAvatar Contexts:
// the signature covers everything baked into the PAL, so editing personas.json
// or swapping a face makes a fresh one automatically.
async function palFor(p, face_id) {
  const system_prompt = buildPrompt(personasFile, p);
  const layers = layersFor(p);
  const sig = crypto
    .createHash("sha1")
    .update(system_prompt + "\n" + p.opening_text + "\n" + face_id + "\n" + JSON.stringify(layers))
    .digest("hex");
  const cached = palCache[p.id];
  if (cached && cached.sig === sig) return cached.id;

  const body = await tv("/v2/pals", {
    method: "POST",
    body: JSON.stringify({
      pal_name: `Alcon patient: ${p.name}`,
      system_prompt,
      greeting: p.opening_text,
      pipeline_mode: "full",
      default_face_id: face_id,
      layers,
    }),
  });
  const id = body.pal_id || body.persona_id || body.data?.pal_id;
  if (!id) throw new Error("No pal id in response: " + JSON.stringify(body).slice(0, 300));
  palCache[p.id] = { id, sig };
  fs.writeFileSync(cacheFile, JSON.stringify(palCache, null, 2));
  console.log(`Created Tavus PAL for ${p.name}: ${id}`);
  return id;
}

async function createSession(p, opts = {}) {
  const face_id = faceFor(p);
  if (!face_id) throw new Error(`No face id for ${p.id}. Set TAVUS_FACE_${p.id} or TAVUS_FACE_DEFAULT in .env`);

  const pal_id = await palFor(p, face_id);

  const properties = {
    // A forgotten tab costs money, so cap it well short of their 1-hour default.
    max_call_duration: parseInt(process.env.TAVUS_MAX_CALL_SECONDS || "600", 10),
    // End as soon as we leave rather than idling on the clock.
    participant_left_timeout: 0,
    participant_absent_timeout: parseInt(process.env.TAVUS_ABSENT_TIMEOUT || "60", 10),
    // Captions are text about the patient on screen, so LIVE turns them off.
    enable_closed_captions: opts.displayMode !== "live",
    enable_recording: false,
  };
  // Their docs: greenscreen "resolves to false when used with Phoenix-4.5".
  if (process.env.TAVUS_GREENSCREEN === "true") properties.apply_greenscreen = true;

  const body = await tv("/v2/conversations", {
    method: "POST",
    body: JSON.stringify({
      pal_id,
      face_id,
      conversation_name: `Meet the Patient: ${p.name}`,
      custom_greeting: p.opening_text,
      properties,
    }),
  });

  if (!body.conversation_url) throw new Error("No conversation_url in response: " + JSON.stringify(body).slice(0, 300));
  return {
    provider: "tavus",
    session_token: body.conversation_url,
    conversation_url: body.conversation_url,
    conversation_id: body.conversation_id,
    persona: p.id,
  };
}

// Leaving the Daily room is not the same as ending the conversation. Called
// from /api/session-end so a closed tab cannot leave one running.
async function endSession(id) {
  if (!id) return { ok: false, error: "no conversation id" };
  await tv(`/v2/conversations/${encodeURIComponent(id)}/end`, { method: "POST" });
  console.log(`  [tavus] ended conversation ${id}`);
  return { ok: true };
}

async function listAvatars(query = {}) {
  const q = new URLSearchParams();
  q.set("limit", query.limit || "100");
  q.set("verbose", "true");
  if (query.custom === "1") q.set("face_type", "user");
  if (query.system === "1") q.set("face_type", "system");
  if (query.model) q.set("model_name", query.model);
  return tv("/v2/faces?" + q.toString());
}

async function listVoices() {
  return tv("/v2/voices");
}

module.exports = { name: "tavus", init, createSession, endSession, listAvatars, listVoices };
