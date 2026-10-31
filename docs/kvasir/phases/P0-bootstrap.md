# P0: Bootstrap and rename

## Goal

A working Kvasir desktop app in its own repository, with every upstream identity removed or replaced, CI green, and the build pack docs in place. No new features.

## Read first

- `docs/kvasir/LINEAGE.md`
- `docs/kvasir/WORKFLOW.md`
- `docs/development.md` and `docs/desktop-release.md` (upstream)

## Open decisions (ask before the task that needs them)

1. GitHub owner for the repository. Default proposal: `Bharambe-NL/kvasir`, private until P0 passes.
2. Whether to keep the upstream subscription connections (ChatGPT, GitHub Copilot, Grok sign-in). Default proposal: keep, they cost nothing to carry.
3. Environment variable prefix: rename `LH_*` to `KV_*`, or keep `LH_*`. Default proposal: rename, with no fallback to the old names.
4. App identifiers: `appId` `nl.bharambe.kvasir`, product name `Kvasir`. Confirm.
5. Icon and banner: a placeholder is fine for P0. Confirm.

## Tasks

Each task is one branch and one PR.

### P0-1 Import

Branch `p0/import`. Run `scripts/bootstrap-kvasir.sh` from this pack (or follow it by hand). Commit the upstream tree at `dc4c398` as the first commit with the message `chore: import LearnHarness dc4c398 (AGPL-3.0)`. Add this pack's files in a second commit.

Done when: `npm ci && npm run typecheck && npm run lint && npm test && npm run build` pass on the imported tree, unchanged.

### P0-2 Identity rename

Branch `p0/rename`. Replace LearnHarness identity everywhere it reaches the user or the operating system:

- `package.json`: `name`, `description`, `homepage`, `desktopName`, `author` (keep upstream author under `contributors`).
- `electron-builder.yml`: `appId`, `productName`, artifact names.
- `electron/*.cjs`: window titles, protocol names, user-data folder names.
- `config.ts` and every `LH_*` environment variable (per decision 3).
- UI strings in `components/` and `app/`.
- The bundled data-reading skill: move `skills/learnharness` to `skills/kvasir` and update its text.
- `README.md`: rewrite for Kvasir. Add a "Based on LearnHarness" section that links `LINEAGE.md`.

Keep the upstream copyright line in `LICENSE`-related notices and in source headers where present.

Done when: `grep -rni "learnharness" --exclude-dir=node_modules --exclude-dir=.git .` returns only `LINEAGE.md`, the README lineage section, `docs/archive/`, and author credits.

### P0-3 Release plumbing

Branch `p0/release`. This prevents the most dangerous inheritance: the auto-updater.

- Point `publish` in `electron-builder.yml` at the Kvasir repository, or disable auto-update until a Kvasir release exists. An unchanged updater would download LearnHarness builds over Kvasir.
- Remove the upstream Apple team ID and notary profile from `package.json` scripts. Read signing settings from environment variables.
- Delete `.github/workflows/notify-website.yml`.
- Update `release.yml` and the issue templates for Kvasir.

Done when: a local `desktop:dev` run shows Kvasir everywhere, writes data to a Kvasir user-data folder, and makes no request to the upstream update feed (check the network log).

### P0-4 Agent files and house style

Branch `p0/agent-files`. Install `CLAUDE.md`, `AGENTS.md`, `.claude/commands/`, `.github/` templates and `docs/kvasir/` from this pack. Keep the upstream Next.js agent-rules block at the top of `AGENTS.md`. Add the house-style check (`scripts/house-style-check.mjs`) and its CI workflow. At this stage it scans Kvasir-owned files only.

Done when: CI runs the four gates plus the house-style check on every PR.

### P0-5 House style for upstream text

**Deferred to P6-7 (D026).** Sagar chose to wait for the P6-4 eval harness, so the rewrite can be checked against it. P0 closes without this task.

Branch `p0/house-style-prompts`. The upstream prompts in `src/agent/prompts/` and `src/agent/system-prompt.md` have about 190 house-style findings (mostly em dashes). Rewrite them to house style without changing teaching behaviour, then add `README.md`, `src/agent/system-prompt.md` and `src/agent/prompts` to `DEFAULT_PATHS` in `scripts/house-style-check.mjs`.

This changes prompts, so Sagar reviews the PR. Ask first whether to do this in P0 or defer it to P6-4, so the eval harness can confirm teaching quality did not drop.

Done when: the house-style check passes with the wider paths, and a live session teaches as before.

## Gate acceptance checks

1. Fresh clone builds and all four gates pass.
2. The macOS app installs, opens, runs a full probe, plan, teach session with Sagar's own key, and the graph updates.
3. No network request reaches upstream update or website endpoints.
4. The rename grep from P0-2 is clean.

## Gate results

(record here)
