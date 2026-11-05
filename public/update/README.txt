MEET THE PATIENT - UPDATE 4
Prepared on the Mac mini, 5 Nov 2026. Everything here is verified against SHA256SUMS.txt
and was checked byte-for-byte through the tunnel the same way the PCs will fetch it.

UPDATE 4 REPLACES UPDATE 3, WHICH REPLACED UPDATE 2. RUN UPDATE-4.ps1 AND NOTHING ELSE.
UPDATE-3.ps1 and UPDATE-2.ps1 have been withdrawn from this folder on purpose.

ONE file differs from UPDATE 3: public\app.js.

  public\app.js         PORTRAIT FRAMING. The Tavus feed is 1280x720 landscape and their
                        API has no aspect setting, so object-fit:cover on the stand's
                        1080x1920 screen showed only 31.6% of the frame's width: a head
                        edge to edge, and for Margaret, whose head centre sits at 61.4%
                        across instead of the middle, the right of her face off the edge.
                        Head centres measured 5 Nov off the Tavus upload crops - Peter
                        .542, Margaret .614, Rami .489. The page now draws the whole frame
                        at 67.5% of the screen height, sat on the bottom edge, face
                        centred, with the chroma key's own #003595 around it. Landscape
                        screens are untouched, so the Mac and Alcon's demo link do not
                        change. Fallbacks live on the kiosk URL and need no rebuild:
                        ?framing=nudge, ?framing=off, ?fill=, ?ox=.

If UPDATE-3 has already been run on a PC, run UPDATE-4 over the top of it. Same install,
idempotent: it replaces app.js and re-verifies the other twelve.

CARRIED OVER FROM UPDATE 3. Two differences from UPDATE 2:

  personas.json         Caleb Bartolo's changes of 4 November, after he tested Margaret
                        and Rami. Margaret and Rami now name the cataract diagnosis when
                        the surgeon asks what has brought them in, as Peter already did.
                        Rami's file reads "no visual field loss" where it read "some mild
                        visual field loss, stable" - Alcon's clinical call, changed in all
                        three places it appeared. Rami also says the ophthalmologist who
                        looks after his glaucoma does not do cataract surgery, which is
                        why he has been referred on. Not done: glasses on Rami's avatar.
                        That face is the actor filmed on 20 October and the only way to
                        add glasses is to film him again. Caleb said no worries if not.

  step order            The prompt push now runs BEFORE the app restart instead of after.
                        The app reads the PAL cache once at boot, so a push into a running
                        app wrote entries nothing would re-read: the first consult then
                        built its own duplicate PAL and overwrote them. Measured on the Mac
                        on 4 Nov. The prompt was right either way - it is the same
                        personas.json - but the push was doing nothing.

If you are holding the T7's "5 Update 2" folder, its personas.json is the OLD one. Running
UPDATE-4.ps1 with -FromFolder against it will stop on that hash and change nothing, which
is the check working. Refresh the folder from iCloud first, or use the tunnel.

WHAT IT CHANGES

  The prompt            personas.json AND providers\prompt.js. Both. The prompt.js on the
                        show PCs is older than the Mac's and is missing two whole blocks:
                        the patient's own eye history and test results, and what matters
                        most to them. Without it the patients cannot tell a surgeon their
                        scans and have no priorities to be listened to, which is the
                        activation. personas.json also carries 3 Nov's tightening: the AI
                        question, no ratings or scores, a friend's lens described but never
                        how it went, medication named but never praised.

  Hard delete           providers\tavus.js and server.js. Every consult is now ended AND
                        hard deleted from Tavus the moment it finishes. The outcome goes
                        into events.jsonl as session-deleted or session-not-deleted.

  The hold screen       public\app.js and public\idle\hold.mp4. The approved loop. app.js
                        looks for one clip at /idle/hold.mp4 instead of three per-patient
                        ones, so both files go together or neither does.

  Control page + logo   Already on both show PCs. In here for a SPARE built from the USB
                        stick, which has neither.

  CLAUDE.md + the       The brief for Claude Code ON A SHOW PC, and a copy of the Auckland
  Auckland brief        brief beside it at deploy\CLAUDE-BRIEF-AUCKLAND.md. The CLAUDE.md
                        these PCs came with is the Mac's: it says Claude Code is on the Mac
                        mini and tells it to run "npm start", which here would start a second
                        app fighting the running one for port 3000.

  tools\                tavus-sync.js         push the prompt to Tavus, read it back
                        tavus-delete-check.js prove a consult really is deleted, on this PC
                        tavus-purge.js        list what is left on the account; --delete clears it

HOW TO APPLY IT

  Over the tunnel, while the Mac is up - one line in PowerShell as Administrator. This
  checks the script's own fingerprint and refuses to run it if it does not match:

    $ErrorActionPreference="Stop";[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12;$f="$env:TEMP\UPDATE-3.ps1";iwr "https://demo.meetthepatient.com.au/update/UPDATE-3.ps1?v=$(Get-Random)" -OutFile $f -UseBasicParsing -Headers @{Accept="*/*"};if((Get-FileHash $f -Algorithm SHA256).Hash -ne "88620627073215F3BFDD2C4E5F6F88BC0952BC4FE868E20273A3CA67E2053488"){throw "UPDATE-3.ps1 does not match. Nothing has been run."};powershell -ExecutionPolicy Bypass -File $f

  From this folder on the T7, with no internet - same script, local files. Only after the
  folder has been refreshed with the new personas.json and brief:

    powershell -ExecutionPolicy Bypass -File "<this folder>\UPDATE-3.ps1" -FromFolder "<this folder>"

  The -FromFolder route needs no fingerprint typed in by hand: the script checks all
  thirteen files against their own SHA-256 as it copies them. Either way it finds and runs
  Node BEFORE it stops or changes anything, checks every file's SHA-256 before touching the
  PC, waits for a gap between consults, backs the old files up, installs, pushes the prompt
  to Tavus, restarts the app, then proves the app is back and that a consult really is
  deleted.

AND THEN REBOOT THE PC. The kiosk browser is still showing the old stand page from memory
and F5 is swallowed by the app, so the hold screen will not appear until it reloads.

THE ?v= ON THAT URL MATTERS. Cloudflare caches this folder for four hours, 404s included,
so without it a PC can be handed a stale answer or an error page wearing a .js name.

NOT IN HERE: the Margaret reframe (Job 2). Still to do, on the PCs, by eye on the rotated
screen. See 4 Docs\CLAUDE-BRIEF-AUCKLAND.md.
