// The avatar platform is chosen by the server (AVATAR_PROVIDER in .env); the
// session response says which one, and we load the matching adapter.
import * as liveavatar from "./providers/liveavatar.js";
import * as anam from "./providers/anam.js";
import * as tavus from "./providers/tavus.js";
import { startChroma } from "./chroma.js";

const ADAPTERS = { liveavatar, anam, tavus };

const $ = (s) => document.querySelector(s);
let config = {};
let chroma = null;
const state = { personas: [], persona: null, av: null, turns: 0, revealed: false };
let micBlocked = false;

const LENS = [
  { key: "monofocal", label: "Clareon Monofocal", test: /\bmonofocal\b|\bmono\b|\bdistance(?:-| )only\b|\bsingle(?:-| )vision\b|\bstandard lens\b/i },
  { key: "vivity", label: "Clareon Vivity (EDOF)", test: /\bvivity\b|\bedof\b|\bextended depth\b|\bextended range\b|\bextended focus\b/i },
  { key: "panoptix", label: "Clareon PanOptix (trifocal)", test: /\bpanoptix\b|\bpan optics?\b|\btrifocal\b|\btri-focal\b|\bmultifocal\b|\bmulti-focal\b/i },
];
const RECOMMEND = /\brecommend|\bsuggest|\bi'?d go (?:with|for)\b|\bi would go (?:with|for)\b|\bput you in\b|\bgo with\b|\bbest (?:option|lens|choice) for you\b|\bi think (?:the|a)\b.*\blens\b|\byou'?d suit\b|\bmy advice\b/i;

const lastLineEl = {};

function log(who, text, opts) {
  // No transcript on screen in LIVE, and sendTranscript is already a no-op there.
  if (config.displayMode === "live") return;
  const prefix = who === "surgeon" ? "Surgeon: " : who === "patient" ? state.persona.name + ": " : "";
  // A growing partial replaces the line it extends instead of adding a second one.
  if (opts && opts.replaces && lastLineEl[who]) {
    lastLineEl[who].textContent = prefix + text;
    $("#transcript").scrollTop = $("#transcript").scrollHeight;
    sendTranscript(who, text, opts.replaces);
    return;
  }
  const el = document.createElement("div");
  el.className = "line " + who;
  el.textContent = prefix + text;
  $("#transcript").appendChild(el);
  lastLineEl[who] = el;
  $("#transcript").scrollTop = $("#transcript").scrollHeight;
  sendTranscript(who, text);
}

// Keep a copy on the server, but only in testing. At the stand nothing is recorded,
// so the page must not even send the line.
function sendTranscript(who, text, replaces) {
  if (!config.keepTranscripts) return;
  fetch("/api/transcript", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      session: state.av?.info?.()?.sessionId || state.sessionId || null,
      persona: state.persona?.id || null,
      who,
      text,
      replaces: replaces || null,
    }),
  }).catch(() => {});
}
function status(t) { $("#status").textContent = t; }

async function loadPersonas() {
  state.personas = await (await fetch("/api/personas")).json();
  const grid = $("#personas");
  grid.innerHTML = "";
  for (const p of state.personas) {
    const card = document.createElement("button");
    card.className = "persona";
    card.innerHTML = `<div class="pname">${p.name}, ${p.age}</div><div class="ptag">${p.tagline}</div>`;
    card.onclick = () => start(p);
    grid.appendChild(card);
  }
}

async function listMics() {
  const sel = $("#mic");
  try {
    // Safari refuses this unless a click asked for it, so the list can start out empty.
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((t) => t.stop());
    const devs = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === "audioinput");
    // Hold the chosen mic across a rebuild, so plugging anything else in does not move it.
    const keep = sel.value;
    sel.innerHTML = devs.map((d) => `<option value="${d.deviceId}">${d.label || "Microphone"}</option>`).join("");
    if (keep && devs.some((d) => d.deviceId === keep)) sel.value = keep;
    micBlocked = false;
    return devs.length;
  } catch (e) {
    console.warn("mic permission", e);
    micBlocked = true;
    sel.innerHTML = '<option value="">Click to allow the mic</option>';
    status("No mic yet - click the Mic box and allow it");
    return 0;
  }
}

