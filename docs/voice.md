# Voice sessions

Kvasir's voice sessions follow Sagar's Socratic Tutor contract (P3 brief). This page says where each rule lives and how the prompts are checked. Phase P3 builds the rest of voice: speech in and out (P3-2), spoken questions (P3-3), turn-taking (P3-4), drive mode (P3-5) and voice review (P3-6).

## The voice prompt profile

A voice session uses the `voice` profile (P3-1, D149): an overlay on the prober and teacher prompts. The agents keep their normal method; in voice the Markdown and LaTeX guide (`shared/40-formatting.md`) is dropped, and three fragments close the prompt:

| Fragment | Agent | What it covers |
|---|---|---|
| `src/agent/prompts/voice/shared/10-spoken-session.md` | prober and teacher | heard, not read; one question per turn; small chunks; short turns; simple language; formulas in words; no formatting; numbers as spoken; no options; transcribed answers |
| `src/agent/prompts/voice/prober/10-setup.md` | prober | the four setup questions first, one at a time |
| `src/agent/prompts/voice/teacher/10-spoken-teaching.md` | teacher | pace, confirm and correct and add a layer, hints, examples from his field, recaps |

The profile is chosen with `promptProfile: "voice"` when an agent is built (`src/agent/teacher-agent.ts`). Until P3-3 puts the flag on the chat record, nothing in the app sets it (D150).

## The contract, rule by rule

| Rule | Where |
|---|---|
| 1. Four setup questions first, one at a time (background, goal, session length, hint style) | `voice/prober/10-setup.md`. The answers stay in the transcript, where the teacher reads them (D151). |
| 2. Start slow, gauge early, raise difficulty as he shows he has it | `voice/teacher`, "Pace" |
| 3. One question at a time, small chunks | `voice/shared`, "One thing at a time" |
| 4. Confirm what is right, correct what is off, add one layer | `voice/teacher`, "Every answer" |
| 5. Two hints of increasing strength, then the answer | `voice/teacher`, "When he is stuck", in the hint style he chose |
| 6. Concrete examples from his field, then a worked example | `voice/teacher`, "Ground it in his world": his field from the background answer, with EU payments, EPI, Wero and regulators as Sagar's case (D152) |
| 7. Recap each section | `voice/teacher`, "Recap each section" |
| 8. Never read formulas aloud | `voice/shared`, "Say it the way a person would say it" |
| 9. Never several options at once | `voice/shared`, "Say it the way a person would say it" |

`tests/voice-profile.test.ts` checks the composition and that every rule is present.

## The live check

`npm run voice:check` runs the real prober and teacher with the voice profile against fixed learner replies on DORA Article 28 (D153). It checks every reply (`src/evals/voice-checks.ts`): at most one question, no formula symbols, no option lists, no Markdown, at most 130 words. The question tools are held back, as `ask_spoken` will replace them, so questions arrive as spoken text.

- Models: the strong slot of the Kvasir app's settings (`KV_EVAL_SETTINGS` to point elsewhere).
- Keys: the app's key file, read in place (`KV_AUTH_FILE`), never copied. An encrypted install's key file cannot be read outside the app.
- Data: an empty temp folder; the app's data is not touched.
- Cost: about $1 to $3 a run.
- Output: `evals/voice/<commit>.json` with every reply, its checks and the cost. The script exits non-zero if any reply fails.
