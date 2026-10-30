// Client adapter for Tavus. Unlike LiveAvatar and Anam there is no vendor SDK
// for the browser: a conversation is a Daily room, so we join it with daily-js
// and render the remote tracks ourselves.
//
// Caveat worth knowing before reading the transcript code: Tavus publishes the
// conversation.utterance page with an empty body, so the exact key carrying the
// spoken text is not documented. We accept any of the plausible keys and dump
// anything unrecognised to the console, which is how we find out for certain.
import Daily from "@daily-co/daily-js";

const PATIENT_ROLES = new Set(["pal", "replica", "assistant"]);

function textOf(props) {
  if (!props) return "";
  return String(props.speech || props.text || props.transcript || props.utterance || "").trim();
}

export async function start({ session, videoEl, micId, on }) {
  const url = session?.conversation_url || session?.session_token;
  const conversationId = session?.conversation_id;
  if (!url) throw new Error("No conversation_url from the server");

  const call = Daily.createCallObject({ subscribeToTracksAutomatically: true });
  const t0 = performance.now();
  let firstWordMs = null;
  let ended = false;

  // Remote audio needs its own element: Daily's documented pattern is one
  // track per element, and the <video> tag is doing the video.
  const audioEl = document.createElement("audio");
  audioEl.autoplay = true;
  audioEl.style.display = "none";
  document.body.appendChild(audioEl);

  const cleanup = () => {
    try { videoEl.srcObject = null; } catch {}
    try { audioEl.srcObject = null; } catch {}
    audioEl.remove();
  };

  call.on("track-started", ({ participant, track, type }) => {
    if (!participant || participant.local || !track) return;
    if (type === "video") videoEl.srcObject = new MediaStream([track]);
    if (type === "audio") { audioEl.srcObject = new MediaStream([track]); audioEl.play().catch(() => {}); }
  });

  call.on("joined-meeting", () => on.status("Live"));
  call.on("participant-joined", (e) => { if (!e?.participant?.local) on.status("Live"); });
  call.on("error", (e) => on.status("Error: " + (e?.errorMsg || "unknown")));
  call.on("left-meeting", () => { if (!ended) { ended = true; cleanup(); on.ended("left"); } });

  // Last line logged for each side, used to collapse repeats and growing partials.
  const lastSaid = { surgeon: "", patient: "" };

  call.on("app-message", ({ data }) => {
    const ev = typeof data === "string" ? safeParse(data) : data;
    if (!ev || !ev.event_type) return;
    const props = ev.properties || {};
    const role = String(props.role || "").toLowerCase();

    switch (ev.event_type) {
      case "conversation.utterance": {
        const text = textOf(props);
        if (!text) return;
        // The patient's turn arrives twice, once as "pal" and again under the legacy
        // role "replica". Speech recognition also emits a growing partial before the
        // final, so "Morning." is followed by "Morning. So what brings you in?".
        // Drop an exact repeat, and drop a line that is only the start of the last one.
        const side = role === "user" ? "surgeon" : "patient";
        const prev = lastSaid[side];
        if (prev) {
          if (text === prev) return;
          if (text.startsWith(prev)) {
            // A longer version of the line we just logged: replace rather than repeat.
            lastSaid[side] = text;
            return side === "surgeon" ? on.surgeon(text, { replaces: prev }) : on.patient(text, { replaces: prev });
          }
        }
        lastSaid[side] = text;
        if (side === "surgeon") return on.surgeon(text);
        if (firstWordMs === null) { firstWordMs = Math.round(performance.now() - t0); on.firstWord?.(); }
        return on.patient(text);
      }
      case "conversation.started_speaking":
        // The patient's turn is also broadcast a second time with the legacy
        // role "replica"; both land here and both mean the same thing.
        if (PATIENT_ROLES.has(role)) on.speaking(true);
        return;
      case "conversation.stopped_speaking":
        if (PATIENT_ROLES.has(role)) on.speaking(false);
        return;
      default:
        console.debug("[tavus] app-message", ev.event_type, ev);
    }
  });

  await call.join({ url, startVideoOff: true, startAudioOff: false });
  if (micId) {
    try { await call.setInputDevicesAsync({ audioDeviceId: micId }); } catch (e) { console.warn("mic select", e); }
  }

  const sendEvent = (event_type, properties) => {
    const msg = { message_type: "conversation", event_type, conversation_id: conversationId };
    if (properties) msg.properties = properties;
    try { call.sendAppMessage(msg, "*"); } catch (e) { console.warn("sendAppMessage", e); }
  };

  return {
    provider: "tavus",
    async stop() {
      ended = true;
      try { await call.leave(); } catch {}
      try { call.destroy(); } catch {}
      cleanup();
      // Leaving the room does not end the conversation, and an unended
      // conversation keeps billing. The key is server-side, so ask the server.
      if (conversationId) {
        await fetch("/api/session-end", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ conversation_id: conversationId }),
        }).catch(() => {});
      }
    },
    async mute() {
      const muted = call.localAudio() === true;
      call.setLocalAudio(muted ? true : false);
      return !muted;
    },
    interrupt() { sendEvent("conversation.interrupt"); },
    info() {
      return {
        resolution: videoEl && videoEl.videoWidth ? videoEl.videoWidth + "x" + videoEl.videoHeight : null,
        region: null,
        sessionId: conversationId || null,
        firstWordMs,
      };
    },
  };
}

function safeParse(s) {
  try { return JSON.parse(s); } catch { return null; }
}