// A headset plugged in after the page loaded still has to show up in the list.
if (navigator.mediaDevices && navigator.mediaDevices.addEventListener) {
  navigator.mediaDevices.addEventListener("devicechange", listMics);
}

function renderFile(p) {
  if (config.displayMode === "live") return;
  const f = p.clinical_file;
  const rows = Object.entries(f).filter(([k]) => !k.startsWith("_")).map(([k, v]) => `<tr><th>${k.replace(/_/g, " ")}</th><td>${v}</td></tr>`).join("");
  $("#filebody").innerHTML = `<div class="filehead">${p.name}, ${p.age}. Referred by ${f.referred_by || ""}</div><table>${rows}</table><div class="placeholder">Placeholder clinical data. To be replaced by Alcon Medical Affairs.</div>`;
}

function showFile(on) {
  $("#file").classList.toggle("open", on);
  if (on) log("sys", "[clinical file shown]");
}

function reveal(lensKey, spoken) {
  // Text about the patient and the recommendation. Never in LIVE.
  if (config.displayMode === "live") return;
  if (state.revealed) return;
  state.revealed = true;
  const p = state.persona;
  const chosen = LENS.find((l) => l.key === lensKey);
  const match = p.target_lens.toLowerCase().includes(lensKey === "panoptix" ? "panoptix" : lensKey);
  $("#reveal").classList.add("open");
  $("#rv-chosen").textContent = chosen ? chosen.label : "Recommendation heard";
  $("#rv-quote").textContent = spoken ? `"${spoken}"` : "";
  $("#rv-target").textContent = p.target_lens;
  $("#rv-verdict").textContent = match ? "Aligned with the patient profile" : "Worth a conversation";
  $("#rv-verdict").className = "verdict " + (match ? "ok" : "warn");
  $("#rv-rationale").textContent = p.rationale;
  $("#rv-detail").classList.remove("open");
  log("sys", `[recommendation detected: ${chosen ? chosen.label : "unclear"}]`);
}

function handleSurgeon(text, opts) {
  // A replaced partial is the same turn, so it must not count twice toward the nudge.
  if (!(opts && opts.replaces)) state.turns++;
  log("surgeon", text, opts);
  if (RECOMMEND.test(text)) {
    const lens = LENS.find((l) => l.test.test(text));
    if (lens) reveal(lens.key, text);
  }
}

// The video element holds the last frame of whoever was on before, so a new consult
// opens on the previous patient's face for a moment. Wipe both surfaces first.
function clearStage() {
  const v = $("#video");
  try { v.pause(); } catch (e) {}
  v.srcObject = null;
  v.removeAttribute("src");
  v.load();
  // The keyed canvas is WebGL, so hiding it is what blanks it. Sit on Alcon blue
  // meanwhile, rather than letting the stage flash black while the stream arrives.
  document.body.classList.remove("keyed");
  $("#video").removeAttribute("style");
  $("#keyed").removeAttribute("style");
  setStageVisible(false);
  const q = new URLSearchParams(location.search);
  $("#stage").style.background = q.get("bg") || config.background || "#003595";
}

// Idle-clip recorder. Margaret talks or smiles through the whole of her training
// upload, so there is no still section to cut an idle loop from. Open the app with
// ?record=12, start her, let the greeting finish, and this captures twelve seconds of
// her resting state straight off the live render - which matches the stand exactly,
// because it IS the stand's renderer. Drop the result into public/idle/.
function initRecorder() {
  const secs = parseFloat(new URLSearchParams(location.search).get("record") || "");
  if (!secs || !window.MediaRecorder) return;
  const el = document.body.classList.contains("keyed") ? $("#keyed") : $("#video");
  const srcStream = el.captureStream ? el.captureStream(25) : null;
  if (!srcStream) return console.warn("[record] this browser cannot capture the element");
  const chunks = [];
  const rec = new MediaRecorder(srcStream, { mimeType: "video/webm;codecs=vp9", videoBitsPerSecond: 8e6 });
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  rec.onstop = () => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(chunks, { type: "video/webm" }));
    a.download = `idle-${state.persona ? state.persona.id : "patient"}-${state.emotion || "no-emotion"}.webm`;
    a.click();
    console.log("[record] saved " + a.download);
  };
  rec.start();
  console.log(`[record] capturing ${secs}s`);
  setTimeout(() => rec.stop(), secs * 1000);
}

