# Kvasir teaching evals

The teaching evals run whole sessions with a simulated learner and score how well Kvasir teaches (Kvasir P6-4, D094 to D098). Each run is tied to a commit, so a prompt change can be compared with the run before it.

## Run them

```bash
npm run eval
```

This runs every scenario in `evals/scenarios/`. To run some of them, name them:

```bash
npm run eval -- dora-art28 bayes
```

A run costs real model calls. Expect about $2 to $5 for the three scenarios, depending on the models in your settings. The run prints tokens and cost per role at the end.

What a run needs:

- The desktop app's settings, with a strong and a cheap model slot. The script reads `~/Library/Application Support/Kvasir/data/settings.json`, or the file in `KV_EVAL_SETTINGS`.
- The app's provider sign-in. `KV_AUTH_FILE` points at the app's `auth.json` in place when it is unset; the file is never copied.

The run never touches your own data. It copies `evals/fixtures/data/` to a temporary folder, puts your model slots in the copy's settings, and points `KV_DATA_DIR` at the copy.

## What happens in one scenario

1. A chat is created in the fixture copy and the learner's opening message is posted through the real chat handler, as the app's composer would.
2. The prober and teacher answer with the strong model (the session model).
3. The simulated learner (the cheap model, playing the scenario's persona) reads the session as text and makes one move:
   - When a question is pending, it picks option letters, writes an answer, or presses I don't know. The answer is built with the dock's own `questionDataFor` and `buildAnswer`, so it is exactly what a click sends.
   - When nothing is pending, it writes its next message. An empty message ends the session.
4. Steps 2 and 3 repeat until the learner ends the session or makes 12 replies.
5. The deterministic checks read the stored messages.
6. The judge (the strong model) scores each rubric item 0, 1 or 2 with a reason and a quote copied exactly from the transcript.

## Scenarios

Each scenario is a JSON file in `evals/scenarios/`:

| Field | Meaning |
|---|---|
| `id` | The file name without `.json` |
| `title` | The chat title, prefixed with `[eval]` |
| `persona` | What the simulated learner knows, gets wrong and how it answers |
| `opening` | The learner's first message |
| `rubric` | Rubric item ids for the judge (`src/evals/rubric.ts`) |
| `checks` | Deterministic check ids (`src/evals/checks.ts`) |

The first three (D096):

- `dora-art28`: DORA Article 28, with a payments compliance learner who believes a cloud contract moves the responsibility to the provider. Uses the imported DORA text, so the citations check applies.
- `bayes`: Bayes' rule, with the learner confusing P(A\|B) with P(B\|A). No source.
- `fast-learner`: a learner who has studied DORA Chapter V closely, to see whether the teacher skips what is known.

## Scores

Rubric items (the judge, D095):

Each item is scored 0 (not done or done badly), 1 (partly) or 2 (done well). The texts are in `src/evals/rubric.ts`:

| Id | The tutor... |
|---|---|
| `probes_first` | Finds out what the learner already knows before teaching |
| `one_step` | Teaches one idea per step, each built on what the learner already holds |
| `checks_landing` | Checks that each step landed and acts on wrong answers before moving on |
| `accuracy` | Makes no false statements about the subject |
| `fixes_misconception_dora` | Corrects the belief that "a contract moves regulatory responsibility to the provider", grounded in DORA Article 28(1)(a) |
| `cites_source` | Ties the obligations it teaches to the specific DORA paragraphs they come from |
| `fixes_misconception_bayes` | Separates P(A\|B) from P(B\|A) with a worked example |
| `skips_known` | Does not re-teach what the learner shows they already know, and moves to what is new to them |

Deterministic checks:

| Id | Passes when |
|---|---|
| `handoff` | The prober called `probe_done` |
| `taught_with_checks` | The teacher asked at least one quiz after the handoff |
| `no_failed_turns` | No turn ended in an error |
| `citations` | The teacher's text has at least one `#src-` link and every one resolves to a stored unit |

## Results

Each run writes `evals/results/<short commit>/` (D097):

- one `<scenario>.json` per scenario: the stop reason, learner replies, checks, scores, totals, token use per role and the full transcript
- `summary.md`: a table of all scenarios, then each check and score with its reason and quote

The folder name is the short commit, with `-dirty` added when files outside `evals/results/` are uncommitted. Commit the folder with the change it measures.

## The fixture

`evals/fixtures/data/` is the golden test data plus the DORA v1 import from the P2 gate: 147 nodes, 116 chains, 258 citations and the DORA units. `evals/fixtures/README.md` says how it was made.

## Code

| File | What it holds |
|---|---|
| `src/evals/driver.ts` | `runScenario`, the session loop over an injected `SessionPort`, and `summaryMarkdown` |
| `src/evals/roles.ts` | The learner and the judge, each a single structured submit |
| `src/evals/prompts.ts` | The learner and judge system prompts |
| `src/evals/rubric.ts` | Rubric item texts |
| `src/evals/checks.ts` | Deterministic checks |
| `src/evals/transcript.ts` | The session as plain text for the learner and the judge |
| `scripts/eval.ts` | The entry point: fixture copy, engines, the session port over the chat handler, results and cost |

`src/evals` has its own ESLint zone: it never imports `src/server` or `src/store`. `scripts/eval.ts` wires those in. The tests (`tests/evals-checks.test.ts`, `tests/evals-run.test.ts`) run a scenario with faux engines through the real chat handler, with no network.
