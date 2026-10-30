// Client adapter for Anam. A persona is configured server-side on the session
// token, so the client only needs the token and a video element id.
import { createClient, AnamEvent } from "@anam-ai/js-sdk";

// Some models leak their own scaffolding into the spoken text
// (e.g. "<think<|message|>"). Strip it before it reaches the screen. This is a
// guard, not a fix: the real answer is a model that doesn't emit it.
const CONTROL_TOKENS = /<\|?[a-z_]+\|?>|<think[^>]*>|<\/think>/gi;
function clean(s) {
  return String(s || "").replace(CONTROL_TOKENS, "").replace(/\s+/g, " ").trim();
}

export async function start({ token, videoEl, micId, on }) {
  const client = createClient(token, { disableInputAudio: false });
  const t0 = performance.now();
  let firstWordMs = null;

  client.addListener(AnamEvent.SESSION_READY, () => on.status("Live"));
  client.addListener(AnamEvent.VIDEO_PLAY_STARTED, () => on.status("Live"));
  client.addListener(AnamEvent.CONNECTION_CLOSED, (r, d) => on.ended(String(r) + (d ? " " + d : "")));
  client.addListener(AnamEvent.MIC_PERMISSION_DENIED, () => on.status("Mic permission denied"));
  client.addListener(AnamEvent.SERVER_WARNING, (w) => on.status("Warning: " + (w?.message || w)));

  // The stream arrives token by token. Accumulate per message id and only emit
  // a line when endOfSpeech (or an interruption) closes the utterance,
  // otherwise the transcript is one word per row and useless for the post-show
  // reporting Alcon has asked for.
  const buffers = new Map();
  const flush = (id) => {
    const b = buffers.get(id);
    if (!b) return;
    buffers.delete(id);
    const text = clean(b.text);
    if (!text) return;
    if (b.role === "user") on.surgeon(text);
    else {
      if (firstWordMs === null) { firstWordMs = b.firstMs; on.firstWord?.(); }
      on.patient(text);
      on.speaking(false);
    }
  };

  client.addListener(AnamEvent.MESSAGE_STREAM_EVENT_RECEIVED, (e) => {
    const id = e?.id || e?.utteranceId || "single";
    const role = String(e?.role || "").toLowerCase();
    if (!buffers.has(id)) {
      buffers.set(id, { role, text: "", firstMs: Math.round(performance.now() - t0) });
      if (role !== "user") on.speaking(true);
    }
    const b = buffers.get(id);
    b.text += (e?.content ?? "");
    if (e?.endOfSpeech || e?.interrupted) flush(id);
  });

  client.addListener(AnamEvent.TALK_STREAM_INTERRUPTED, () => {
    for (const id of [...buffers.keys()]) flush(id);
    on.speaking(false);
  });

  if (!videoEl.id) videoEl.id = "video";
  await client.streamToVideoElement(videoEl.id);
  if (micId) { try { await client.changeAudioInputDevice(micId); } catch (e) { console.warn("mic select", e); } }

  let muted = false;
  return {
    provider: "anam",
    async stop() { for (const id of [...buffers.keys()]) flush(id); try { await client.stopStreaming(); } catch {} },
    async mute() {
      if (muted) { client.unmuteInputAudio(); muted = false; } else { client.muteInputAudio(); muted = true; }
      return muted;
    },
    interrupt() { client.interruptPersona(); },
    // Region is only knowable once the session is live; Anam reports what it
    // actually used, which is the honest answer for Alcon's data-residency question.
    // The API does not validate video_quality (it accepts "banana"), so the only
    // honest confirmation of 1080p is the dimensions the stream actually renders.
    info() {
      return {
        resolution: videoEl && videoEl.videoWidth ? videoEl.videoWidth + "x" + videoEl.videoHeight : null,
        region: client.getActiveSessionRegion?.() ?? null,
        sessionId: client.getActiveSessionId?.() ?? null,
        firstWordMs,
      };
    },
  };
}
