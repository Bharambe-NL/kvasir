# Kvasir roadmap

Seven phases. Each phase has its own brief in `phases/`. A phase starts only when the previous phase gate has passed, unless this file says the phases can run in parallel.

| Phase | Name | Depends on | Release tag |
|---|---|---|---|
| P0 | Bootstrap and rename | none | `v0.0.1` |
| P1 | Retention and the learner layer | P0 | none: included in `v0.2.0` (D088) |
| P2 | Regulation grounding | P0 (can run in parallel with P1) | `v0.2.0` |
| P3 | Voice tutor and drive mode | P1 | `v0.3.0` |
| P4 | Mobile companion | P1, P3 | `v0.4.0` |
| P5 | Team sharing and training evidence | P1, P2 | `v0.5.0` |
| P6 | Platform hardening | P0 (tasks can land at any time after P0) | `v0.6.0` |

## Phase gates

A phase gate passes when all of these hold:

1. Every task in the phase brief is merged to `main`.
2. `npm run typecheck`, `npm run lint`, `npm test` and `npm run build` are green on `main`.
3. Every acceptance check in the phase brief has a recorded result in the brief's "Gate results" section.
4. `docs/kvasir/DECISIONS.md` lists every design decision taken during the phase.
5. `docs/architecture.md` describes the system as built, including the new parts.
6. Sagar has approved the gate in the phase tracking issue.

Then tag the release on `main` and close the phase milestone.

## Status

| Phase | Status | Gate date |
|---|---|---|
| P0 | Done | 2026-10-31 |
| P1 | In progress | |
| P2 | Done | 2026-11-01 |
| P3 | Not started | |
| P4 | Not started | |
| P5 | Not started | |
| P6 | In progress | |
