# Voice sessions

Kvasir's voice sessions follow Sagar's Socratic Tutor contract (P3 brief). This page says where each rule lives and how the prompts are checked. Phase P3 builds the rest of voice: speech in and out (P3-2), spoken questions (P3-3), turn-taking (P3-4), drive mode (P3-5) and voice review (P3-6).

## Speech in and out

The voice loop (P3-2) joins three ports in `src/core/speech.ts`:

- `SpeechIn` hears him: one `onFinal` per finished utterance, with partial words on the way.
- `SpeechOut` speaks: one sentence at a time, stoppable at once.
- `TurnSender` sends an utterance as a chat turn and yields the reply's new text as it streams.

`runVoiceLoop` listens, sends what he said, and speaks each finished sentence while the reply is still streaming (D155), then listens again. Its states are listening, thinking, speaking, paused and stopped.

| Adapter | File | Provider |
|---|---|---|
| SpeechIn | `components/speech/deepgram-speech-in.ts` | Deepgram Nova-3 streaming, 16 kHz audio from the dictation capture worklet, interim results and endpointing |
| SpeechOut | `components/speech/deepgram-speech-out.ts` | Deepgram Aura-2, voice `aura-2-thalia-en` (D158), 24 kHz audio played as it arrives |
| TurnSender | `components/speech/chat-turn-sender.ts` | the chat itself: POST `/api/chat`, then `GET /api/chats/[id]/stream`, then the record if the turn already settled |

Both Deepgram sockets authenticate with a short-lived token from `/api/stt/token` (D156); the key never reaches the window. Dictation keeps its own listener (D157).

Cost (D154): Aura-2 is $0.030 per 1,000 characters, about $0.81 for an hour in which the tutor speaks half the time. Listening is billed per minute of audio by Nova-3.

## Turn-taking

Voice sessions are hands-free (P3-4, D165). The microphone stays on for the whole session, and there is no wake word (D170).

- **End of his turn (D168):** a pause of about 1.5 seconds. Deepgram's endpointing at 1000 ms marks most ends (`speech_final`); its `UtteranceEnd` message at 1500 ms catches the rest. A short pause to think mid-answer does not send half an answer.
- **Barge-in (D166, D167):** two heard words while the tutor thinks or speaks stop speech at once and abort the turn. A cough, a "hmm" or a single word does not. The turn sender aborts the turn on the server (`POST /api/activity/abort`), and the record keeps the reply up to where it stopped. What he said goes as the next turn once the aborted turn has settled.
- **Silence (D169):** with a spoken question open and nothing heard, the question is spoken again after 20 seconds, word for word, with no model call. After 60 more seconds the app says "I'll pause here. Say anything when you're ready to go on." and the state is paused. Anything he says then resumes the session as a normal turn. Any heard word resets the timers. With no question open, nothing happens.

The constants are `BARGE_IN_WORDS`, `NUDGE_AFTER_MS`, `PAUSE_AFTER_MS` and `PAUSE_LINE` in `src/core/speech.ts`. `tests/turn-taking.test.ts` checks the silence rules on a fake clock.

### The dev voice page

`/dev/voice` (D171) runs a live voice session for testing: `npm run dev`, open `http://localhost:3000/dev/voice`, press Start. It creates a voice chat on the default model, listens in English, and shows the state, the partial words and a timed log of every line heard and spoken. Production builds answer 404. Drive mode (P3-5) replaces it.

## Tests

`tests/voice-loop.test.ts` drives a full scripted session with faux speech through the real chat handler; `tests/speech-adapters.test.ts` checks the Deepgram adapters against a fake socket.

## Voice sessions and spoken questions

A chat is a voice session when its record has `voice: true` (P3-3, D161), set when it is created (`POST /api/chats` with `voice: true`) and never changed. Practice has no voice. In a voice session the chat handler builds the prober and the teacher on the voice prompt profile, with `ask_spoken` as their only question tool (D160): it replaces quiz, free recall and `ask_user_question`.

- **Graded:** with `correctAnswer`, committed before he hears the question. The tutor grades his spoken words against it in its next reply (D159).
- **Open:** without `correctAnswer`, for questions with no right answer (the setup questions, a preference).

The validator, `askSpokenProblems` in `src/core/question-core.ts` (D163), sends a call back to the model to fix when:
- the turn already asked a question
- the question has more than one question mark, or joins a second question with "and" or "or" (D164)
- it offers options
- it holds a formula or symbols, or Markdown
- it runs past 40 words

The voice loop speaks a question only after the validator has accepted it, so a rejected question is never heard. The next utterance then goes to the chat as that question's answer, through the same answer path as the written dock (D162). A voice session opened in the written window shows an open spoken question as a text answer, like free recall.

`tests/ask-spoken.test.ts` checks the validator and the tool sets, and `tests/voice-loop.test.ts` checks spoken questions end to end.

## The voice prompt profile

A voice session uses the `voice` profile (P3-1, D149): an overlay on the prober and teacher prompts. The agents keep their normal method; in voice the Markdown and LaTeX guide (`shared/40-formatting.md`) and the written question guide (`shared/20-question-tools.md`) are dropped, and four fragments close the prompt:

| Fragment | Agent | What it covers |
|---|---|---|
| `src/agent/prompts/voice/shared/20-spoken-questions.md` | prober and teacher | `ask_spoken` for every question, graded or open, one per turn and spoken last; strict grading of transcribed answers (P3-3; replaces `shared/20-question-tools.md` in voice) |
| `src/agent/prompts/voice/shared/10-spoken-session.md` | prober and teacher | heard, not read; one question per turn; small chunks; short turns; simple language; formulas in words; no formatting; numbers as spoken; no options; transcribed answers |
| `src/agent/prompts/voice/prober/10-setup.md` | prober | the four setup questions first, one at a time |
| `src/agent/prompts/voice/teacher/10-spoken-teaching.md` | teacher | pace, confirm and correct and add a layer, hints, examples from his field, recaps |

The profile is chosen with `promptProfile: "voice"` when an agent is built (`src/agent/teacher-agent.ts`); the chat handler sets it for a voice session.

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

`npm run voice:check` runs the real prober and teacher with the voice profile against fixed learner replies on DORA Article 28 (D153). It checks every reply (`src/core/voice-checks.ts`): at most one question, no formula symbols, no option lists, no Markdown, at most 130 words. The agents ask through `ask_spoken`: a reply is the spoken text plus the accepted question, and the report counts calls the validator rejected.

- Models: the strong slot of the Kvasir app's settings (`KV_EVAL_SETTINGS` to point elsewhere).
- Keys: the app's key file, read in place (`KV_AUTH_FILE`), never copied. An encrypted install's key file cannot be read outside the app.
- Data: an empty temp folder; the app's data is not touched.
- Cost: about $1 to $3 a run.
- Output: `evals/voice/<commit>.json` with every reply, its checks and the cost. The script exits non-zero if any reply fails.
