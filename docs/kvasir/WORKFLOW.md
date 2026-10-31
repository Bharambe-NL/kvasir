# Kvasir workflow

How work moves from a phase brief to a merged change. Claude Code follows this file. The slash commands in `.claude/commands/` run these steps.

## Units of work

- **Phase**: one brief in `docs/kvasir/phases/`. One GitHub milestone. One tracking issue labelled `phase`.
- **Task**: one row in a phase brief (for example `P1-3`). One GitHub issue labelled `task` and the phase label. One branch. One PR.

## Branches

- `main` is protected. It is always releasable. No direct pushes.
- Task branches are named `p<phase>/<slug>` exactly as written in the brief, cut from the latest `main`.
- One task per branch. If a task grows, split it into new rows in the brief first, with Sagar's approval.

## Commits

- Conventional commits: `feat:`, `fix:`, `refactor:`, `test:`, `docs:`, `chore:`. Add the task id as scope: `feat(P1-2): add FSRS scheduler`.
- Small commits. Each commit compiles.
- End every commit message with the attribution lines the session provides.

## Pull requests

1. Open the PR as a draft as soon as the branch has its first commit.
2. Fill the PR template: task id, what changed, decisions taken (with `DECISIONS.md` row ids), test evidence, and the gate checklist.
3. Mark ready only when the four gates pass locally and in CI:
   - `npm run typecheck`
   - `npm run lint`
   - `npm test`
   - `npm run build`
   - plus `node scripts/house-style-check.mjs` for changed docs and prompt files.
4. Review: Sagar reviews every PR that changes a contract, a prompt, a store format or user-facing text. Other PRs may be self-merged by Claude Code only if Sagar has said so for that phase in the tracking issue.
5. Merge with **squash merge**. The squash title is the PR title. Delete the branch after merge.
6. After merge: tick the task in the tracking issue and update `docs/kvasir/HANDOFF.md`.

## Pulls and keeping branches current

- Before opening a PR and before merging, rebase the task branch on `main` (`git pull --rebase origin main`). Resolve conflicts on the task branch, never on `main`.
- Never force-push `main`. Force-push to a task branch only with `--force-with-lease`.

## Asking instead of guessing

Design authority belongs to Sagar. Before any decision on naming, behaviour, data shapes, UX, defaults, scope or prompt wording that is not already written in a brief or in `DECISIONS.md`:

1. Stop.
2. Ask with the AskUserQuestion tool. One decision per question. Offer two to four options, recommended option first.
3. Record the answer as a new row in `DECISIONS.md` in the same PR.

Each phase brief lists its known open decisions. Ask those at the start of the task that needs them, not all at once at the start of the phase.

## Contracts first

Within a phase, the task that defines contracts (types, ports, ledger formats) merges first. Later tasks code against merged contracts only. A change to a contract after it merges needs its own PR and a `DECISIONS.md` row.

## Data safety

- `data/` is never committed. Test data lives in `tests/fixtures/`.
- An on-disk format change updates the golden fixtures in the same commit (upstream fixture law).
- Never run backfill or migration scripts against Sagar's real data folder without asking first.

## Releases

- At a phase gate, tag `main` with the version from `ROADMAP.md` and publish a GitHub release with notes generated from the merged PR titles.
- Patch releases (`v0.N.x`) may be cut from `main` between gates for fixes.

## Handoff between sessions

At the end of every working session, or when context is running low, update `docs/kvasir/HANDOFF.md`:

- current phase and task
- branch and PR link
- what is done, what is next
- open questions waiting for Sagar
- anything surprising found in the code

The next session reads `HANDOFF.md` first.
