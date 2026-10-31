---
description: Open a Kvasir phase on GitHub (milestone, tracking issue, task issues)
argument-hint: <phase id, for example P1>
---

Open phase $ARGUMENTS.

1. Read `docs/kvasir/ROADMAP.md`. Confirm every phase that $ARGUMENTS depends on has passed its gate. If one has not, stop and tell Sagar which.
2. Read `docs/kvasir/phases/$ARGUMENTS-*.md`.
3. Create the GitHub milestone `$ARGUMENTS <phase name>` with `gh api`.
4. Create the labels `phase`, `task` and `$ARGUMENTS` if missing.
5. Create one tracking issue labelled `phase` and `$ARGUMENTS`. Body: the goal, a checklist with one line per task id, the open decisions list, and the gate acceptance checks.
6. Create one issue per task row, labelled `task` and `$ARGUMENTS`, in the milestone. Body: the task row, the branch name, and a link to the brief.
7. Set the phase status to "In progress" in `ROADMAP.md` on a branch `$ARGUMENTS/open-phase` (lowercase phase id) and open a PR for it.
8. Update `docs/kvasir/HANDOFF.md`.

Done when the milestone, tracking issue and every task issue exist, and the roadmap PR is open.
