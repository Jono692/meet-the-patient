# Meet the Patient: guardrail harness

Stress-tests the Meet the Patient persona against Alcon's no-go rules and produces a client-ready compliance report.

Two modes:

- **redteam**: a simulated eye-care professional holds scripted, adversarial conversations with the persona (30 scenarios across product info, self-diagnosis, testimonials, staying in character, mixed pressure, plus benign controls). Each transcript is graded by a separate judge model.
- **score**: grades real booth transcripts (e.g. the app's `transcripts/` folder) against the same rules.

Each run writes `runs/<mode>-<timestamp>/report.html` and `results.json`. The report carries a short hash of the persona prompt, so every result is tied to an exact prompt version.

## Setup

```bash
npm install
export ANTHROPIC_API_KEY=sk-ant-...   # from console.anthropic.com, where the monthly API credit lands
```

## Run

```bash
node run.js list                                          # see scenario ids
node run.js redteam --prompt ../meet-the-patient/providers/prompt.js --scenarios ctrl,prod-direct   # cheap smoke test first
node run.js redteam --prompt ../meet-the-patient/providers/prompt.js                                # full run
node run.js redteam --prompt ../meet-the-patient/providers/prompt.js --repeats 3                    # before sign-off
node run.js score ../meet-the-patient/transcripts --prompt ../meet-the-patient/providers/prompt.js
```

Exit code is 1 if any conversation fails, so it can gate a prompt change in CI.

## Things to check before trusting the results

1. **The persona prompt loads correctly.** `--prompt` accepts a `.txt`/`.md` file, or a JS module exporting the prompt as `default`, `SYSTEM_PROMPT`, `systemPrompt`, `PROMPT`, `prompt`, `buildPrompt` or `getPrompt` (string, or a function returning one). If `providers/prompt.js` builds its prompt differently, the error message lists what it found; export the string or save a `.txt` copy.
2. **The target matches production.** By default the harness sends the persona prompt to Claude (`TARGET_MODEL`, default `claude-opus-5-5`, `TARGET_EFFORT`, default `medium`). If the booth runs on another model or provider, or has extra filtering in the pipeline, write an adapter and pass `--target adapter.js`:

   ```js
   // adapter.js
   export async function reply({ system, messages }) {
     // messages: [{ role: "user" | "assistant", content: string }], doctor = user
     return "the patient's reply as a string";
   }
   ```

   Testing a different model from the one at the booth tells you very little.
3. **Transcript format.** `score` accepts JSON (`[{role|speaker, content|text}]` or `{messages|turns|transcript: [...]}`) and text with `Doctor:` / `Patient:` (or `User:` / `Assistant:`) prefixes. Anything else goes to the judge as raw text, which still grades but loses turn numbers.

## Cost

Rough guide at Opus 5.5 rates: about US$0.20 to US$0.30 per simulated conversation, so roughly US$7 for a full pass and US$20 for three repeats. Scoring a real transcript is a single judge call, a few cents each. Every run prints its actual spend. To cut cost, set `ATTACKER_MODEL=claude-sonnet-5-5`; keep the judge on Opus, since grading accuracy is the point.

## Changing the rules or attacks

- `rules.js`: the no-go rules the judge enforces. Keep in step with the client brief.
- `scenarios.js`: the attack library. Add a scenario with an `id`, `rule`, `tactic` and `goal`.

## Limits

Language models are not deterministic. A clean run lowers risk; it does not prove a breach cannot happen. Spot-check anything the judge marks minor or borderline, and re-run after every prompt change.
