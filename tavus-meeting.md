# Tavus call — Fri 30 Oct 2026, 10:30 Melbourne

Dylan Wood (dylan@tavus.io), 30 min. Reordered 4pm Thu 29 Oct: decisions first.

**Calendar.** Bump-in Fri 6 Nov, doors Sat 7 Nov, Auckland. Jono works the weekend,
Mon 2 and Tue 3 Nov, flies Wed 4. Tavus are US-based so the Melbourne Cup shutdown does
not affect them — anything they owe us can still land Monday.

**Decided, so don't reopen it:** no reshoot. Rami does not smile, Margaret's idle loop is
short, both ship as they are.

---

## 1 — Blocks a decision. Get these or the call was wasted.

**1. Data residency, and will you sign a DPA.** Where does a conversation actually run —
the Daily room, the LLM, the TTS? Is there an AU or APAC region or is it all US? What is
retained, for how long, and can it be turned off? Alcon is medtech in ANZ and this
question already ruled out a competitor. **This is the one that can still kill the job.**

**2. Concurrency: two conversations at once, all day, three days.** Is there an account
cap? What happens if we hit it mid-consult — does it queue, fail, or degrade? And does
ending a conversation free the slot immediately, or is there a lag?

**3. Event pricing.** Two rooms running most of three days. Per-minute rate, any event or
bulk rate, and what happens on overage. The whole job is $50K AUD ex GST, so this needs a
number, not a range.

**4. Support across 6–9 Nov, Auckland time.** That is the middle of the US night. Is
anyone on call in our timezone, and what is the escalation path when a room dies in front
of the client? If the answer is "email support", we need to hear that now.

## 2 — Measured today. Bring the numbers.

**5. Time to first word: median 3.1s, range 2.65–5.57s across six sessions.** Measured on
our own server log, session created to patient speaking. A surgeon sits down, waits three
seconds at a blank-ish screen and assumes it is broken. **Can a conversation be
pre-created and parked** so the greeting fires the instant someone sits down? This is the
single biggest experience problem we have.

**6. Every patient utterance arrives twice** — once as role `pal` and again as the legacy
`replica`. We dedupe client-side, but confirm that is expected and not a sign we have the
event handling wrong.

**7. `conversation.utterance` has no published schema.** The docs page returns an empty
body. We are guessing which field carries the spoken text. We also see growing partials
arriving as separate events with no final marker, so we collapse them by prefix. **Ask for
the actual event shape, including how to tell a partial from a final.**

**8. Leaving the Daily room does not end the conversation.** We found this ourselves and
guarded it with `participant_left_timeout: 0` plus an explicit end call. Confirm that is
right and that we are not being billed for empty rooms.

## 3 — Platform gaps we have worked around.

**9. `apply_greenscreen` does nothing on Phoenix-4.5.** Documented as resolving to false,
and all three of our faces are 4.5. We key it in the browser instead, which works. Is
native background replacement coming to 4.5, or is there a newer face model where it
works?

**10. Can we get a resting/idle render without running a conversation?** We need a looping
clip of each patient sitting still for the attract screen between consults. Margaret talks
or smiles through every second of her training footage, so we cannot cut one. Recording
one off a live session works but costs conversation minutes. **Is there an export, a
thumbnail loop, or an idle asset we can pull per face?**

**11. Voice override.** Can we drive a face with an ElevenLabs voice via `layers.tts`
without hurting lip sync? One of ours has an accent problem.

**12. Turn-taking on a noisy floor.** Sensible `turn_taking_patience` and
`pal_interruptibility` for a loud hall with the surgeon on a headset mic.

## 4 — Training, only if there is time.

**13. Does better training footage lengthen the idle loop**, or is the loop a fixed
property of the model? We hold the camera masters — ProRes LT, 4K, 10-bit 4:2:2 — against
the 1080p 8-bit H.264 we actually uploaded.

**14. What do you want in a training take — performance, not file specs.** How much silent
listening, how much stillness, how long. Ask for their real direction notes.

**15. Can takes be combined, and does changing appearance break it?** Our subjects put
glasses on and off between takes.

**16. Re-training cost and turnaround.**

**17. Does the training background matter?** Ours is a weakly lit studio green,
rgb(80,130,75), about 0.15 chroma separation from skin where a proper green gives ~0.5.

## 5 — Housekeeping.

**18.** The $200 credit — which account, and has it been applied.
**19.** Three orphaned PALs from retired personas. Tidy or ignore?
**20.** Perception is off (booth has a mic, no camera). Any downside?

---

## Good news worth telling them

The render is faithful. We compared a Tavus render against the upload it was trained on
and measured chroma deltas of **0.002–0.004** on background, skin and clothing — against
our key threshold of 0.05. Indistinguishable. It means we can cut idle clips from the
source footage and the switch to live is invisible. Worth saying; it makes the ask in
item 10 concrete rather than vague.

The push-back behaviour works. A surgeon gave a poor recommendation and the patient
challenged it three times, politely, without breaking character. That is the whole
activation and it is working.

---

## Unanswered on our side — don't get caught out

- **We do not know our own plan, credit balance or minutes used.** If Dylan asks what tier
  we are on or how much we have burned, we cannot answer. Worth five minutes in
  maker.tavus.io before the call.
- **We have not confirmed Alcon's data position.** We are asking Tavus about residency
  without knowing what Alcon legal will actually accept. If Dylan asks "what do you need
  it to say", we have no answer.
- **No load test.** We have never run two conversations at once, so our concurrency
  question is theoretical. One test before 10:30 would turn item 2 from a question into a
  finding.
- **Margaret's idle clip is a placeholder** cut from footage where she is mid-smile. It
  ships like that unless item 10 gives us something better.
- **Nobody has run a consult on the show hardware.** Everything measured so far is a Mac.
