// Client adapter for HeyGen LiveAvatar.
import { LiveAvatarSession, SessionEvent, AgentEventsEnum } from "@heygen/liveavatar-web-sdk";

export async function start({ token, videoEl, micId, on }) {
  const session = new LiveAvatarSession(token, { voiceChat: { deviceId: micId } });
  let keepAlive = null;
  let stopped = false;
  const clear = () => { if (keepAlive) clearInterval(keepAlive); keepAlive = null; };

  session.on(SessionEvent.SESSION_STREAM_READY, () => { session.attach(videoEl); on.status("Live"); });
  session.on(SessionEvent.SESSION_DISCONNECTED, (r) => { on.ended(String(r)); clear(); });
  session.on(AgentEventsEnum.USER_TRANSCRIPTION, (e) => on.surgeon(e.text));
  session.on(AgentEventsEnum.AVATAR_TRANSCRIPTION, (e) => on.patient(e.text));
  session.on(AgentEventsEnum.AVATAR_SPEAK_STARTED, () => on.speaking(true));
  session.on(AgentEventsEnum.AVATAR_SPEAK_ENDED, () => on.speaking(false));
  session.on(AgentEventsEnum.SESSION_STOPPED, (e) => { on.ended(e.stop_reason); clear(); });

  await session.start();
  // Ping only while the session is actually live. On the Business plan a
  // session runs up to 60 minutes, so a keepAlive left ticking after the
  // consult ends burns real credits.
  keepAlive = setInterval(() => {
    if (stopped) { clear(); return; }
    session.keepAlive().catch(() => {});
  }, 120000);

  // Esc goes through stop(), but a closed tab or a reload would otherwise leave
  // the session running server-side until the cap.
  const onLeave = () => { stopped = true; clear(); try { session.stop(); } catch {} };
  window.addEventListener("pagehide", onLeave);
  window.addEventListener("beforeunload", onLeave);

  let muted = false;
  return {
    provider: "liveavatar",
    async stop() {
      stopped = true;
      clear();
      window.removeEventListener("pagehide", onLeave);
      window.removeEventListener("beforeunload", onLeave);
      try { await session.stop(); } catch {}
    },
    async mute() {
      const vc = session.voiceChat;
      if (!vc) return muted;
      if (vc.isMuted) { await vc.unmute(); muted = false; } else { await vc.mute(); muted = true; }
      return muted;
    },
    interrupt() { session.interrupt?.(); },
    // The API does not validate video_quality (it accepts "banana"), so the only
    // honest confirmation of 1080p is the dimensions the stream actually renders.
    info() {
      return {
        resolution: videoEl && videoEl.videoWidth ? videoEl.videoWidth + "x" + videoEl.videoHeight : null,
        region: null,
        sessionId: null,
      };
    },
  };
}