// ---------------------------------------------------------------------------
// Stand control. Two rooms, one PC each, inside a wall cavity. The host is outside
// with a presenter clicker, which is simply a keyboard: the two buttons we use send
// Page Down and Page Up. Three screen states - closed, idle, live - and nothing but
// the patient ever reaches the screen.
const stand = { on: false, order: [], idx: 0, state: "idle", lastKey: 0, busy: false, stopping: false };

function standPersona() {
  return state.personas.find((x) => x.id === stand.order[stand.idx]) || state.personas[0];
}

function reportRoom(extra) {
  const p = standPersona();
  fetch("/api/room/state", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ state: stand.state, persona: p ? p.id : null, error: null, ...extra }),
  }).catch(() => {});
}

function setStandState(next, extra) {
  stand.state = next;
  document.body.classList.toggle("standing-idle", next === "idle");
  document.body.classList.toggle("standing-closed", next === "closed");
  if (next === "idle") playIdle(); else $("#idle").pause();
  reportRoom(extra);
}

// Between consults the stand shows one fixed hold clip, not the next patient (decided
// 3 Nov 2026: a seated woman, Adobe Stock 207362531, licensed, keyed onto the stand blue
// and framed to sit with the patients - see media/hold/). Pick, Skip and the rotation
// still move exactly as before; they just no longer change what is on screen between
// consults, and because the source never changes the loop does not restart on a pick.
// If the file is missing the stand shows plain blue, which is meant: a visible fault.
const HOLD_CLIP = "/idle/hold.mp4";

function playIdle() {
  const v = $("#idle");
  if (!v.src.endsWith(HOLD_CLIP)) v.src = HOLD_CLIP;
  // Muted and inline, so autoplay is allowed without a gesture.
  v.play().catch(() => {});
}

async function standStart() {
  if (stand.busy || stand.state === "live") return;
  stand.busy = true;
  try {
    setStandState("live");
    await start(standPersona());
    // start() leaves the status text set if it could not connect.
    if (!state.av) throw new Error("session did not start");
  } catch (e) {
    standFail(e && e.message ? e.message : String(e));
  } finally {
    stand.busy = false;
  }
}

async function standEnd(advance = true) {
  if (stand.busy) return;
  stand.busy = true;
  // The provider fires its own ended callback while we stop the session. Without
  // this flag that callback treats a deliberate End as a fault, advances the
  // rotation and then we advance it again - the next patient jumps by two.
  stand.stopping = true;
  try {
    await end();
    if (advance) stand.idx = (stand.idx + 1) % stand.order.length;
    setStandState("idle");
  } finally {
    stand.busy = false;
    stand.stopping = false;
  }
}

// A dropped or timed-out session returns to the loop on its own. The error goes to
// the server log; the screen shows the next patient sitting there as if nothing had
// happened, because a surgeon must never see a fault.
function standFail(message) {
  console.error("[stand] " + message);
  try { state.av?.stop(); } catch {}
  state.av = null;
  if (chroma) { chroma.stop(); chroma = null; }
  document.body.classList.remove("keyed");
  stand.idx = (stand.idx + 1) % stand.order.length;
  setStandState("idle", { error: message });
}

function standSkip() {
  if (stand.state === "live") return;   // skip never interrupts a consult
  stand.idx = (stand.idx + 1) % stand.order.length;
  setStandState(stand.state);
}

// The host picks who is next from their phone; the rotation carries on from there.
function standPick(id) {
  if (stand.state === "live") return;
  const i = stand.order.indexOf(id);
  if (i < 0) return;
  stand.idx = i;
  setStandState(stand.state);
}

