---
description: Run a Kvasir phase gate and tag the release when approved
argument-hint: <phase id, for example P1>
---

Run the gate for phase $ARGUMENTS.

1. Confirm every task issue in the milestone is closed and every task PR is merged.
2. On a fresh checkout of `main`, run the four gates and the house-style check.
3. Work through each gate acceptance check in the phase brief. Record the result, date and evidence under "Gate results" in the brief. Checks that need Sagar's hands (live sessions, phone, car) go to him as a checklist; wait for his results.
4. Confirm `docs/architecture.md` describes the new parts and `DECISIONS.md` lists every decision from the phase.
5. Open a PR `$ARGUMENTS/gate` (lowercase phase id) with the gate results and the "Done" status in `ROADMAP.md`.
6. Ask Sagar to approve the gate in the tracking issue.
7. After approval and merge: tag `main` with the release tag from `ROADMAP.md`, publish a GitHub release with notes from the merged PR titles, and close the milestone.
8. Update `docs/kvasir/HANDOFF.md` to point at the next phase.

Done when the tag exists, the release is published and the milestone is closed.
