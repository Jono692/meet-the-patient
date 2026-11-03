# Meet the Patient — prototype

Conversational AI patient for the Alcon Clareon patient-selection activation (RANZCO 2026).
A surgeon puts on a headset, picks a patient, takes the history, and states a recommendation.

The patient is a **Tavus** CVI avatar driven by our persona prompt. LiveAvatar and Anam are
still in the tree behind the same interface and can be switched to, but the RANZCO build is
Tavus and everything below assumes it.

```
AVATAR_PROVIDER=tavus        # liveavatar | anam | tavus
```

**Set it explicitly.** With `AVATAR_PROVIDER` unset the code falls back to `liveavatar`, which
is not what the show runs on. `.env.example` has it set.

## Run it (Mac, normal Terminal)

```bash
cd meet-the-patient
cp .env.example .env        # then paste the Tavus API key into .env
npm install
npm start
```

You also need at least `TAVUS_FACE_DEFAULT` set, or starting a consult fails with "No face id" —
`.env.example` leaves the face ids commented out because they are account-specific. See below.

The front end ships prebuilt as `public/app.js`. **Only run `npm run build` after editing
`src/`** — `npm run dev` does both.

Open http://localhost:3000. Allow the microphone. Pick a patient. The operator's phone page
is at http://localhost:3000/control/ and wants `CONTROL_PIN`.

## Choosing faces and voices

Tavus renamed replicas to **faces** and personas to **PALs**. List what the account can use:

```
http://localhost:3000/api/avatars            preset library
http://localhost:3000/api/avatars?custom=1   our own trained faces
http://localhost:3000/api/voices
```

Put the ids in `.env`:

```
TAVUS_FACE_DEFAULT=<face id>
TAVUS_FACE_peter=<face id>      # per-patient, and what the show actually uses
TAVUS_FACE_margaret=...
TAVUS_FACE_rami=...
```

**Leave the voice unset unless you mean it.** With no `tts` layer Tavus uses the face's own
cloned voice, which is what we want. `TAVUS_VOICE_<persona>` overrides it with ElevenLabs or
Cartesia and needs `TAVUS_TTS_API_KEY`.

Cast for age. A 62-year-old truck driver played by a 28-year-old stock presenter kills the idea.

## How the demo works

- **Personas** live in `personas.json`: the story, must-surface facts, behaviour note, clinical
  file, priorities and target lens. `providers/prompt.js` renders them into one system prompt —
  it is the only place the characters are defined, and every provider gets the same text.
- **The prompt is built here, not stored at Tavus.** The server creates a PAL per persona and
  caches the id in `.tavus-pals.json` against a hash of the prompt, the greeting, the face and
  the layers, so editing `personas.json` or swapping a face makes a fresh PAL by itself.
  `server.js` reads `personas.json` **once at boot**, so a prompt change needs a restart.
  `node tools/tavus-sync.js` checks what Tavus is holding; `--push` updates it.
- **The patient tells you their own history.** Ask about scans, measurements, results or the
  health of their eyes and they answer out loud, in a patient's words. They never say it is on
  a screen or in a file, and never point at anything. They are the only source.
- **Clinical file panel** and **recommendation reveal card** are rehearsal aids and exist in
  `DISPLAY_MODE=test` only. In `live` they are off: nothing about the patient appears as text
  on the stand screen.
- **Transcript** drawer shows both sides live. Rehearsal only — see the recording rules below.
- **Every consult is hard deleted from Tavus as it ends.** `tools/tavus-delete-check.js` proves
  it on a machine; `tools/tavus-purge.js` lists anything left on the account.

## The show configuration

These are what make it a stand rather than a demo. All in `.env`:

```
DISPLAY_MODE=live               # live | test. live hides the file panel, reveal and transcript
KEEP_TRANSCRIPTS=false          # MUST be false at the stand
TRANSCRIPTS_CUTOFF=2026-11-06   # a date after which transcripts stop regardless
ROOM_ID=A                       # A or B, the two consult rooms
ROTATION=margaret,peter,rami    # the order the stand cycles patients
SHOW_PERSONAS=peter             # restricts who is reachable at all; unset means all three
CONTROL_PIN=...                 # the phone page. The SAME pin on both PCs
PEER_URL=...                    # the other room, so one phone drives both
CHROMA_KEY=true                 # key the patient onto BACKGROUND_COLOR (#003595)
SESSION_BUDGET=40               # minutes, for /api/budget
```

`DISPLAY_MODE` and `KEEP_TRANSCRIPTS` are deliberately **not** overridable from
`config.local.json` — Alcon promised nothing is recorded, and a local file must not be able to
undo that.

## Guardrails baked into the prompt

The patient never names a lens, implant, brand or product; never gives clinical advice; never
rates, scores or recommends anyone or anything; describes a friend's lens in plain words but
never how it turned out; and nudges the surgeon with "I forgot to mention…" only after several
exchanges. Asked outright whether they are an AI they admit the demo in one light line and
carry on as the patient, without describing the setup.

All clinical values and lens mappings in `personas.json` are PLACEHOLDERS for Alcon Medical
Affairs to replace. `tools/redteam/` is the harness that tests the guardrails.

## Costs

Tavus bills conversation minutes against the account — check the Tavus dashboard for the plan
and the rate rather than trusting a number here. `max_call_duration` is capped at
`TAVUS_MAX_CALL_SECONDS` (default 600) well short of their one-hour default, and a conversation
is ended as soon as we leave the room rather than idling on the clock.

`SESSION_BUDGET` is a count of **consults, not minutes**: once that many sessions have started,
`/api/session` refuses the next one. `/api/budget` reports spent and remaining.

## Known gaps (prototype)

- Keyword triggers for the reveal card are simple regex on the surgeon's transcript. Fine for a
  rehearsal aid; a production build should use a function call from the LLM.
- No session-per-surgeon queueing, no stats screen, no consult summary print/email.
- `PUSH_TO_TALK` and `LIVEAVATAR_SANDBOX` are LiveAvatar-only settings and do nothing on Tavus.
- The Mac runs Chrome; the show PCs run Edge in kiosk mode, where F5 is deliberately swallowed
  so a stray clicker press cannot reload mid-consult. Safari needs a click before audio plays.

## Working on this

`CLAUDE.md` has the rules for Claude Code sessions. `BRIEF.md` is the single source of truth for
the job and the shared memory between the sessions working on it — read it first, and append to
its session log when you finish. `deploy/CLAUDE-BRIEF-AUCKLAND.md` is the brief for the show PCs.
