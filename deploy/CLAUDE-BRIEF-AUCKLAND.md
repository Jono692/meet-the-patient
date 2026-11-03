# Brief for Claude Code on a show PC — Auckland, RANZCO 2026

Written 3 Nov 2026 by Claude Code on the Mac mini, which stays in Melbourne.
From bump-in on, this machine is the one Jono works with. Read this first.

---

## Who and what

"Meet the Patient" for **Alcon ANZ** at **RANZCO 2026**, NZICC Auckland.
Bump-in Fri 6 Nov, doors Sat 7 – Mon 9 Nov. Surgeons interview an AI patient to practise
patient-first IOL selection. Two consult rooms, one PC each, inside a wall cavity, 55" portrait
screens. A third ThinkStation travels as the spare.

**Jono is not a developer.** Click-level steps, plain Australian English, short answers, and tell
him when he is wrong. Give him one next action, not a list. On show hardware, boring and
reversible beats clever. If you hit a decision this brief does not cover, **stop and ask him**.

---

## The five rules that matter most

1. **Transcripts stay off and display mode stays `live`.** Alcon has promised surgeons nothing is
   recorded at the stand. A machine that records a room full of clinicians is the worst outcome on
   this job — worse than one that does not boot. Check any time with:
   `Invoke-RestMethod http://localhost:3000/api/config`
2. **Never stop anything until you have proved you can start it again.** Run the exact start
   command first (`& "C:\meet-the-patient\node\...\node.exe" -v`). A check that runs *after* the
   irreversible step is not a check. This cost a reboot on 3 Nov.
3. **Never stop by process name.** `Stop-Process -Name node` would also kill the tunnel or the
   kiosk. Use `Get-NetTCPConnection -LocalPort 3000 -State Listen` → `OwningProcess`.
4. **No secrets anywhere except `.env`.** Never print, log, copy or paste its contents, and never
   put a value from it in `BRIEF.md`.
5. **One stand page per PC.** Every open copy polls for the host's commands and the first to ask
   takes it, so a stray `localhost:3000` tab silently eats phone presses. Close any tab you open.

Also: clinical values in `personas.json` are placeholders owned by Alcon Medical Affairs. Do not
invent or correct any of them.

---

## How this machine is built

| | |
|---|---|
| App | `C:\meet-the-patient`, Node + a prebuilt front end, port 3000 |
| **Node** | **NOT on PATH** — it is unzipped inside the app folder at `C:\meet-the-patient\node\**\node.exe`. A bare `node` fails. |
| Boot | A logon task runs `C:\meet-the-patient\show-start.ps1`: waits for the network, starts the server, then **Edge** in kiosk (not Chrome — Chrome was blocked on ALCON 1) |
| Tunnel | `cloudflared` as a Windows service, config at `C:\cloudflared\config.yml` |
| Room A | `https://room-a.meetthepatient.com.au` · Room B `https://room-b.meetthepatient.com.au` |
| Rebuild | Only run `npm run build` after editing `src/` |

**The safe recovery for almost anything is a reboot.** The boot chain is proven and brings the
server, tunnel and kiosk up in the right order.

---

## Control at the show

The host drives **both** rooms from a web page on their phone: `https://room-a.meetthepatient.com.au/control/`
(or room-b, whichever is up). There is no clicker.

- Rooms are **numbered**: A = Room 1, B = Room 2, and Room 1 is always the top card whichever PC
  serves the page.
- **Both PCs must share the same `CONTROL_PIN`.** One room relays the host's commands to the other
  using its own PIN, so if they differ the buttons for the *other* room fail. Before 3 Nov they
  failed silently; now the phone says "The other room rejected the PIN."
- Buttons: pick a patient, Start, End, Skip, Close/Reopen stand.

---

## JOB 1 — run UPDATE-2 on both PCs (prepared and verified, not yet applied)

This is the first job of the trip and it is one command per PC. It carries three things:

**1. The prompt — and this is the one that matters.** The PCs need `personas.json`, and they
also need `providers\prompt.js`, which nobody had noticed. The `prompt.js` on both show PCs
predates 30 Oct and is **missing two whole blocks of the prompt**: *WHAT YOU WERE TOLD ABOUT
YOUR EYES* (the patient's own history and test results) and *WHAT MATTERS MOST TO YOU* (their
priorities and the forced choice). With it, a patient cannot tell a surgeon their scans and has
no priorities to be listened to — which is the whole activation. `personas.json` also carries
3 Nov's tightening: the AI question, no ratings or scores, a friend's lens described but never
how it turned out, medication named but never praised.

The prompt is built on the PC and sent to Tavus, not stored there. It is read **once at boot**,
so this needs an app restart — the script does it.

