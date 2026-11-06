# Tuning runbook — what can be changed at the stand, and how fast

Written 5 Nov 2026 for RANZCO setup day. For Jono and for whatever Claude session is on a show PC.
**Not part of the UPDATE-4 install** — no hash pins it, it is reference only.

Read this before changing anything, because the four tiers below have very different costs and
one of them rebuilds PALs at Tavus.

---

## First, a correction worth having straight

**Raven is not the noise model.** Raven is *perception* — camera and screen understanding. We have
a headset mic and no camera, so Raven is OFF on purpose and turning it on earns nothing for noise.

**Sparrow is turn-taking, and Sparrow-2 is the noise-robust one.** Tavus describe it as
"robust turn-taking in noisy environments". We are already on `sparrow-2`. There is nothing to
switch on.

**`voice_isolation` is a dead control for us.** Tavus's own docs: it "is not used by `sparrow-2`,
which analyzes the full audio stream directly." It only ever applied to the deprecated sparrow-1.
Do not spend time on it.

So on a loud floor there is exactly **one** Tavus lever, and it is in Tier 3 below.

---

## Tier 1 — kiosk URL. No file edits. Reboot the PC.

Edit the URL in `show-start.ps1`, reboot. Nothing else is touched, and removing the parameter
puts it back exactly as it was.

    ?framing=nudge        fall back to the full-bleed crop if the portrait framing looks wrong
    ?framing=off          framing exactly as it behaved before UPDATE-4
    ?fill=0.60            make the patient smaller on screen (default 0.675)
    ?ox=0.58              move the patient sideways; it is their head centre, 0 to 1
    ?key=0                turn the chroma key off entirely
    ?sim=0.06             chroma similarity, if the key is eating her hair or leaving a fringe
    ?smooth=0.03          chroma edge softness
    ?spill=0.08           green spill suppression
    ?bg=%23003595         background colour, URL-encoded

**This is the fastest safe lever you have.** Reach for it first.

---

## Tier 2 — `config.local.json`. Server picks it up instantly, the screen does not.

`C:\meet-the-patient\config.local.json`, plain JSON, no secrets in it, safe to edit at the stand.
The server watches the file and reloads within a second.

**But the browser reads `/api/config` once when the page loads and never again.** F5 is swallowed
on the kiosk. So in practice every one of these still needs a kiosk reboot to reach the screen.
Tier 2 buys you nothing over Tier 1 unless you want the setting to persist across URL changes.

Only these ten keys do anything:

    CHROMA_KEY, BACKGROUND_COLOR, CHROMA_KEY_COLOR,
    CHROMA_SIMILARITY, CHROMA_SMOOTHNESS, CHROMA_SPILL,
    KEY_START, KEY_END, KEY_SKIP, KEY_DEBOUNCE_MS

`DISPLAY_MODE`, `KEEP_TRANSCRIPTS` and `TRANSCRIPTS_CUTOFF` are **stripped on load** and cannot be
set here. That is deliberate: Alcon promised surgeons nothing is recorded, and a file described as
safe to edit must not be able to undo that promise.

**Useful emergency edit:** if consults keep dying for no reason, the clicker's back button is
`PageUp` and it ends the consult. Disable it with

    { "KEY_END": "F24" }

and end consults from the phone page instead.

---

## Tier 3 — `.env`, then push, then restart. The Tavus settings live here.

**None of the Tavus conversation settings can be reached from `config.local.json`.** They are read
straight from `process.env` inside `layersFor()`, on purpose.

    TAVUS_INTERRUPTIBILITY     low | medium | high      we send high
    TAVUS_TURN_PATIENCE        low | medium | high      we send high
    TAVUS_TURN_MODEL           sparrow-2                leave it
    TAVUS_PERCEPTION           off | raven-1 | raven-2  we send off — see below
    TAVUS_MAX_CALL_SECONDS     seconds, install.ps1 writes 420 (7 min) on the show PCs; code default 600
    TAVUS_ABSENT_TIMEOUT       seconds, default 60

### The one that matters in a loud room

**`TAVUS_INTERRUPTIBILITY` is currently `high`, and `high` is the worst setting for a noisy
stand.** It means the patient stops talking the moment it hears speech-like audio — which on a
conference floor is constantly. Tavus's own best practices say "lower values are recommended for
most experiences" and `low` for important information delivery.

If the patient keeps cutting herself off tomorrow, this is the fix:

    TAVUS_INTERRUPTIBILITY=low

`low`, `medium` and `high` are the only values Tavus document as options. Their Medical
Consultation example shows `verylow`, but that token is **not in their list of accepted values** and
is unverified — do not use it at the show. `low` is the documented floor.

`TAVUS_TURN_PATIENCE=high` is already correct; Tavus document `high` for medical consultations.

### Perception stays off

Raven-2 reads tone of voice and would let the patient react to a rushed or dismissive surgeon,
which would genuinely suit the brief. **It is also biometric emotion analysis of surgeons' voices,
which Tavus themselves frame under the EU AI Act, and Alcon have told surgeons nothing is
recorded.** That is a client decision, not a technical one. Do not switch it on at the stand.

### How to deploy a Tier 3 change — the order matters

Changing any of those four layer settings **changes the PAL signature**, so Tavus needs a new PAL.
The app reads `.tavus-pals.json` **once at boot**. Push into a running app and nothing re-reads it;
the first consult then builds a duplicate PAL and overwrites the file. This cost us time on 4 Nov.

Push first, restart second:

```
cd C:\meet-the-patient
notepad .env                                                          (1) change the value
.\node\node-v24.18.0-win-x64\node.exe tools\tavus-sync.js --push      (2) build the new PALs
echo. > restart.flag                                                  (3) restart between consults
```

`restart.flag` is actioned **only when the room is idle**, never mid-consult. Give it a few
seconds and check the app is back before you walk away.

Then do the other room. Both PCs, same values.

---

## Tier 4 — anything else needs a build in Melbourne

New code means `npm run build` on the Mac, a new hash, a new UPDATE script, a download and a
reboot. Assume **half an hour minimum** and that it depends on the tunnel and the Mac staying up.
Do not plan the morning around it.

---

## If the morning is bad, in order

1. **Patient keeps getting cut off mid-sentence** → Tier 3, `TAVUS_INTERRUPTIBILITY=low`.
   Test on one room before touching the other.
2. **Patient talks over the surgeon / replies too fast** → `TAVUS_TURN_PATIENCE` is already `high`,
   which is the documented maximum. There is nothing above it. This one is not fixable at the stand.
3. **Framing looks wrong** → Tier 1, `?framing=nudge`, then `?fill=` and `?ox=`.
4. **Key is eating her hair, or there is a green fringe** → Tier 1, `?sim=` and `?smooth=`.
5. **Consults dying for no reason** → it is the clicker's back button. Tier 2, `KEY_END`.
6. **Long silence before she speaks** → this is the 3.3–4.7 second first-word latency. **Nothing
   at the stand fixes it.** Brief the host to say "give her a second" before the first question.
   That is a people fix, not a settings fix, and it is the known weakest point of the experience.

## What you cannot change at the stand

- First-word latency.
- The patients' faces, voices or scripts. `personas.json` is pinned and a prompt change is Tier 4.
- Anything that would record a consult. `DISPLAY_MODE` and `KEEP_TRANSCRIPTS` are immutable from
  the overlay by design.