function standCommand(c, persona) {
  // Separate actions, deliberately. Start while live and End while idle do nothing,
  // so a mis-press can never be destructive.
  if (c === "start") return stand.state === "idle" ? standStart() : undefined;
  if (c === "end") return stand.state === "live" ? standEnd() : undefined;
  if (c === "skip") return standSkip();
  if (c === "pick") return standPick(persona);
  if (c === "close") return stand.state === "live" ? standEnd().then(() => setStandState("closed")) : setStandState("closed");
  if (c === "open") return stand.state === "closed" ? setStandState("idle") : undefined;
}

function initStand() {
  const keys = config.keys || {};
  // The rotation is offset per room so A and B are never on the same patient.
  const order = (config.rotation || []).filter((id) => state.personas.some((p) => p.id === id));
  if (!order.length) return;
  stand.order = order;
  stand.idx = (config.roomId || "A").toUpperCase().charCodeAt(0) - 65;
  stand.idx = ((stand.idx % order.length) + order.length) % order.length;
  stand.on = config.displayMode === "live";

  document.addEventListener("keydown", (e) => {
    // The clicker's third button sends F5, which reloads the page. Mid-consult that
    // is unrecoverable, so it is swallowed whatever mode we are in.
    if (e.key === "F5") { e.preventDefault(); return; }
    if (!stand.on) return;
    const action = e.key === keys.start ? "start"
                 : e.key === keys.end ? "end"
                 : e.key === keys.skip ? "skip" : null;
    if (!action) return;
    e.preventDefault();
    // A repeat press within the debounce window is a bounce, not an instruction.
    const now = Date.now();
    if (now - stand.lastKey < (keys.debounceMs || 1500)) return;
    stand.lastKey = now;
    standCommand(action);
  });

  if (!stand.on) return;
  // The host's phone leaves a command; we collect it here.
  setInterval(() => {
    fetch("/api/room/command")
      .then((r) => r.json())
      .then((j) => { if (j.command) standCommand(j.command.command, j.command.persona); })
      .catch(() => {});
  }, 1000);

  $("#pick").classList.add("hidden");
  $("#stage").classList.remove("hidden");
  setStandState("idle");
}

// ---------------------------------------------------------------------------
// Portrait framing. Measured 5 Nov 2026, not guessed.
//
// The Tavus feed is 1280x720 and their conversation API has no aspect or
// resolution setting, so on the stand's 1080x1920 portrait screen
// object-fit:cover has to scale it 2.67x to fill the height and shows only
// 31.6% of the frame's WIDTH. Each patient's head is 20-36% of the frame wide,
// so cover puts a head on the screen edge to edge; and Margaret, whose head
// centre sits at 61% across instead of the middle, loses the right side of her
// face off the edge entirely.
//
// FACE_X is each patient's head centre as a fraction across the frame,
// measured off the Tavus upload crops in public/idle/ - the exact files Tavus
// renders from, so the live render matches by construction.
const FACE_X = { peter: 0.542, margaret: 0.614, rami: 0.489 };

// How much of the stage HEIGHT the patient's frame fills, as a fraction. 1.0
// would stand the full 720 lines up the whole screen. 0.675 is the default and
// puts her head at roughly 1.6x life size on a 55". Expressed against the stage
// rather than in pixels so Windows display scaling cannot change it.
const FILL_DEFAULT = 0.675;
const FRAME_W = 1280, FRAME_H = 720;