**2. Hard delete after every consult.** Each consult is now ended *and* hard deleted from Tavus
the moment it finishes, and the result is written to `events.jsonl` as `session-deleted` or
`session-not-deleted`. Measured against the live API on 3 Nov, not read off the docs: a plain
`DELETE` is a **soft** delete — the conversation disappears from the list and a `GET` on its id
still returns the whole record. `hard=true` is always sent.

**3. The hold screen.** The approved loop, which Jono signed off on 3 Nov. `app.js` now looks
for one clip at `/idle/hold.mp4` instead of three per-patient ones, so both files go together.

### How to run it

Over the tunnel, while the Mac is up — PowerShell as Administrator:

```powershell
$ErrorActionPreference="Stop";[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12;$f="$env:TEMP\UPDATE-2.ps1";iwr "https://demo.meetthepatient.com.au/update/UPDATE-2.ps1?v=$(Get-Random)" -OutFile $f -UseBasicParsing -Headers @{Accept="*/*"};if((Get-FileHash $f -Algorithm SHA256).Hash -ne "CB808A9A0DC4C324FD5BAD329E7EF693044AA3B50FE0E271A09BF1EDB5475F1E"){throw "UPDATE-2.ps1 does not match. Nothing has been run."};powershell -ExecutionPolicy Bypass -File $f
```

From the T7, with no internet — same script, local files:

```powershell
powershell -ExecutionPolicy Bypass -File "D:\MTP-SHOW-KIT\5 Update 2 - prompt, hard delete, hold screen\UPDATE-2.ps1" -FromFolder "D:\MTP-SHOW-KIT\5 Update 2 - prompt, hard delete, hold screen"
```

Check the drive letter. Both routes install the same eleven files and check every one against
its SHA-256 first; `SHA256SUMS.txt` sits beside them.

### What it does, in order

1. Finds Node and **proves it runs** — before anything is stopped or changed. (On 3 Nov v1 of
   the old script stopped the app and then could not start it, because it called a bare `node`.
   Node is not on PATH here. ALCON 1 needed a reboot.)
