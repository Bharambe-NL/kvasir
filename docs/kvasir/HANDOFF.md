# Handoff

Updated by Claude Code at the end of each session. Read this first.

## Current state

- Phase: P0 (in progress)
- Task: P0-1 Import (local import done, GitHub not set up)
- Branch: `main` (local only, two commits from `scripts/bootstrap-kvasir.sh`)
- PR: none yet

## Done

- Build pack written (product brief, roadmap, workflow, phase briefs, agent files).
- P0 decision 1 taken: `Bharambe-NL/kvasir`, private (D008). Commit email: GitHub noreply (D009).
- Bootstrap run locally into `~/Code/kvasir`: commit `390fd68` imports upstream `dc4c398` unchanged, commit `422f576` adds the build pack.
- Gates on the imported tree with Node 26.8.1: `npm ci`, typecheck, lint and build pass. `npm test`: 2938 of 2939 pass.

## Next

1. Install `gh` and sign in (see Waiting for Sagar).
2. Commit D008 and this handoff, then create the repository: `gh repo create Bharambe-NL/kvasir --private --source . --push`.
3. Confirm the failing test passes in CI, then close P0-1.
4. Open the P0 milestone, tracking issue and task issues with `/kv-phase P0`.

## Waiting for Sagar

- Install the GitHub CLI and run `gh auth login`. Homebrew at `/usr/local` fails with "Bad CPU type in executable" (Intel Homebrew without Rosetta on Apple Silicon).
- P0 open decisions 2 to 5.

## Notes

- One test fails on this Mac only: `tests/claude-code-tool-bridge.test.ts` "binds 127.0.0.1". It connects to the LAN address and expects `ECONNREFUSED`. macOS firewall stealth mode drops the packet, so it gets `ETIMEDOUT` after 75 seconds. The bridge binds `127.0.0.1` correctly. Expected to pass in CI.
- `npm run build` rewrites `next-env.d.ts` (`.next/dev/types` to `.next/types`). It is generated; restore it with `git checkout next-env.d.ts` rather than committing it.
- Upstream auto-update points at LearnHarness releases. P0-3 must fix this before any packaged build is installed.
- Upstream `desktop:dist` script carries the upstream Apple team ID. Remove in P0-3.
