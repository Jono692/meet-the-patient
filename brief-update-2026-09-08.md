# Alcon RANZCO 2026 — brief update, Mon 8 Sep 2026 (evening)

Source: Claude Code session on Jono's Mac mini, ~18:00–18:35 AEST.
Everything below was verified live against the LiveAvatar API and the running
prototype, not inferred. Fold into the master brief.

---

## 1. Correction to carry forward

The brief's note that "the LiveAvatar API is unreachable from Claude's
sandboxes" is true of **Claude chat only**. Claude Code running on the Mac mini
reaches the API normally. All API testing, prototype runs and recording prep
happen there. Chat keeps the brief, the deck narrative and the commercial
framing.

## 2. Findings (verified 8 Sep)

1. **`/api/avatars` returned nothing.** `server.js` proxied `/v1/avatars`, which
   is the account's **custom** avatar list — empty on Starter. The preset
   library lives at `/v1/avatars/public`: **83 entries**. Fixed (see §3).
2. **Non-sandbox preset avatars work on Starter.** A session token minted
   successfully against a public avatar id. Confirmed twice.
3. **Sandbox mode forces avatar "Wayne"** — 720p (everything else in the library
   is 1080p) and roughly a one-minute cap. Unusable for a 60–90 second clip.
   Sandbox is now off.
4. **Casting gap — the significant finding.** The 83 presets are about 20
   distinct people, all 25–45, corporate, in suits, in offices:
   - **Graeme, 68, retired truckie** — the only grey-haired man is
     "Dexter Lawyer", in a three-piece suit in a boardroom. Age reads right,
     nothing else does.
   - **Helen, 63, bookkeeper and golfer** — "Ann Therapist" is the closest thing
     to a patient in the whole library: reads fifties, cream sweater, warm room.
   - **Priya, 57** — there is **no South Asian woman in the preset library at
     all**. Not a near miss; she is not there.

## 3. Changes made to the Mac copy (all verified)

| File | Change | Verification |
|---|---|---|
| `server.js` | Avatars endpoint defaults to the public library; `?custom=1` for the custom list | Returns 83 / 0 respectively |
| `.env` | `LIVEAVATAR_SANDBOX=false`; avatar casting for all three personas | Helen mints a non-sandbox token; her context auto-created and cached |
| `public/index.html` | **Clean capture mode** on `?clean=1` — hides operator controls and pins the clinical file panel, reveal card and transcript off-screen, so a stray keyword cannot expose them mid-take. Header survives until the consult starts so the mic can still be chosen | With `.open` forced on every element: file panel at x=1300 on a 1280 viewport, reveal at y=847 on a 720 viewport, controls and drawer `display:none`, header hidden, video full height with name card only |
| `public/index.html` | Esc ends the consult, M mutes (the visible buttons are hidden while filming) | Inert on the picker, both fire once a consult is running |

Clean mode was done in CSS rather than `client.js`, so **`public/app.js` was not
rebuilt** and the bundle is byte-identical to this afternoon's working version.
It is also the stronger guarantee: even if the keyword regex fires, there is
nothing on screen to see.

### Avatar casting now in `.env`

| Persona | Avatar | Avatar id | Verdict |
|---|---|---|---|
| Helen, 63 | Ann Therapist | `513fd1b7-7ef9-466d-9af2-344e51eeb833` | Best available. Reads fifties, sweater, warm room |
| Graeme, 68 | Dexter Lawyer | `0930fd59-c8ad-434d-ad53-b391a1768720` | Age right, wardrobe wrong. Crop tight if used |
| Priya, 57 | Marianne | `bf00036b-558a-44b5-b2ff-1e3cec0f4ceb` | **Known wrong.** Reads mid-thirties, not South Asian. Do not put on screen |

## 4. Tomorrow (Wed 9 Sep) — recording the hook video

Run in a normal Terminal, not through Claude, because Chrome needs real mic
access:

```
cd ~/meet-the-patient && npm start
```

Chrome to `http://localhost:3000/?clean=1` → choose the mic in the header →
click **Helen**. Header disappears, face goes full-frame, name card bottom-left.
QuickTime → New Screen Recording; turn **off** "Show Mouse Clicks in Recording".
Esc to end the take.

Per Jono: the clip is a patient talking naturally and nothing else. The clinical
file panel, the recommendation reveal and the nudge stay held back until the job
is signed. Clean mode now enforces that mechanically.

**Watch the credits.** Starter is 200 credits/month, FULL mode burns 2/minute —
about 100 minutes of session time for the month. Press Esc between takes;
`keepAlive` pings every two minutes and will hold a session open to the
five-minute cap.

## 5. Deck framing — agreed position

Custom avatars are **not** a cost line that had to be added. They are a creative
asset Alcon owns and reuses at every congress after RANZCO. Stock avatars are
what every competitor will show up with in three years; three patients recorded
from real people, cast for age and background, are not.

Three things to nail down so that survives Alcon's legal and procurement:

1. **Be precise about "owns", and say it first.** Alcon owns the source
   recordings and the likeness rights. The avatar itself is vendor-hosted at
   US$49/month each — let the subscription lapse and it stops rendering. The
   durable asset is the three two-minute masters plus the releases; the avatar
   is a renewable rendering of them. This also settles who should hold the
   LiveAvatar account.
2. **Write the releases for reuse on day one.** Indefinite term, all
   territories, explicit consent to synthetic/AI reproduction, Alcon as
   licensee. On a RANZCO-only release the reuse promise is hollow and the
   recordings have to be redone. This is a recording-day decision.
3. **It answers an open question and turns it into an upsell.** "Does the build
   travel after RANZCO?" becomes yes — and if the patients travel, the
   conversation design travels with them, which is recurring WTS revenue rather
   than a one-off $50K. It also defends Option A: an owned library makes three
   personas a starting set, not a fixed scope.

**Use the casting gap as the demo.** Ann-as-Helen is a therapist in her fifties
playing a 63-year-old golfer and it reads slightly off. Don't hide that — show
the stock version, then say what it cannot do. That is a stronger reveal than a
polished stock demo, and it fits the drip strategy: video hooks, casting gap
justifies the recordings, file panel and reveal stay back.

## 6. Version parity

- **Drive:** `meet-the-patient.zip` v0.1.1 (pushed 18:23, includes the avatars
  fix).
- **Mac:** v0.1.1 equivalent plus clean capture mode and the avatar casting.
- Not byte-identical — the avatars fix was written independently in each copy.
- **A re-zip to v0.1.2 must exclude `.env`**: it now holds the API key alongside
  the avatar ids.

## 7. Open items unchanged

Clinical sign-off owner and turnaround at Alcon · whether the three personas map
one-to-one to the three lenses or one is deliberately ambiguous · deck branding
(WTS or TSA) · GST and enclosure ownership · ~2×2m consult nook in the builder
brief · Australian data residency for LiveAvatar · decisions made after the
budget discussion on the 8 Sep call.

**Next deliverable: deck to Polly, Friday 11 Sep.**
