# Handoff

Updated by Claude Code at the end of each session. Read this first.

## Current state

- Phase: P0 (in progress). Milestone "P0 Bootstrap and rename", tracking issue #1.
- Task: P0-3 Release plumbing (#4). Plan approved on #4; self-merge once CI is green (D010).
- Branch: `p0/release`
- PR: draft, linked to #4

## Done

- Build pack written (product brief, roadmap, workflow, phase briefs, agent files).
- P0 decision 1 taken: `Bharambe-NL/kvasir`, private (D008). Commit email: GitHub noreply (D009).
- Repository `Bharambe-NL/kvasir` created private and pushed. Commit `390fd68` imports upstream `dc4c398` unchanged, commit `422f576` adds the build pack, commit `070829d` records D008 and D009.
- CI on `070829d` is green: typecheck, tests and lint, the three standalone builds (mac-arm64, linux-x64, windows-x64), and the house-style check.
- `gh` 2.103.3 installed at `~/.local/bin/gh` from the official release (checksum verified), signed in as `Bharambe-NL`.
- Phase P0 opened: milestone 1, labels `phase`, `task` and `P0`, tracking issue #1, task issues #2 to #6. Roadmap PR #7 merged.
- P0-1 (#2) closed with the CI evidence and ticked in #1.
- P0-2: decisions D011 to D018 taken (P0 decisions 2 to 5, plus four found during investigation). Plan approved on #3. All plan commits pushed to #8, plus a fix for the page title ("Learning Harness", which the brief's grep misses). Local gates green apart from the known firewall test; rename grep clean against the allow-list; `desktop:dev` shows the Kvasir title and uses `Kvasir-dev`.
- P0-2 reviewed and approved by Sagar, squash merged as #8, ticked in #1.
- P0-3 started: decisions D019 to D022 (updater off until the first release, unsigned builds unless signing env is set, version 0.0.1, packaged checks from a CI rehearsal run). Plan approved on #4.

## Next

1. Finish the P0-3 commits in the order of the plan on #4: updater off, signing from env, version, workflows and templates, docs.
2. Collect the evidence: `desktop:dev` network log, then a manual release workflow run on `p0/release` and the packaged app's network log, `main.log` and data folder.
3. Self-merge P0-3 once CI is green, tick it in #1.
4. Set branch protection on `main` (require a PR and passing checks), once Sagar agrees.

## Waiting for Sagar

- Branch protection on `main`: set it in GitHub settings, or ask Claude to set it with `gh`.
- Whether the two prompts that call the agent "a learning harness" (`src/agent/system-prompt.md`, `src/agent/prompts/practice/00-base.md`) should change. Prompt wording; best handled with P0-5.

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
- P0-3: `release.yml` hard-codes `dist/.../LearnHarness.app` and `learnharness` paths. With `productName` Kvasir these would break a release run, so fix them with the publish target.
- `desktop:dev` points Electron at `next dev`, so the server uses the repo `data/` folder. `KV_DATA_DIR` (the user-data `data/` folder) is set only in packaged builds; P0-3 checks that path. Electron also leaves an empty `Kvasir` folder in dev.
- `next dev` rewrites the heading level in the generated block of `AGENTS.md`. Restore it with `git checkout AGENTS.md`; P0-4 owns that file.
- The upstream mark component and types keep code names `LhMark` and `LhMarkerMessage`. They do not reach the user.
