MEET THE PATIENT - UPDATE 8
Prepared on the Mac mini, 7 Nov 2026, during show day 1 at RANZCO. Every file here is
verified against SHA256SUMS.txt and checked byte-for-byte through the tunnel the same way
the PCs fetch it.

UPDATE 8 REPLACES UPDATE 7. RUN UPDATE-8.ps1 AND NOTHING ELSE. UPDATE-7.ps1 has been
withdrawn from this folder on purpose. Idempotent over 7, 6, 5 and 4.

THREE files differ from UPDATE 7, and the script now also edits two lines of .env and
pins three hostnames in the hosts file. app.js is UNCHANGED, so NO REBOOT this time.

  personas.json         THE PROMPT LEAK. shared_rules, which every patient gets, carried
                        Peter's actual topography result as a worked example of how to
                        describe your scans. On the first show morning Margaret recited
                        it to a surgeon. The example is gone; the instruction now says
                        "only ever describe YOUR OWN results from the list below". One
                        other example line ("once I can see the road at night", Peter's
                        framing) reworded. NO clinical value added or changed anywhere.
                        Patched live on Tavus at 8.11am the same morning; this makes the
                        shipped file match so the next PAL build cannot bring it back.

  tools\tavus-sync.js   LEAK CHECK. Before pushing, builds every patient's prompt and
                        looks in it for three-word runs from the OTHER patients' clinical
                        files. Refuses with exit code 3 and names the leak. Tested on the
                        Mac: passes the new personas.json, refuses the old one with
                        "margaret's prompt contains peter's 'inferior steepening worse'".

  server.js             ORPHAN SWEEP. Logs each conversation id the moment it is created
                        (session-created). On boot, any conversation created but never
                        deleted is ended and hard deleted, and logged as sweep-deleted.
                        Closes the one gap in the no-recording promise: a PC rebooted
                        mid-consult never reaches session-end. Happened on Room B at
                        18:42 UTC on 7 Nov. Tested on the Mac on a spare port.

  .env (two lines)      TAVUS_MAX_CALL_SECONDS=600    consults 7 min -> 10 min (Jono)
                        TAVUS_INTERRUPTIBILITY=low    written if missing
                        Matched as whole lines. Nothing else in .env is read, printed or
                        rewritten; .env is backed up to the backup folder first as _env.

  hosts (three lines)   demo, room-a, room-b .meetthepatient.com.au -> 104.21.96.126,
                        each only if not already present. The venue intercepts port 53
                        and answers "no such domain". With all three pinned, the host
                        page in one room can show the other room again.

  hold.mp4              No longer downloaded when the copy on the PC already matches its
                        fingerprint. Still hashed. Saves 16 MB on venue internet.

HOW TO APPLY IT - the double-click file is the easy way:

  Edge, go to demo.meetthepatient.com.au/UPDATE-8.bat, Keep, double-click, accept the
  administrator prompt. It checks the script's fingerprint before running it.

  Or the one line in PowerShell as Administrator:

    $ErrorActionPreference="Stop";[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12;$f="$env:TEMP\UPDATE-8.ps1";iwr "https://demo.meetthepatient.com.au/update/UPDATE-8.ps1?v=$(Get-Random)" -OutFile $f -UseBasicParsing -Headers @{Accept="*/*"};if((Get-FileHash $f -Algorithm SHA256).Hash -ne "B6AF8C02CC8B76FB5050EF3EDFCB7C4C1F30DDE5FFE8DAD94EBD6FFB5CA2D1BA"){throw "UPDATE-8.ps1 does not match. Nothing has been run."};powershell -ExecutionPolicy Bypass -File $f

  From a folder with no internet:

    powershell -ExecutionPolicy Bypass -File "<folder>\UPDATE-8.ps1" -FromFolder "<folder>"

  The script must run as Administrator (the hosts file needs it) and refuses otherwise
  before changing anything. It waits for a gap between consults, backs everything up,
  installs, sets .env, pins hosts, pushes the prompt to Tavus (leak check first),
  restarts the app, proves it is back, proves the other room is reachable, and proves a
  consult is hard deleted. Watch STEP 6 and STEP 8.

NO REBOOT. The stand page in the kiosk is the same app.js; the server restarted itself.

THE ?v= ON THAT URL MATTERS. Cloudflare caches this folder for four hours, 404s included.

NOT MACHINE-PARSED. The Mac cannot run PowerShell (its command-line tools need a sudo
update), so UPDATE-8.ps1 was reviewed by eye, not parsed. A syntax error shows up as
PowerShell refusing to run the file at all, before step 1, with nothing changed.
