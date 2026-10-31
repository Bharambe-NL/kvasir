# Handoff

Updated by Claude Code at the end of each session. Read this first.

## Current state

- Phase: P0 (in progress). Milestone "P0 Bootstrap and rename", tracking issue #1.
- Task: P0-2 Identity rename (#3). Plan approved on #3.
- Branch: `p0/rename`
- PR: draft, linked to #3

## Done

- Build pack written (product brief, roadmap, workflow, phase briefs, agent files).
- P0 decision 1 taken: `Bharambe-NL/kvasir`, private (D008). Commit email: GitHub noreply (D009).
- Repository `Bharambe-NL/kvasir` created private and pushed. Commit `390fd68` imports upstream `dc4c398` unchanged, commit `422f576` adds the build pack, commit `070829d` records D008 and D009.
- CI on `070829d` is green: typecheck, tests and lint, the three standalone builds (mac-arm64, linux-x64, windows-x64), and the house-style check.
- `gh` 2.103.3 installed at `~/.local/bin/gh` from the official release (checksum verified), signed in as `Bharambe-NL`.
- Phase P0 opened: milestone 1, labels `phase`, `task` and `P0`, tracking issue #1, task issues #2 to #6. Roadmap PR #7 merged.
- P0-1 (#2) closed with the CI evidence and ticked in #1.
- P0-2 started: decisions D011 to D018 taken (P0 decisions 2 to 5, plus four found during investigation). Plan posted and approved on #3.

## Next

1. Finish the P0-2 commits in the order of the plan on #3: `KV_*` rename, internal names, app identity, user-facing text, skill move, docs.
2. Run the rename grep and a `desktop:dev` check, then mark the PR ready for Sagar's review.
3. Set branch protection on `main` (require a PR and passing checks), once Sagar agrees.

## Waiting for Sagar

- Branch protection on `main`: set it in GitHub settings, or ask Claude to set it with `gh`.
- Review of the P0-2 PR when it is ready (it changes user-facing text).

Self-merge is allowed in P0 for PRs that need no review from Sagar (D010, recorded in #1).

## Notes

- One test fails on this Mac only: `tests/claude-code-tool-bridge.test.ts` "binds 127.0.0.1". It connects to the LAN address and expects `ECONNREFUSED`. macOS firewall stealth mode drops the packet, so it gets `ETIMEDOUT` after 75 seconds. It passes in CI. The bridge binds `127.0.0.1` correctly.
- `npm run build` rewrites `next-env.d.ts` (`.next/dev/types` to `.next/types`). It is generated; restore it with `git checkout next-env.d.ts` rather than committing it.
- Homebrew at `/usr/local` is the Intel install and fails on this Mac with "Bad CPU type in executable". Install tools another way, or fix Homebrew first.
- `notify-website.yml` runs on published releases and `release.yml` on `v*` tags. Do not publish a release or push a tag before P0-3.
- Upstream auto-update points at LearnHarness releases. P0-3 must fix this before any packaged build is installed.
- Upstream `desktop:dist` script carries the upstream Apple team ID. Remove in P0-3, together with the `LH_NOTARY` keychain profile name (P0-2 leaves it).
- `package.json` `version` is still the upstream `0.4.0`. The P0 release tag is `v0.0.1`. Settle the version in P0-3.
- Upstream LearnHarness 0.4.0 is installed in `/Applications` and uses `~/Library/Application Support/LearnHarness`. After P0-2, Kvasir uses its own `Kvasir` folder (D017).
- Python skill tests: `python3 -B -m unittest discover -s tests/skills` (53 pass on Python 3.9.6). CI does not run them.
