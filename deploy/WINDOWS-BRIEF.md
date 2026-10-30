# Brief for the Claude session on the Windows ThinkStation

You are on the Lenovo ThinkStation P330 that has run **Hello Operator** through three live
events (Sydney, Auckland, Melbourne 2026). It is now also the **spare** for the Alcon
"Meet the Patient" activation at RANZCO 2026, Auckland, 7–9 Nov.

**This machine is not blank and it is not yours to reshape.** A separate briefing from the
Cowork session covers the Hello Operator install, its hard rules and its current state.
Read that first, and treat its rules as binding here too. In particular:

- **Never read, print, log, echo or copy `config.json`.** It holds secrets. Tuning goes in
  `config.local.json`.
- **Nothing in the Hello Operator live folder is deleted.** Archive or rename.
- **`calls.log` is append-only.** It is the record of three events.
- **Back up beside the original before editing**, and keep every change reversible.
- Code moves as verified zips, never pasted text. A `server.js` once arrived 3,689 bytes
  short through a cloud drive.

Then read `BRIEF.md` in this project's root. That is the shared memory between the Claude
sessions on the Alcon job, and it is the only way any of us know what the others did.
Append a dated entry to its session log when you finish.

## The job

Put the Alcon stack on this machine so it can be swapped into either consult room in
Auckland without a rebuild — **without disturbing Hello Operator.**

**The two stacks never run at the same time.** That is the design, not a coincidence, and
it is what keeps this simple: one machine, two installs, one of them running. It also
means the Alcon install here must be **identical to the two show machines, port 3000 and
all.** A spare that differs from the primaries is not a spare.

## DO NOT run deploy\install.ps1 on this machine

It was written for a bare show PC. On this one it would:

- register a logon task that launches a server, a tunnel and Chrome in kiosk, racing a
  boot chain that already works — **this is the real danger.** Two stacks auto-starting
  is the one way they end up running at once;
- run `cloudflared tunnel login`, which **overwrites `%USERPROFILE%\.cloudflared\cert.pem`**
  and puts the `hook.autodeskausvoiceai.com` tunnel at risk;
- apply power and registry lockdown to a machine whose boot behaviour is already proven.

Read it for what it does, then do the equivalent by hand, in the order below.

## Do this instead

**1. Put the Alcon app in its own folder**, `C:\meet-the-patient`, on **port 3000**,
matching the two show machines exactly. Do not move it to a spare port to avoid a clash:
the stacks do not run together, and a spare that differs from the primaries stops being a
drop-in replacement. Hello Operator stays where it is, untouched.

**2. Build it:** `npm ci` then `npm run build` in that folder. `.env` comes from
`deploy\secrets.env` on the USB stick plus the template in `install.ps1` — copy the values
across by hand. `secrets.env` is gitignored and stays that way: never print it, never
commit it, never put a value from it in `BRIEF.md`.

**3. Do not touch the Cloudflare cert.** Do not run `cloudflared tunnel login` here. If
this machine ever needs its own tunnel, copy the credentials JSON for the Alcon tunnel
from one of the show machines and run it with an explicit `--credentials-file`. Ask Jono
before doing even that.

**4. Leave the boot chain alone for now.** Hello Operator must still come up on power-up
with no keyboard. Do not add a second startup entry that races it.

**5. Propose the switch, do not build it.** Since only one stack may run, the boot
chain has to choose. The clean way is a single startup entry that reads a flag file — say
`C:\stand-mode.txt` containing `hello` or `alcon` — and launches the matching stack,
defaulting to `hello` if the file is missing or unreadable. The swap then becomes a
one-line edit and a reboot, and it is fully reversible.

**Do not implement it without Jono's say-so.** It changes the boot chain on hardware that
has survived three events, and that is exactly the kind of clever that bites. Until he
agrees, start the Alcon stack by hand for testing and leave the boot chain as it is.

## Verify, every time

After any change, check all three still work:

- Hello Operator's server process is up
- its tunnel answers at `hook.autodeskausvoiceai.com`
- the Claude desktop app is running — that is the Cowork session's hands on this machine

If any of the three is down, put it back before doing anything else.

**Hello Operator listens on 8080, so there is no port clash with the Alcon app on 3000.**
Do not go hunting for a phantom listener. Stop it anyway before bench-testing Alcon — one
stack at a time is the discipline that protects the tunnel, the boot chain and the
no-recording assurance, not a workaround for a collision.

**Stopping and restarting Hello Operator:**

- Stop: close its Node console window.
- Start: double-click `start-server.bat` in the live folder.
- **Nothing auto-restarts it.** On 9 Oct that window was closed by accident and the server
  was dead for hours before anyone noticed. If you stop it, you own putting it back.
- After restarting, **confirm the startup line appears in `calls.log`.** That is the proof
  it actually came up, not just that a window opened.

Then start the Alcon app by hand and check `http://localhost:3000/api/config` reports:

```
display mode  live
transcripts   off
```

**Both of those matter more than anything cosmetic.** Alcon has promised surgeons that
nothing is recorded at the stand. A machine that records a room full of clinicians is the
worst outcome on this job, worse than one that does not boot.

Then look at the screen. In LIVE the only thing that may appear is the patient: an idle
loop between consults, the live avatar during one. No clinical file, no transcript, no
name card, no operator buttons, no cursor. Anything else is a bug worth stopping for.

## Report back

Append to `BRIEF.md`, dated: what you installed and where, what you did **not** do and
why, and anything on the machine that did not match either briefing. List
files touched with their byte sizes and where the originals went, so the Cowork session
can pick it up remotely.

If you hit a decision neither briefing covers, **stop and ask Jono** rather than
improvising. On show hardware, boring and reversible beats clever.

**When you have finished and logged to `BRIEF.md`, tell Jono.** The Cowork session will
then verify the Hello Operator trio from its end — server, tunnel, bridge — as an
independent check. Your own verification is not the last word on that stack.

## Context you may want

- The Alcon app is a Node server plus a prebuilt front end. Only run `npm run build` after
  editing `src/`.
- Control at the show is a web page on the host's phone over a Cloudflare tunnel. There is
  no clicker — considered and dropped, because if the internet is down there is no consult
  to control anyway.
- `DISPLAY_MODE=test` restores the rehearsal screen with the clinical file, reveal card and
  transcript. Useful for checking the app works. **Never leave a show machine in test.**
- Clinical values in `personas.json` are placeholders owned by Alcon Medical Affairs. Do
  not invent or correct any of them.
- Jono is not a developer. Click-level instructions, plain Australian English, no jargon.
