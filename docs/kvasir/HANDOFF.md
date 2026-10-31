# Handoff

Updated by Claude Code at the end of each session. Read this first.

## Current state

- Phase: P1 Retention and the learner layer (in progress). Milestone "P1 Retention and the learner layer", tracking issue #13, task issues #14 to #20.
- Task: P1-2 Scheduler (#15). Plan approved on #15; self-merge once CI is green (D029).
- Branch: `p1/scheduler`
- PR: draft, linked to #15

## Done

- P0 Bootstrap and rename: gate passed 2026-10-31, released as `v0.0.1`. Tasks P0-1 to P0-4 merged (#7 to #10); P0-5 deferred to P6-7 (#6, D026). Decisions D008 to D028. Gate evidence: `docs/kvasir/phases/P0-bootstrap.md`.
- Repository `Bharambe-NL/kvasir` is public (D028). `main` only accepts PRs whose five checks pass, admins included (D024).
- Phase P1 opened: milestone 2, label `P1`, tracking issue #13, task issues #14 to #20. Roadmap PR #21 merged. Self-merge for P1 allowed (D029).
- P1 decisions 1 and 2: D007 confirmed (D030); one review card is one proposition, keyed by node id (D031).
- P1-2 started: decisions D032 to D035 (`ts-fsrs` 5.4.2 pinned, retention 0.90, FSRS short-term steps, fuzz off). Plan approved on #15.
- P1-1 merged via #22 (contracts approved by Sagar): `ReviewEntry` and the derived `CardState` (`src/core/contracts/learner.ts`), `LearnerStore` and the read-only `GraphReader` (`src/core/ports.ts`), the fs adapter (`src/store/learner.ts`, `data/learner/reviews.jsonl`), wiring in `src/server/stores.ts`, two ESLint zones, 16 new tests, and the architecture doc (Memory system, plus a correction of stale practice entries).

## Next

1. Finish P1-2 per the plan on #15: pin `ts-fsrs` 5.4.2, write `src/core/schedule.ts`, fixed-clock tests, architecture note.
2. Self-merge once CI is green, tick P1-2 in #13. Then P1-3 Card source (#16).

## Waiting for Sagar

- P1 open decisions 4 to 6, each at the start of the task that needs it.

Self-merge is allowed in P1 for PRs that need no review from Sagar (D029, recorded in #13).

## Notes

- One test fails on this Mac only: `tests/claude-code-tool-bridge.test.ts` "binds 127.0.0.1". macOS firewall stealth mode drops the LAN connection, so it times out instead of being refused. It passes in CI.
- `npm run build` rewrites `next-env.d.ts`. It is generated; restore it with `git checkout next-env.d.ts` rather than committing it.
- Homebrew at `/usr/local` is the Intel install and fails on this Mac with "Bad CPU type in executable". Install tools another way, or fix Homebrew first.
- This Mac has no Xcode and no Developer ID certificate, so `desktop:dist` cannot build here. Packaged builds come from a manual run of the release workflow (D022): `gh workflow run release.yml --ref <branch>`, then `gh run download <run> -n kvasir-mac-arm64`. Watch its Windows job: it hung once for 92 minutes in electron-builder (run 41178973326) and should take a few minutes.
- Phase releases are notes-only until Apple signing secrets exist (D027): create the release with `gh release create`, then cancel the release workflow run the tag starts.
- Auto-update is off (D019). Turning it on needs a published Kvasir release with installers, then `AUTO_UPDATE_ENABLED = true` in `electron/main.cjs`.
- The installed `/Applications/Kvasir.app` is the unsigned 0.0.1 gate build. Its data folder holds the PSD2 SCA test session and its graph (11 propositions, 8 chains). Upstream LearnHarness 0.4.0 is also installed and uses its own folder (D017).
- `desktop:dev` points Electron at `next dev`, so the server uses the repo `data/` folder. Packaged builds use `~/Library/Application Support/Kvasir/data`.
- Extraction writes the graph only once a chat has at least `graph.extractionChunkTokens` (default 4096) uncovered tokens of teacher prose. Short sessions show no graph yet.
- Python skill tests: `python3 -B -m unittest discover -s tests/skills` (53 pass on Python 3.9.6). CI does not run them.
- The brief's `src/core/contracts/practice.ts` and `src/core/practice.ts` do not exist; practice is a chat kind. Architecture section 7 now carries a note; parts of it still describe the earlier problem-set design.
- The upstream mark component and types keep code names `LhMark` and `LhMarkerMessage`. They do not reach the user.
