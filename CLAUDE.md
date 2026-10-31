# Kvasir

Kvasir is Sagar's personal learning system, built on an AGPL import of LearnHarness. Desktop app (Next.js in Electron) with a mobile companion to come.

## Start of every session

1. Read `docs/kvasir/HANDOFF.md`.
2. Read the brief for the current phase in `docs/kvasir/phases/`.
3. Read `AGENTS.md` (upstream rules: the Next.js version note and "No guessing").

## Where things are

- Product direction: `docs/kvasir/PRODUCT.md`
- Phases and gates: `docs/kvasir/ROADMAP.md`
- Branches, commits, PRs, merges, releases: `docs/kvasir/WORKFLOW.md`
- Decisions already taken: `docs/kvasir/DECISIONS.md`
- Licence and upstream policy: `docs/kvasir/LINEAGE.md`
- System as built: `docs/architecture.md` (canonical; update it in the PR that changes the system)

## Rules

- **Ask, never guess.** Any design, naming, data-shape, UX, default, scope or prompt-wording choice not already written in a brief or `DECISIONS.md` goes to Sagar through AskUserQuestion, one decision per question, recommended option first. Record the answer in `DECISIONS.md`.
- **Keep the architecture laws** in `docs/architecture.md` section 9: imports point inward, one writer per store, append-only evidence, everything else derived. New systems get their own store, port, adapter and ESLint zone.
- **The graph stays objective.** Learner state never goes into `data/graph/`.
- **Tests stay deterministic.** Inject engines; no network, no real LLM in `npm test`.
- **One task, one branch, one PR.** Branch names come from the brief. Squash merge.
- **Green before ready.** typecheck, lint, test, build, and the house-style check.

## House style for all text

Applies to docs, UI strings, prompts, commit messages and PR descriptions.

- Plain English: short sentences, everyday words. Keep every fact, name, number and path.
- Use hyphens, commas, colons, parentheses or full stops where a dash might go. The em dash and en dash characters never appear.
- State claims directly and positively.
- Headings name the content plainly.
- Professional, measured tone.

`scripts/house-style-check.mjs` enforces the mechanical parts.

## End of every session

Update `docs/kvasir/HANDOFF.md`.
