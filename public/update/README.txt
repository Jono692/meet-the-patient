MEET THE PATIENT - UPDATE 2
Prepared on the Mac mini, 3 Nov 2026. Everything here is verified against SHA256SUMS.txt
and was checked byte-for-byte through the tunnel the same way the PCs will fetch it.

WHAT IT CHANGES

  The prompt            personas.json AND providers\prompt.js. Both. The prompt.js on the
                        show PCs is older than the Mac's and is missing two whole blocks:
                        the patient's own eye history and test results, and what matters
                        most to them. Without it the patients cannot tell a surgeon their
                        scans and have no priorities to be listened to, which is the
                        activation. personas.json adds 3 Nov's tightening: the AI question,
                        no ratings or scores, a friend's lens described but never how it
                        went, medication named but never praised.

  Hard delete           providers\tavus.js and server.js. Every consult is now ended AND
                        hard deleted from Tavus the moment it finishes. The outcome goes
                        into events.jsonl as session-deleted or session-not-deleted.

  The hold screen       public\app.js and public\idle\hold.mp4. The approved loop. app.js
                        looks for one clip at /idle/hold.mp4 instead of three per-patient
                        ones, so both files go together or neither does.

  Control page + logo   Already on both show PCs. In here for a SPARE built from the USB
                        stick, which has neither.

  tools\                tavus-sync.js         push the prompt to Tavus, read it back
                        tavus-delete-check.js prove a consult really is deleted, on this PC
                        tavus-purge.js        list what is left on the account; --delete clears it

HOW TO APPLY IT

  Over the tunnel, while the Mac is up - one line in PowerShell as Administrator:

    $ErrorActionPreference="Stop";[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12;$f="$env:TEMP\UPDATE-2.ps1";iwr "https://demo.meetthepatient.com.au/update/UPDATE-2.ps1?v=$(Get-Random)" -OutFile $f -UseBasicParsing -Headers @{Accept="*/*"};if((Get-FileHash $f -Algorithm SHA256).Hash -ne "CB808A9A0DC4C324FD5BAD329E7EF693044AA3B50FE0E271A09BF1EDB5475F1E"){throw "UPDATE-2.ps1 does not match. Nothing has been run."};powershell -ExecutionPolicy Bypass -File $f

  From this folder on the T7, with no internet - same script, local files:

    powershell -ExecutionPolicy Bypass -File "<this folder>\UPDATE-2.ps1" -FromFolder "<this folder>"

  Either way the script finds and runs Node BEFORE it stops or changes anything, checks
  every file's SHA-256 before touching the PC, waits for a gap between consults, backs the
  old files up, installs, restarts the app, then proves the prompt reached Tavus and that a
  consult really is deleted.

AND THEN REBOOT THE PC. The kiosk browser is still showing the old stand page from memory
and F5 is swallowed by the app, so the hold screen will not appear until it reloads.

THE ?v= ON THAT URL MATTERS. Cloudflare caches this folder for four hours, 404s included,
so without it a PC can be handed a stale answer or an error page wearing a .js name.

NOT IN HERE: the Margaret reframe (Job 2). Still to do, on the PCs, by eye on the rotated
screen. See 4 Docs\CLAUDE-BRIEF-AUCKLAND.md.
