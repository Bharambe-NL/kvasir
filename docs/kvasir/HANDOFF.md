# Handoff

Updated by Claude Code at the end of each session. Read this first.

## Current state

- Phase: P0 (in progress). Milestone "P0 Bootstrap and rename", tracking issue #1. P0-1, P0-2 and P0-3 merged.
- Task: P0-4 Agent files and house style (#5). Plan approved on #5; self-merge once CI is green (D010).
- Branch: `p0/agent-files`
- PR: draft, linked to #5

## Done

- Build pack written (product brief, roadmap, workflow, phase briefs, agent files).
- P0 decision 1 taken: `Bharambe-NL/kvasir`, private (D008). Commit email: GitHub noreply (D009).
- Repository `Bharambe-NL/kvasir` created private and pushed. Commit `390fd68` imports upstream `dc4c398` unchanged, commit `422f576` adds the build pack, commit `070829d` records D008 and D009.
- `gh` 2.103.3 installed at `~/.local/bin/gh` from the official release (checksum verified), signed in as `Bharambe-NL`.
- Phase P0 opened: milestone 1, labels `phase`, `task` and `P0`, tracking issue #1, task issues #2 to #6. Roadmap PR #7 merged.
- P0-1 (#2) closed with the CI evidence.
- P0-2 (#3): decisions D011 to D018. Identity renamed to Kvasir, including the page title. Reviewed by Sagar, merged as #8.
- P0-3 (#4): decisions D019 to D022. Updater off until the first Kvasir release, `publish` at `Bharambe-NL/kvasir`, signing from the environment (`scripts/desktop-dist.mjs`), version `0.0.1`, `notify-website.yml` deleted, release paths and templates renamed. Self-merged as #9 under D010.
- P0-3 evidence (recorded in #9): `desktop:dev` and a packaged rehearsal build (release workflow run 41175349304) both made network requests only to localhost; the packaged app logs "updater disabled until the first Kvasir release", has bundle ID `nl.bharambe.kvasir` and writes to `~/Library/Application Support/Kvasir/data`. The full rename grep returns only the allow-list.

- P0-4 started: decisions D023 to D025 (align `house-style.yml`, protect `main` for admins too, keep the `next dev` version of the `AGENTS.md` block). Plan approved on #5.

## Next

1. Finish the P0-4 commits, set branch protection on `main` once the PR's checks pass (D024), then self-merge through it.
2. Ask whether to do P0-5 in P0 or defer it to P6-4 (the brief asks for this before P0-5).

## Waiting for Sagar

- Whether the two prompts that call the agent "a learning harness" (`src/agent/system-prompt.md`, `src/agent/prompts/practice/00-base.md`) should change. Prompt wording; best handled with P0-5.

Self-merge is allowed in P0 for PRs that need no review from Sagar (D010, recorded in #1).

## Notes

- One test fails on this Mac only: `tests/claude-code-tool-bridge.test.ts` "binds 127.0.0.1". It connects to the LAN address and expects `ECONNREFUSED`. macOS firewall stealth mode drops the packet, so it gets `ETIMEDOUT` after 75 seconds. It passes in CI. The bridge binds `127.0.0.1` correctly.
- `npm run build` rewrites `next-env.d.ts` (`.next/dev/types` to `.next/types`). It is generated; restore it with `git checkout next-env.d.ts` rather than committing it.
- `next dev` rewrites the heading level in the generated block of `AGENTS.md`. Restore it with `git checkout AGENTS.md`; P0-4 owns that file.
- Homebrew at `/usr/local` is the Intel install and fails on this Mac with "Bad CPU type in executable". Install tools another way, or fix Homebrew first.
- This Mac has no Xcode and no Developer ID certificate, so `desktop:dist` cannot build here (the macOS icon needs Xcode 26+). Packaged builds come from a manual run of the release workflow (D022): `gh workflow run release.yml --ref <branch>`, then `gh run download <run> -n kvasir-mac-arm64`.
- Turning auto-update on later needs a published Kvasir release and a public repository, then `AUTO_UPDATE_ENABLED = true` in `electron/main.cjs` (D019).
- A tag release (`v*`) needs the five macOS signing secrets listed in `docs/desktop-release.md`. Do not push a `v*` tag until they exist.
- Upstream LearnHarness 0.4.0 is installed in `/Applications` and uses `~/Library/Application Support/LearnHarness`. Kvasir uses its own `Kvasir` folder (D017).
- `desktop:dev` points Electron at `next dev`, so the server uses the repo `data/` folder. Packaged builds use `~/Library/Application Support/Kvasir/data`.
- Python skill tests: `python3 -B -m unittest discover -s tests/skills` (53 pass on Python 3.9.6). CI does not run them.
- The issue templates still say "This report is public" while the repository is private.
- The upstream mark component and types keep code names `LhMark` and `LhMarkerMessage`. They do not reach the user.
