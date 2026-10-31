---
description: Start a Kvasir task (branch, decisions, plan, draft PR)
argument-hint: <task id, for example P1-2>
---

Start task $ARGUMENTS.

1. Read `docs/kvasir/HANDOFF.md`, the phase brief that contains $ARGUMENTS, and `docs/kvasir/DECISIONS.md`.
2. Check that every earlier contracts task in the same phase is merged. If not, stop and say which one blocks this task.
3. `git checkout main && git pull`, then create the branch named in the brief.
4. Investigate the code the task touches. Read `docs/architecture.md` sections that apply.
5. List every open decision this task needs that is not in `DECISIONS.md`. Ask each with AskUserQuestion, one at a time, recommended option first. Record each answer as a new row in `DECISIONS.md`.
6. Write a short implementation plan as a comment on the task issue: files to add or change, contracts used, tests to write, how the "Done when" check will be shown. Ask Sagar to approve the plan.
7. After approval, make the first commit and open a draft PR using the PR template. Link the task issue.
8. Implement in small commits. Keep the four gates green as you go.

Done when the draft PR is open with an approved plan, and implementation has started.
