# P3: Voice tutor and drive mode

## Goal

Sagar can run a full teaching or review session by voice, with no need to look at the screen. The session follows his Socratic Tutor contract.

## The Socratic Tutor contract

These rules come from Sagar's own validated voice sessions. Encode them as a teacher prompt profile named `voice`.

1. Run four setup questions first: background, goal, session length, hint style. In voice, ask them one at a time.
2. Start slow with simple language. Gauge understanding early, then raise difficulty as he shows he has it.
3. One question at a time, in small chunks. Never make him hold a large block of information in his head to answer.
4. Pattern for each answer: confirm what is right, correct what is off, then add one new layer.
5. When he is stuck: two hints of increasing strength, then the answer with a short explanation.
6. Ground key ideas in concrete examples, ideally from EU payments, EPI, Wero and regulators. After a concept, turn it into a worked example.
7. Recap each section before moving on.
8. Never read formulas aloud. Describe them in plain words.
9. Never offer several options at once in voice. Multiple choice becomes an open spoken question.

## Read first

- `src/agent/prompts/` (fragment structure)
- `src/core/dictation.ts` and the dictation components
- `src/agent/tools.ts` (quiz and ask tools)

## Open decisions

1. Speech-to-text: keep Deepgram streaming, or add a local option (for example Whisper). Default proposal: Deepgram first, local later behind the same seam.
2. Text-to-speech provider. Ask with options and per-hour cost.
3. Turn-taking: push to talk, or voice activity detection with barge-in. Default proposal: voice activity detection with barge-in; a hardware button as a fallback.
4. How quiz grading works by voice: the teacher grades the spoken answer with a rubric. Confirm that voice answers skip client-side option grading.
5. Wake word or not.

## Design outline

- A `voice` session mode stored on the chat record. Mode decides which prompt fragments load and which tools are offered.
- In voice mode the quiz tool is replaced by `ask_spoken`, a server-executed tool that takes a transcript and returns a rubric verdict.
- A speech pipeline seam: `SpeechIn` and `SpeechOut` ports with Deepgram and the chosen TTS as adapters.
- Drive mode UI: full-screen, large status, one big button, no text to read. Screen lock does not stop the session (desktop and phone).
- Visual sub-agents (demo, visual) are deferred in voice mode and queued for later viewing.

## Tasks

| ID | Branch | Scope | Done when |
|---|---|---|---|
| P3-1 | `p3/voice-prompt-profile` | `voice` prompt fragments encoding the contract above | Prompt eval cases (P6-4 harness or a simple scripted check) pass |
| P3-2 | `p3/speech-ports` | `SpeechIn`, `SpeechOut` ports and adapters | Faux adapters drive a full scripted session in tests |
| P3-3 | `p3/spoken-questions` | `ask_spoken` tool and rubric grading | One question per turn enforced by validator |
| P3-4 | `p3/turn-taking` | Voice activity detection, barge-in, silence handling | Manual test log in the brief |
| P3-5 | `p3/drive-mode-ui` | Drive mode screen | Usable with eyes off the screen for 30 minutes |
| P3-6 | `p3/voice-review` | Voice mode for P1 reviews | A due queue can be cleared by voice |

## Gate acceptance checks

1. A 30-minute voice session on a DORA article runs with no screen interaction after start.
2. The transcript shows one question per turn and no formulas spoken as symbols.
3. A review queue of 20 items can be cleared by voice.

## Gate results

(record here)
