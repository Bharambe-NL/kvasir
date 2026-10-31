---
description: Finish a Kvasir task (rebase, gates, ready PR, merge when allowed)
---

Ship the task on the current branch.

1. `git fetch origin && git rebase origin/main`. Resolve conflicts on this branch.
2. Run, and fix until all pass:
   - `npm run typecheck`
   - `npm run lint`
   - `npm test`
   - `npm run build`
   - `node scripts/house-style-check.mjs`
3. Check the task's "Done when" condition from the phase brief and paste the evidence (test names, command output, screenshots) into the PR body.
4. Check the PR body: task id, decisions with `DECISIONS.md` ids, `docs/architecture.md` updated if the system changed, golden fixtures updated if a store format changed.
5. Push with `--force-with-lease` and mark the PR ready.
6. If the PR changes a contract, a prompt, a store format or user-facing text, ask Sagar to review and stop here.
7. Otherwise, if Sagar has allowed self-merge for this phase in the tracking issue, wait for CI to pass, then squash merge and delete the branch.
8. Tick the task in the tracking issue and update `docs/kvasir/HANDOFF.md`.

Done when the PR is merged, or is ready and waiting on Sagar's review.
