# P1: Retention and the learner layer

## Goal

Kvasir remembers what Sagar has learned and brings each proposition back for review just before he would forget it.

## Why this is a new layer

Upstream deliberately removed all mastery tracking from the graph (architecture section 6 and section 7: "strengthening, not assessment"). Kvasir keeps that rule. Learner state goes into a new store, owned by a new system, that reads the graph and never writes to it.

## Read first

- `docs/architecture.md` sections 1 to 4, 6, 7 and 9
- `src/core/ports.ts`, `src/core/contracts/practice.ts`, `src/core/practice.ts`
- FSRS algorithm reference: https://github.com/open-spaced-repetition/fsrs4anki/wiki

## Open decisions

1. Confirm D007 (separate learner store). Ask at the very start of the phase.
2. Review unit: one proposition, or one reasoning chain. Default proposal: chain, with single propositions as singleton chains (matches how practice already works).
3. FSRS library: `ts-fsrs` from npm, or a local port. Default proposal: `ts-fsrs`, pinned.
4. What creates a review card: every new proposition automatically, or only ones Sagar opts in. Default proposal: automatic, with a per-cluster opt-out.
5. Review question format: reuse the quiz tool, reuse practice generators at rung 1 or 2, or a new light generator. Ask with sketches of each.
6. Daily review limit default.

## Design outline

- New system **Memory**: owns `data/learner/` (append-only `reviews.jsonl`, derived card state). Sole writer: the review pipeline.
- New port `LearnerStore` in `src/core/ports.ts`, fs adapter in `src/store/learner.ts`, wired only in `src/server/stores.ts`.
- Pure scheduling in `src/core/schedule.ts` (no IO, fully unit tested).
- Card state is derived from the review ledger at read time. Nothing is dual-tracked.
- A graph deletion makes the card inert at read time. The learner store never rewrites history.
- New event `reviews-changed` on the events channel.

## Tasks

| ID | Branch | Scope | Done when |
|---|---|---|---|
| P1-1 | `p1/learner-contracts` | Contracts, port, fs adapter, composition-root wiring, ESLint zone for the new system | Contracts reviewed by Sagar; adapter tests pass |
| P1-2 | `p1/scheduler` | `src/core/schedule.ts` with FSRS, deterministic tests with fixed clocks | Scheduling tests cover new, learning, review, lapse and relearn |
| P1-3 | `p1/card-source` | Derive cards from graph chains; handle deletion and merges | Golden-fixture graph produces the expected card set |
| P1-4 | `p1/review-generator` | Review question generation per decision 5, run under the shared background semaphore | Faux-engine tests pass; generation failure isolates to one card |
| P1-5 | `p1/review-ui` | `/review` page: due queue, answer, self-rate (Again, Hard, Good, Easy), next card | Render tests pass; keyboard-only flow works |
| P1-6 | `p1/home-signals` | Due count on the home page and sidebar; retention heat overlay on the graph canvas (read only) | Overlay toggles; graph ledgers unchanged by any review |
| P1-7 | `p1/teacher-hook` | Read-only teacher tool `list_weak_propositions`, gated by a setting | Teacher can probe weak items; no writes |
| P1-8 | `p1/card-opt-out` | Added by D036. Opt a birth session (cluster) out of review: an append-only exclusions record in `data/learner/` keyed by session id, read by the card source, with a control in the UI. Contract change, so Sagar reviews | An excluded session's cards leave the queue; their reviews stay in the ledger; including it again restores them |

## Gate acceptance checks

1. Two weeks of real use: reviews arrive on schedule and the due queue never exceeds the daily limit.
2. A test proves no code path in the Memory system writes to `data/graph/`.
3. Deleting a node in the chain table removes its cards from the queue with no error.
4. Measured retention on scheduled reviews is reported on the review page.

## Gate results

(record here)