// Modes:
//   zoom  (default) draw the WHOLE frame at FILL of the stage height, bottom
//         edge on the stage bottom so the frame's hard cut across the chest
//         runs off screen, and the patient's face centred horizontally. What
//         sits around it is the same #003595 the chroma key composites onto, so
//         there is no visible letterbox - it reads as headroom.
//   nudge keep object-fit:cover and only slide the crop window across with
//         object-position. Fixes the cut-off face, leaves the head about 3x
//         life size. The small, safe fallback.
//   off   touch nothing.
//
// Tuning at the stand without a rebuild - edit the kiosk URL in show-start.ps1:
//   ?framing=zoom|nudge|off    ?fill=0.675    ?ox=0.614
//
// Landscape stages are left alone, so the Mac and Alcon's demo link are
// untouched. Without the chroma key there is no blue to sit in, so zoom falls
// back to nudge.
//
// Every property is set with priority "important" on purpose: index.html
// carries `body.live.consulting #video, #keyed { object-fit:cover !important }`
// and a plain inline style LOSES to a stylesheet !important. That is why the
// older ?fit= flag never did anything at the stand.
function framingFor(p) {
  const q = new URLSearchParams(location.search);
  const keyOn = q.get("key") ? q.get("key") !== "0" : config.chroma;
  let mode = q.get("framing") || "zoom";
  if (mode === "zoom" && !keyOn) mode = "nudge";
  const n = (k, d) => (q.get(k) != null && !isNaN(parseFloat(q.get(k))) ? parseFloat(q.get(k)) : d);
  return {
    mode,
    faceX: Math.max(0, Math.min(1, n("ox", FACE_X[p && p.id] != null ? FACE_X[p.id] : 0.5))),
    fill: Math.max(0.1, Math.min(3, n("fill", FILL_DEFAULT))),
  };
}

// Both stage layers stay hidden until the renderer has a frame of THIS consult.
// Without this the stand showed, in order: a thin black bar (the video element
// framed before it has any dimensions), then the previous patient (the canvas
// still holding its last frame, offset by the NEW patient's centring), then the
// right patient. Measured at the stand on 6 Nov.
let stageVisible = true;
function setStageVisible(v) {
  stageVisible = v;
  [$("#video"), $("#keyed")].forEach((el) =>
    el.style.setProperty("visibility", v ? "visible" : "hidden", "important"));
}

// Never leave the stage blank for ever. If no frame ever arrives we would rather
// show whatever there is than a blue screen with a voice coming out of it.
function revealOnFirstVideoFrame() {
  const v = $("#video");
  let done = false;
  const go = () => { if (done) return; done = true; setStageVisible(true); };
  if (v.requestVideoFrameCallback) v.requestVideoFrameCallback(go);
  else v.addEventListener("loadeddata", go, { once: true });
  setTimeout(go, 4000);
}

function applyFraming(p) {
  const stage = $("#stage");
  const els = [$("#video"), $("#keyed")];
  els.forEach((el) => el.removeAttribute("style"));
  els.forEach((el) => el.style.setProperty("visibility", stageVisible ? "visible" : "hidden", "important"));
  const { mode, faceX, fill } = framingFor(p);
  if (mode === "off") return;
  const w = stage.clientWidth, h = stage.clientHeight;
  if (!w || !h || h <= w) return; // landscape or not laid out yet: leave it alone

  if (mode === "nudge") {
    // Centre the cover crop window on this patient's face.
    const visible = (w / h) * (FRAME_H / FRAME_W); // share of the frame width on screen
    const over = 1 - visible;
    const x = over > 0.001 ? (faceX - visible / 2) / over : 0.5;
    const pct = (Math.max(0, Math.min(1, x)) * 100).toFixed(1);
    els.forEach((el) => {
      el.style.setProperty("object-fit", "cover", "important");
      el.style.setProperty("object-position", pct + "% center", "important");
    });
    return;
  }

  // zoom. Element height is a share of the stage; width follows the 16:9
  // intrinsic ratio. left:50% plus a translate of -faceX of the element's own
  // width puts the patient's face dead centre.
  els.forEach((el) => {
    el.style.setProperty("position", "absolute", "important");
    el.style.setProperty("inset", "auto", "important");
    el.style.setProperty("bottom", "0", "important");
    el.style.setProperty("left", "50%", "important");
    el.style.setProperty("height", (fill * 100).toFixed(2) + "%", "important");
    el.style.setProperty("width", "auto", "important");
    el.style.setProperty("object-fit", "fill", "important");
    el.style.setProperty("transform", "translateX(-" + (faceX * 100).toFixed(2) + "%)", "important");
  });
}

// Exposed the same way window.__chroma is, so the framing can be tried on the real
// screen without a rebuild: __framing({ id: "margaret" }) after changing ?fill= or ?ox=.
// It only moves pixels - unlike window.mtp it cannot touch the consult.
window.__framing = applyFraming;

// A rotated screen, a kiosk coming up, or someone dragging the window: re-run it.
window.addEventListener("resize", () => {
  if (state.persona && !$("#stage").classList.contains("hidden")) applyFraming(state.persona);
});