2. Fetches all eleven and checks every hash. One bad hash and nothing is touched.
3. Waits for a gap between consults — up to 10 minutes, then gives up rather than cutting in.
4. Backs the old files up to `deploy\backup-<timestamp>\`.
5. Installs.
6. Restarts the app only — by the process holding port 3000, so the tunnel and the kiosk live.
7. Checks the app is back, in `live` mode, transcripts off.
8. Pushes the prompt to Tavus and reads it back: *"all three patients match personas.json"*.
   This also warms the PAL cache, so the first surgeon is not waiting while one is built.
9. Opens a throwaway conversation, ends it, then asks Tavus for it again. HTTP 400
   `Invalid conversation_id` is the pass.

Steps 8 and 9 are checks, not installs. If one fails the update is still in and the app is
still running — read the screen and tell Jono, do not run the script again.

### Then reboot the PC

The kiosk browser still has the old stand page in memory and **F5 is deliberately swallowed**
by the app, so the hold screen will not appear until it reloads. Start > Power > Restart,
between consults. Then check the stand shows the woman, not a patient, and the phone still
drives it.

### Afterwards, on a show PC

```powershell
cd C:\meet-the-patient
.\node\node-v24.18.0-win-x64\node.exe tools\tavus-purge.js          # list what Tavus still holds
.\node\node-v24.18.0-win-x64\node.exe tools\tavus-delete-check.js   # prove deletion end to end
```

Check the version in that folder name — Node is unzipped inside the app folder and is
deliberately not on PATH, so a bare `node` fails.

Run `tavus-purge.js` at the end of each show day. **Expect an empty list.** Anything listed is
a consult whose transcript is still on Tavus's servers. `--delete` clears them and is
irrevocable, so ask Jono first.

---

## JOB 2 — Margaret is framed off-centre (not started)

On the portrait screen about half of Margaret's face is cut off on the right. Peter and Rami are
fine. Nobody saw it earlier because the screens were not rotated. It affects her **live** consults,
not just an idle clip, because Tavus renders her from the same off-centre footage.

The low-risk fix is a CSS nudge on the stand page — shift her video sideways so her face centres.
Her frame has spare picture to the right, so nothing is lost and it is one line to undo.
**Measured on the Mac: her face centre sits at about 62% across the 1280×720 frame.**
Do this on one PC, look at it on the rotated screen, then match the other. Retraining her face is
the other option and is **not** something to start days before a show.

---

## Settled — do not re-litigate

- **Tavus emotion control does nothing on Margaret.** Tried thoroughly on 3 Nov: `neutral` held
  for a whole consult changed neither her expression nor how much she moved, and `sadness` sent
  mid-consult did nothing for 18 seconds. The message reaches Tavus (the same channel delivered
  test lines she answered) and Tavus returns no error. Likely a limit of custom faces trained from
  video. Recordings in the repo under `media/emotion-test/`. **Do not retry it.** It is a question
  for Tavus, not a setting to tune.
- **No reshoot.** Rami does not smile, Margaret's idle loop is short. Both ship as they are.
- **No clicker.** Considered and dropped: if the internet is down there is no consult to control.
- **Page Down does not start a consult in the Edge kiosk** on one PC. Parked by Jono — the phone
  is the show control.

---

## Gotchas that have already bitten

- **Cloudflare rewrites HTML.** Anything served as HTML through `*.meetthepatient.com.au` gets an
  analytics beacon injected for browser-like requests, so the bytes differ from the origin. Never
  SHA-256 pin an HTML file fetched through it; transfer HTML as `.txt` and send `Accept: */*`.
  This is why `app.js` and `hold.mp4` above are safe to pin — neither is HTML.
- **The two PCs must not both run the same tunnel.** If a dead PC is still running `cloudflared`,
  Cloudflare sends about half the traffic to it. Power a failed machine off at the wall.
- **`deploy\start.ps1` in the repo is NOT the launcher this machine uses.** It was written for a
  bare PC with Node from winget and calls a bare `node`. The real one is `show-start.ps1`,
  written by SETUP, with the full Node path. Reading the wrong one cost a reboot on 3 Nov.

---

## If a PC dies: the spare

A third ThinkStation travels as the spare. **Build it at bump-in on Friday, prove it, then shut it
down under the bench** — a full build takes 20–30 minutes and you do not want to do that with
surgeons waiting.

A pre-built spare is configured for one room. To press it into service as the other room, run
`MAKE-ROOM-A.cmd` or `MAKE-ROOM-B.cmd` from the ALCON USB stick (also in
`MTP-SHOW-KIT\1 ALCON USB stick copy\`). It stages both rooms' tunnel credentials, rewrites
`ROOM_ID` and `PEER_URL` without touching the API key or PIN, points the tunnel at the right
hostname, installs the service and logon task, offers autologin, then reboots.

**That script has never been run.** Syntax-check it before you need it — one command, no execution:

```powershell
$e=$null; [System.Management.Automation.Language.Parser]::ParseFile("D:\MTP-SHOW-KIT\1 ALCON USB stick copy\BECOME-ROOM.ps1",[ref]$null,[ref]$e); $e
```

Empty output means it parses. Better still, build the spare on Friday and actually run it once.

---

## Also still open

- **Nobody has run a full consult end to end on show hardware.** Everything measured so far is a
  Mac. Do one on Friday: Start, a real conversation through the headset, End.
- **Ethernet → 5G failover and a mid-consult line pull are untested.**
- **Tavus data retention: our side is now done, theirs is not.** Transcripts are off three ways
  with a date cutoff from 6 Nov, and from UPDATE-2 every consult is hard deleted from Tavus as it
  ends, logged in `events.jsonl`. What we cannot prove is what Tavus keeps internally after a
  delete — that is a contract question Jono has open with Dylan, along with whether participant
  audio is retained. Do not claim more than "the record is gone from their API".
- **71 conversations from testing were still on the Tavus account** on 3 Nov, going back to
  22 Oct, transcripts included. `tools/tavus-purge.js --delete` clears them. Jono had not decided
  when this was written — ask, do not assume.
- **The display runs 4K at 29 Hz** on at least one PC; needs a DisplayPort cable or 1080p60.
- **`show-start.ps1` waits up to 5 minutes for a ping to 1.1.1.1**, so if the venue blocks ping the
  desktop may show at boot before the kiosk appears.

---

## What is on the T7

```
MTP-SHOW-KIT\
  1 ALCON USB stick copy\     full installer: setup, Node, Edge/Chrome, cloudflared,
                              tunnel credentials, MAKE-ROOM-A/B, BECOME-ROOM.ps1
  2 meet-the-patient repo\    the whole project as of 3 Nov, including src/ and BRIEF.md
  3 Footage\                  camera masters
  4 Docs\                     scope, proposal, scripts, BRIEF.md, this file
  5 Update 2 - prompt,        UPDATE-2.ps1 + the eleven files it installs + SHA256SUMS.txt
    hard delete, hold screen\ + README.txt. This is Job 1. Runs offline with -FromFolder.
  5 Hold screen update\       superseded by the folder above - app.js and hold.mp4 only,
                              without the prompt fix. Correct but incomplete.
```

**The T7 carries secrets** — `.env` in the repo copy and `env.show` on the stick copy, both
holding the Tavus API key. Treat the drive as sensitive; it is not just media.

---

## Reporting back

`BRIEF.md` is the shared memory between the Claude sessions on this job and the only way any of us
know what the others did. **Append a dated entry** when you finish anything: what you changed,
what you did not and why, and anything that did not match this brief. There are two copies —
`C:\meet-the-patient\BRIEF.md` on this machine and the one on the T7. Keep this machine's current;
the Mac's copy gets updated from the drive afterwards.

Be honest in it about what was tested and what was only read. Several problems on this job were
found because someone wrote down that they had *not* verified something.
