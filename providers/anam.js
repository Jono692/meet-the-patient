// Anam provider. A persona is face + voice + LLM + system prompt, configured
// inline on the session token, so there is nothing to create or cache first.
//
// .env:  ANAM_API_KEY,
//        ANAM_AVATAR_<persona> / ANAM_AVATAR_DEFAULT,
//        ANAM_VOICE_<persona> / ANAM_VOICE_DEFAULT,
//        ANAM_LLM, ANAM_MAX_SESSION_SECONDS, ANAM_REGION, ANAM_STT_PROVIDER
//
// Free tier: 30 min/month, 1 concurrent session, 3 minute conversation cap,
// output watermarked, commercial use not permitted. Region selection and Zero
// Data Retention are Enterprise-only; ANAM_REGION is sent only if set, and the
// API's response is surfaced rather than swallowed so we can see what applies.

const API = "https://api.anam.ai";
const { buildPrompt } = require("./prompt");

// GPT OSS 120B — Anam's recommended default.
const DEFAULT_LLM = "a7cf662c-2ace-4de1-a21e-ef0fbf144bb7";

let personasFile = null;

function key() {
  return process.env.ANAM_API_KEY;
}

function init(ctx) {
  personasFile = ctx.personasFile;
  if (!key()) throw new Error("ANAM_API_KEY missing. Put it in .env");
}

async function anam(pathname, opts = {}) {
  const res = await fetch(API + pathname, {
    ...opts,
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + key(), ...(opts.headers || {}) },
  });
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = { raw: text }; }
  if (!res.ok) {
    const err = new Error(`Anam ${pathname} ${res.status}: ${text.slice(0, 300)}`);
    err.status = res.status;
    throw err;
  }
  return body;
}

async function createSession(p, opts = {}) { // eslint-disable-line no-unused-vars
  const avatarId = process.env["ANAM_AVATAR_" + p.id] || process.env.ANAM_AVATAR_DEFAULT;
  if (!avatarId) throw new Error("No Anam avatar id. Set ANAM_AVATAR_DEFAULT or ANAM_AVATAR_<persona> in .env");
  const voiceId = process.env["ANAM_VOICE_" + p.id] || process.env.ANAM_VOICE_DEFAULT;
  if (!voiceId) throw new Error("No Anam voice id. Set ANAM_VOICE_DEFAULT or ANAM_VOICE_<persona> in .env");

  // Anam has no separate opening_text field, so the greeting is folded into the
  // prompt as an instruction. Keeps personas.json as the single source.
  const prompt =
    buildPrompt(personasFile, p) +
    `\n\nYOUR FIRST LINE, said once when the consultation opens, is exactly: "${p.opening_text}"`;

  const personaConfig = {
    name: p.name,
    avatarId,
    voiceId,
    llmId: process.env.ANAM_LLM || DEFAULT_LLM,
    systemPrompt: prompt,
    maxSessionLengthSeconds: parseInt(process.env.ANAM_MAX_SESSION_SECONDS || "180", 10),
  };
  if (process.env.ANAM_STT_PROVIDER) {
    personaConfig.voiceDetectionOptions = { sttProvider: process.env.ANAM_STT_PROVIDER };
  }

  const payload = { personaConfig, clientLabel: `wts-alcon-${p.id}` };
  if (process.env.ANAM_REGION) payload.sessionOptions = { region: process.env.ANAM_REGION };

  const body = await anam("/v1/auth/session-token", { method: "POST", body: JSON.stringify(payload) });
  if (!body.sessionToken) throw new Error("No sessionToken in response: " + JSON.stringify(body).slice(0, 300));

  return {
    provider: "anam",
    session_token: body.sessionToken,
    sandbox: false,
    persona: p.id,
    region_requested: process.env.ANAM_REGION || null,
    max_seconds: personaConfig.maxSessionLengthSeconds,
  };
}

async function listAvatars() {
  return anam("/v1/avatars");
}
async function listVoices() {
  return anam("/v1/voices");
}

module.exports = { name: "anam", init, createSession, listAvatars, listVoices };