// A facial emotion held for the whole consult, per patient (Tavus conversation.set_emotion).
// Margaret's training footage has her smiling oddly and moving while she listens, and
// "neutral" is meant to hold her still. Deliberately empty until Jono OKs the A/B test of
// 3 Nov 2026, so nothing ships by accident. For the test, ?emotion=neutral or ?emotion=off
// in the URL overrides this for every patient; the stand never passes ?emotion.
const FACE_EMOTION = {};

function emotionFor(p) {
  const q = new URLSearchParams(location.search).get("emotion");
  if (q === "off") return null;
  return q || FACE_EMOTION[p.id] || null;
}

async function start(p) {
  state.persona = p;
  state.turns = 0;
  state.revealed = false;
  if (chroma) { chroma.stop(); chroma = null; }
  document.body.classList.remove("keyed");
  clearStage();
  applyFraming(p);
  renderFile(p);
  $("#pick").classList.add("hidden");
  $("#stage").classList.remove("hidden");
  $("#patient-name").textContent = `${p.name}, ${p.age}`;
  $("#patient-tag").textContent = p.tagline;
  status("Connecting…");

  let tokenRes;
  try {
    tokenRes = await (await fetch("/api/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ persona: p.id }) })).json();
    if (tokenRes.error) throw new Error(tokenRes.error);
  } catch (e) {
    status("Failed: " + e.message);
    return;
  }

  state.sessionId = tokenRes.conversation_id || tokenRes.session_id || null;

  const adapter = ADAPTERS[tokenRes.provider];
  if (!adapter) { status("Unknown provider: " + tokenRes.provider); return; }

  const micId = $("#mic").value || undefined;
  const on = {
    status: (t) => status(tokenRes.sandbox ? t + " (sandbox, ~1 min)" : t),
    surgeon: (t, o) => handleSurgeon(t, o),
    patient: (t, o) => log("patient", t, o),
    speaking: (b) => $("#stage").classList.toggle("speaking", b),
    ended: (r) => {
      status("Ended: " + r);
      logSessionInfo();
      // On the stand, anything that ends the session by itself is a fault: drop back
      // to the idle loop rather than leaving a dead frame on screen.
      if (stand.on && stand.state === "live" && !stand.stopping) {
        standFail("session ended unexpectedly: " + r);
      }
    },
    // Latency is only known once she speaks, so report again at that point.
    firstWord: () => logSessionInfo(),
  };

  try {
    state.emotion = emotionFor(p);
    if (state.emotion) console.log("[emotion] holding " + state.emotion + " for " + p.id);
    state.av = await adapter.start({ token: tokenRes.session_token, session: tokenRes, videoEl: $("#video"), micId, on, emotion: state.emotion });
    // TEST mode only: a handle for driving a consult without a microphone, for example
    // mtp.av.respond("...") to put words in the surgeon's mouth. Never exposed in LIVE.
    // It also needs ?mtp=1 now, because the Mac's demo link runs in TEST mode and is
    // public: test mode alone would hand anyone with the URL a way to speak as the
    // surgeon. The stand is LIVE, so this is off there either way.
    if (config.displayMode === "test" && new URLSearchParams(location.search).get("mtp") === "1") window.mtp = state;
    startBackground();
    setTimeout(initRecorder, 1500);
    $("#btn-mute").textContent = "Mute";
    logSessionInfo();
  } catch (e) {
    status("Start failed: " + (e.message || e));
    console.error(e);
  }
}

// What the session actually ran with. Anam reports its region once live, which
// is the honest answer for Alcon's data-residency question.
function logSessionInfo() {
  const i = state.av?.info?.();
  if (!i) return;
  const bits = [];
  if (i.resolution) bits.push("video " + i.resolution);
  if (i.region) bits.push("region " + i.region);
  if (i.firstWordMs != null) bits.push("first word " + i.firstWordMs + "ms");
  if (i.sessionId) bits.push("session " + i.sessionId);
  if (bits.length) { console.log("[" + state.av.provider + "] " + bits.join(", ")); log("sys", "[" + bits.join(", ") + "]"); }
  // Also send it to the server so it prints in the terminal during clean-mode takes.
  fetch("/api/session-info", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ provider: state.av.provider, ...i }),
  }).catch(() => {});
}

