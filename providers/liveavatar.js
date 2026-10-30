// HeyGen LiveAvatar provider. FULL mode: their ASR, LLM and TTS, our prompt
// carried in a Context that is created once per persona and cached on disk.
//
// .env:  LIVEAVATAR_API_KEY, LIVEAVATAR_SANDBOX,
//        AVATAR_<persona> / AVATAR_DEFAULT, VOICE_<persona> / VOICE_DEFAULT,
//        VOICE_SPEED_<persona> / VOICE_SPEED_DEFAULT, LANG_<persona> / LANG_DEFAULT,
//        PUSH_TO_TALK

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { buildPrompt } = require("./prompt");

const API = "https://api.liveavatar.com";
const SANDBOX_AVATAR = "dd73ea75-1218-4ef3-92ce-606d5f7fbc0a";

let personasFile = null;
let cacheFile = null;
let contextCache = {};

function key() {
  return process.env.LIVEAVATAR_API_KEY;
}
function sandbox() {
  return process.env.LIVEAVATAR_SANDBOX === "true";
}

function init(ctx) {
  personasFile = ctx.personasFile;
  cacheFile = path.join(ctx.dirname, ".contexts.json");
  contextCache = fs.existsSync(cacheFile) ? JSON.parse(fs.readFileSync(cacheFile, "utf8")) : {};
  if (!key()) throw new Error("LIVEAVATAR_API_KEY missing. Put it in .env");
}

async function la(pathname, opts = {}) {
  const res = await fetch(API + pathname, {
    ...opts,
    headers: { "Content-Type": "application/json", "X-API-KEY": key(), ...(opts.headers || {}) },
  });
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = { raw: text }; }
  if (!res.ok) {
    const err = new Error(`LiveAvatar ${pathname} ${res.status}: ${text.slice(0, 300)}`);
    err.status = res.status;
    throw err;
  }
  return body;
}

function avatarFor(p) {
  if (sandbox()) return SANDBOX_AVATAR;
  return process.env["AVATAR_" + p.id] || process.env.AVATAR_DEFAULT;
}

// Create or reuse a Context for a persona. The prompt hash is stored so that
// editing personas.json creates a fresh context automatically.
async function contextFor(p) {
  const prompt = buildPrompt(personasFile, p);
  const sig = crypto.createHash("sha1").update(prompt + p.opening_text).digest("hex");
  const cached = contextCache[p.id];
  if (cached && cached.sig === sig) return cached.id;

  const body = await la("/v1/contexts", {
    method: "POST",
    body: JSON.stringify({ name: `Alcon patient: ${p.name}`, prompt, opening_text: p.opening_text }),
  });
  const id = body.data?.id || body.id;
  if (!id) throw new Error("No context id in response: " + JSON.stringify(body).slice(0, 300));
  contextCache[p.id] = { id, sig };
  fs.writeFileSync(cacheFile, JSON.stringify(contextCache, null, 2));
  console.log(`Created context for ${p.name}: ${id}`);
  return id;
}

async function createSession(p, opts = {}) { // eslint-disable-line no-unused-vars
  const avatar_id = avatarFor(p);
  if (!avatar_id) {
    throw new Error("No avatar id. Set AVATAR_DEFAULT or AVATAR_<persona> in .env, or LIVEAVATAR_SANDBOX=true");
  }

  const context_id = await contextFor(p);
  const language = process.env["LANG_" + p.id] || process.env.LANG_DEFAULT || "en";
  const persona = { context_id, language };

  const voice_id = process.env["VOICE_" + p.id] || process.env.VOICE_DEFAULT;
  if (voice_id) persona.voice_id = voice_id;

  // Speech pace lives in voice_settings, discriminated by TTS provider.
  // elevenLabs/fish accept 0.8-1.2, cartesia 0.6-1.5. Note: attaching
  // voice_settings pins the ElevenLabs model, which rejects regional locales
  // such as en-AU, so speed and LANG_* are mutually exclusive.
  const speed = parseFloat(process.env["VOICE_SPEED_" + p.id] || process.env.VOICE_SPEED_DEFAULT || "");
  if (!Number.isNaN(speed)) {
    persona.voice_settings = { provider: process.env.VOICE_PROVIDER || "elevenLabs", speed };
  }

  // Business plan: custom avatars render 1080p, so very_high is worth having.
  // LIVEAVATAR_VIDEO_QUALITY in .env; "high" remains the fallback.
  const payload = {
    mode: "FULL",
    avatar_id,
    avatar_persona: persona,
    video_quality: process.env.LIVEAVATAR_VIDEO_QUALITY || "high",
  };
  if (sandbox()) payload.is_sandbox = true;
  if (process.env.PUSH_TO_TALK === "true") payload.interactivity_type = "PUSH_TO_TALK";

  const body = await la("/v1/sessions/token", { method: "POST", body: JSON.stringify(payload) });
  const token = body.data?.session_token || body.session_token;
  if (!token) throw new Error("No session token in response: " + JSON.stringify(body).slice(0, 300));

  return { provider: "liveavatar", session_token: token, sandbox: sandbox(), persona: p.id };
}

async function listAvatars(query) {
  const src = query && query.custom === "1" ? "/v1/avatars" : "/v1/avatars/public?page_size=100";
  return la(src);
}
async function listVoices() {
  return la("/v1/voices?page_size=100");
}

module.exports = { name: "liveavatar", init, createSession, listAvatars, listVoices };
