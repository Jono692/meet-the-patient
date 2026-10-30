# Meet the Patient — working notes for Claude Code

This is the WTS prototype for the Alcon ANZ patient-selection activation at RANZCO 2026.
Two Claude sessions work on this job: Claude Code here on the Mac mini (hands-on: code, API,
recording), and Claude in the Cowork desktop app (strategy, brief, deck, client comms).
They cannot talk to each other. BRIEF.md is the shared memory between them.

## Rules

1. Read BRIEF.md first, every session. It is the single source of truth for the job.
2. When you finish a session, or find anything that changes the plan, append a dated section
   to the bottom of BRIEF.md under "## Session log". Keep it factual and short: what was
   verified, what changed, what is still open. The Cowork session reads it next.
3. Never put the API key or any secret in BRIEF.md. It lives in .env only.
4. Do not edit the sections above the session log unless correcting a fact you have verified;
   if you do, say so in the log.
5. Clinical values and lens mappings in personas.json are placeholders. Do not invent clinical
   authority; Alcon Medical Affairs owns that.
6. The video for the deck is a hook only. Do not add file panel, reveal card or nudge
   footage to it. Those stay hidden until the job is approved.

## Quick start

    npm start            (front end is prebuilt; only run npm run build after editing src/)
    http://localhost:3000
    http://localhost:3000/api/avatars        preset library
    http://localhost:3000/api/avatars?custom=1

Jono prefers Australian English, short direct answers, no jargon, and being told when he's wrong.