// The patients were filmed on green, so the booth background is a key, not a
// platform setting. URL params win over .env for live tuning on the stand.
function startBackground() {
  if (chroma) { chroma.stop(); chroma = null; }
  const q = new URLSearchParams(location.search);
  const on = q.get("key") ? q.get("key") !== "0" : config.chroma;
  if (!on) { revealOnFirstVideoFrame(); return; }
  const num = (k, d) => (q.get(k) != null ? parseFloat(q.get(k)) : d);
  try {
    chroma = startChroma($("#video"), $("#keyed"), {
      background: q.get("bg") || config.background,
      key: q.get("keycolor") || config.chromaKey,
      similarity: num("sim", config.similarity),
      smoothness: num("smooth", config.smoothness),
      spill: num("spill", config.spill),
      onFirstFrame: () => setStageVisible(true),
    });
    document.body.classList.add("keyed");
    setTimeout(() => setStageVisible(true), 4000);
    // The background is ours now, so the stage can match it. On a portrait
    // screen that means ?fit=contain shows the whole frame with blue either
    // side, instead of cropping into the face.
    const bg = q.get("bg") || config.background || "#003595";
    $("#stage").style.background = bg;
    // The keyed canvas has only just appeared, so frame it now. This used to set
    // object-fit inline without !important, which the live stylesheet beat.
    applyFraming(state.persona);
    window.__chroma = chroma;
  } catch (e) {
    console.warn("chroma key unavailable, showing the raw stream", e);
    // The layers are hidden until a frame arrives. If the key never started,
    // nothing would ever reveal them, so fall back to the video's own frame.
    revealOnFirstVideoFrame();
  }
}

async function end() {
  try { await state.av?.stop(); } catch {}
  if (chroma) { chroma.stop(); chroma = null; }
  document.body.classList.remove("keyed");
  setStageVisible(false);
  state.av = null;
  // On the stand there is no picker to go back to: the screen stays on the stage and
  // the idle loop takes over.
  if (!stand.on) {
    $("#stage").classList.add("hidden");
    $("#pick").classList.remove("hidden");
  }
  $("#file").classList.remove("open");
  $("#reveal").classList.remove("open");
  $("#transcript").innerHTML = "";
  lastLineEl.surgeon = null;
  lastLineEl.patient = null;
  status("");
}

// Operator controls (fallbacks for the demo and for the keyword triggers)
$("#btn-end").onclick = end;
$("#btn-file").onclick = () => showFile(!$("#file").classList.contains("open"));
$("#file-close").onclick = () => showFile(false);
$("#btn-transcript").onclick = () => $("#drawer").classList.toggle("open");
$("#rv-toggle").onclick = () => $("#rv-detail").classList.toggle("open");
$("#rv-close").onclick = () => $("#reveal").classList.remove("open");
document.querySelectorAll("[data-reveal]").forEach((b) => (b.onclick = () => reveal(b.dataset.reveal, "")));
$("#btn-interrupt").onclick = () => state.av?.interrupt();
$("#btn-mute").onclick = async () => {
  if (!state.av) return;
  const muted = await state.av.mute();
  $("#btn-mute").textContent = muted ? "Unmute" : "Mute";
};

const configReady = fetch("/api/config")
  .then((r) => r.json())
  .then((c) => {
    config = c;
    // LIVE is the stand screen: patient only. The class drives the layout, and the
    // guards below stop the panels being built at all rather than merely hidden.
    if (c.displayMode === "live") document.body.classList.add("live");
  })
  .catch(() => {});
// The stand needs both the persona list and the server's room config, so it starts
// once both have landed rather than racing them.
Promise.all([loadPersonas(), configReady]).then(initStand).catch((e) => console.error("[stand]", e));
listMics();
// The click is the user gesture Safari wants, so retry the prompt from there.
$("#mic").addEventListener("mousedown", () => { if (micBlocked) listMics(); });
