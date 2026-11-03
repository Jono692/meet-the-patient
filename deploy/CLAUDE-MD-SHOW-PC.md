# Meet the Patient — working notes for Claude Code ON A SHOW PC

You are on one of the two show PCs at RANZCO 2026, NZICC Auckland, not on the Mac mini.
This machine runs a live activation in front of surgeons. Read
`deploy/CLAUDE-BRIEF-AUCKLAND.md` before you do anything — it is the brief for this machine,
and it is more specific than this file.

A room is either live with a surgeon in front of it or it is idle. Everything below follows
from that.

## Rules

1. Read `deploy/CLAUDE-BRIEF-AUCKLAND.md` first, then `BRIEF.md` for the history of the job.
2. **Never restart, stop or change anything while a consult is running.** Check first:
   `Invoke-RestMethod http://localhost:3000/api/room` — if `state` is `live`, wait.
3. **Never stop something until you have proved you can start it again.** On 3 Nov a script
   stopped the app and could not restart it, because Node is NOT on PATH here, and ALCON 1
   needed a reboot three days before the show. Find and run `node.exe` first, every time.
4. Never put the API key or any secret in `BRIEF.md`, in a note, or on screen. It lives in
   `.env` in this folder only.
5. Clinical values and lens mappings in `personas.json` are placeholders. Do not invent
   clinical authority; Alcon Medical Affairs owns that.
6. Record what you did in `BRIEF.md` under `## Session log`, dated, factual, short. Jono
   carries that file between machines; it is the only channel back to the other sessions.

## How this machine actually works

    the app          a Node process listening on 3000, started by show-start.ps1
    Node             C:\meet-the-patient\node\node-v24.18.0-win-x64\node.exe
                     deliberately NOT on PATH - check the version in the folder name
    the browser      Edge in kiosk mode, NOT Chrome. F5 is swallowed by the app on purpose,
                     so a stray clicker press cannot reload mid-consult. To make the kiosk
                     pick up a new public\app.js you must REBOOT the PC.
    the tunnel       cloudflared as a Windows service: room-a or room-b .meetthepatient.com.au
    the phone page   http://localhost:3000/control/ - drives both rooms, one shared PIN
    the launcher     show-start.ps1. NOT deploy\start.ps1, which is obsolete and misleading.

**Do not run `npm start`.** The app is already running as a service; a second copy would
fight it for port 3000. There is no npm here and no reason to build — the front end ships
prebuilt as `public\app.js`.

To restart the app on purpose, drop a `restart.flag` in this folder: the app actions it
**between** consults, never during one.

## Checking your work

    node tools\tavus-sync.js            is the prompt Tavus holds the same as personas.json?
    node tools\tavus-delete-check.js    is a consult really deleted afterwards? (opens one)
    node tools\tavus-purge.js           anything left on the Tavus account? expect nothing
    Get-Content events.jsonl -Tail 20   what this room has actually done

Run `tavus-purge.js` at the end of each show day and expect "Nothing on the account."
Anything listed is a consult whose transcript is still on Tavus's servers. `--delete` clears
them and is irrevocable — ask Jono.

Jono prefers Australian English, short direct answers, no jargon, and being told when he's
wrong. He is on the stand and busy: give him the next action, not the backlog.
