# Meet the Patient — prototype

Conversational AI patient for the Alcon Clareon patient-selection activation (RANZCO 2026).
A surgeon puts on a headset, picks a patient, takes the history, and states a recommendation.
The patient is a HeyGen LiveAvatar (FULL mode) driven by our persona prompt.

## Run it (Mac, normal Terminal)

```bash
cd meet-the-patient
cp .env.example .env        # then paste the LiveAvatar API key into .env
npm install
npm run dev                 # builds the front end and starts the server
```

Open http://localhost:3000 in Chrome. Allow the microphone. Pick a patient.

First run in **sandbox** (free, ~1 minute sessions, stock avatar) to prove the pipe:
set `LIVEAVATAR_SANDBOX=true` in `.env`. Then set it to `false` and pick real avatars.

## Choosing avatars and voices

List what your account can use:

```
http://localhost:3000/api/avatars
http://localhost:3000/api/voices
```

Put the ids in `.env`:

```
AVATAR_DEFAULT=<avatar id>
AVATAR_graeme=<avatar id>      # optional per-patient override
AVATAR_helen=...
AVATAR_priya=...
VOICE_graeme=<voice id>        # optional; required if the avatar is an image avatar
```

Cast for age. A 62-year-old truck driver played by a 28-year-old stock presenter kills the idea.

## How the demo works

- **Personas** live in `personas.json`. Edit the story, must-surface facts, clinical file and
  target lens there. The server creates a LiveAvatar Context per persona automatically and
  re-creates it whenever the prompt changes (cached in `.contexts.json`).
- **Clinical file**: if the surgeon says "scans", "chart", "results", "optometrist" etc., the
  file panel slides in. The patient's prompt tells them to say "it's on your screen".
  Operator button also available.
- **Recommendation reveal**: if the surgeon says something like "I'd recommend the Vivity"
  the reveal card shows what they chose, whether it aligns with the profile, and (on click)
  Alcon's rationale. Operator fallback buttons are in the transcript drawer.
- **Transcript** drawer shows both sides live. Useful for the deck and for tuning prompts.
- **Push-to-talk** (for a noisy floor): set `PUSH_TO_TALK=true` in `.env`. Not wired to a
  button in this prototype yet.

## Guardrails baked into the prompt

The patient never names a lens, never gives clinical advice, doesn't understand their own
numbers, and nudges the surgeon with "I forgot to mention…" only after several exchanges.
All clinical values and lens mappings in `personas.json` are PLACEHOLDERS for Alcon
Medical Affairs to replace.

## Costs

FULL mode uses 2 LiveAvatar credits per minute. Starter ($19) = 200 credits = ~100 minutes.
Sandbox sessions are free.

## Known gaps (prototype)

- Keyword triggers are simple regex on the surgeon's transcript. Good enough for a demo;
  the production build should use a function call from the LLM.
- No session-per-surgeon queueing, no stats screen, no consult summary print/email yet.
- Chrome recommended. Safari needs a click before audio will play.
