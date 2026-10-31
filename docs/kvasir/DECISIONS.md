# Decision log

Append-only. One row per decision. Newest at the bottom. A later decision that reverses an earlier one names the row it replaces.

Agents add a row in the same PR that acts on the decision. A decision without a row here does not exist.

| ID | Date | Decision | Decided by | Replaces |
|---|---|---|---|---|
| D001 | 2026-10-30 | Product name is Kvasir | Sagar | |
| D002 | 2026-10-30 | Kvasir is a personal tool first; team features are small-circle sharing | Sagar | |
| D003 | 2026-10-30 | Licence stays AGPL-3.0-only | Sagar | |
| D004 | 2026-10-30 | Separate repository with fresh history; no upstream tracking; fixes ported by hand | Sagar | |
| D005 | 2026-10-30 | Platform is desktop (Electron) plus a mobile companion | Sagar | |
| D006 | 2026-10-30 | Priority areas: voice and mobile, retention, regulation grounding, team and evidence | Sagar | |
| D007 | 2026-10-30 | Proposed, confirm at P1 start: the graph stays objective; learner state lives in a separate learner store | Claude (proposal) | |
| D008 | 2026-10-31 | Repository is `Bharambe-NL/kvasir`, private until the P0 gate passes. Local clone at `~/Code/kvasir` | Sagar | |
| D009 | 2026-10-31 | Commits use the GitHub noreply address `220577379+Bharambe-NL@users.noreply.github.com` | Sagar | |
| D010 | 2026-10-31 | Claude Code may self-merge P0 PRs that need no review from Sagar, once CI is green. Recorded in tracking issue #1 | Sagar | |
| D011 | 2026-10-31 | P0 decision 2: keep the upstream subscription sign-ins (ChatGPT, GitHub Copilot, Grok) | Sagar | |
| D012 | 2026-10-31 | P0 decision 3: rename every `LH_*` environment variable to `KV_*`, with no fallback to the old names | Sagar | |
| D013 | 2026-10-31 | P0 decision 4: `appId` `nl.bharambe.kvasir`, product name `Kvasir`, data folder `Kvasir` (and `Kvasir-dev` for `desktop:dev`) | Sagar | |
| D014 | 2026-10-31 | P0 decision 5: keep the upstream icons and DMG background as the P0 placeholder; a Kvasir icon comes in a later task | Sagar | |
| D015 | 2026-10-31 | P0-2 leaves `release.yml`, `notify-website.yml`, the bug and question issue templates, the `publish` block and `docs/desktop-release.md` to P0-3; the full rename grep is checked at the P0 gate | Sagar | |
| D016 | 2026-10-31 | Internal names (HTTP headers, MCP bridge server name, ChatGPT tool namespace, user agent, env binding, symbol key) are renamed to `kvasir` too | Sagar | |
| D017 | 2026-10-31 | No migration from the LearnHarness data folder; Kvasir starts with its own empty folder and both apps can run side by side | Sagar | |
| D018 | 2026-10-31 | The build-pack docs (`docs/kvasir/`, `CLAUDE.md`, `scripts/bootstrap-kvasir.sh`) may name LearnHarness as lineage and join the rename grep allow-list | Sagar | |
| D019 | 2026-10-31 | Auto-update is off in packaged builds until the first Kvasir release; `publish` points at `Bharambe-NL/kvasir` for future releases | Sagar | |
| D020 | 2026-10-31 | `desktop:dist` builds unsigned and unnotarized by default; it signs and notarizes only when `APPLE_TEAM_ID` and `APPLE_KEYCHAIN_PROFILE` are set | Sagar | |
| D021 | 2026-10-31 | `package.json` version restarts at `0.0.1`, matching the roadmap release tags | Sagar | |
| D022 | 2026-10-31 | P0 packaged macOS checks use an unsigned build from a manual run of the release workflow (the rehearsal path) | Sagar | |
| D023 | 2026-10-31 | `house-style.yml` uses the same action versions and Node version as the other workflows (`checkout@v7`, `setup-node@v7`, Node 26), pinned by the workflow action-version test | Sagar | |
| D024 | 2026-10-31 | `main` is protected: changes need a PR with all CI and house-style checks passing, and the rule applies to admins too | Sagar | |
| D025 | 2026-10-31 | `AGENTS.md` keeps the Next.js block exactly as `next dev` writes it, so dev runs leave the tree clean | Sagar | |
| D026 | 2026-10-31 | P0-5 (house style for the upstream prompts) is deferred out of P0 to a new task P6-7 `p6/house-style-prompts`, which starts after the P6-4 eval harness merges | Sagar | |
| D027 | 2026-10-31 | Until Apple signing secrets exist, a phase release is a notes-only GitHub release; the release workflow run that the tag starts is cancelled before it builds anything | Sagar | |
| D028 | 2026-10-31 | `Bharambe-NL/kvasir` is public from 2026-10-31, after the P0 gate, so GitHub Actions runs without a minutes limit. History scanned for secrets first. Replaces the "private until the P0 gate passes" part of D008 | Sagar | D008 |
| D029 | 2026-10-31 | Claude Code may self-merge P1 PRs that need no review from Sagar, once CI is green. Recorded in tracking issue #13 | Sagar | |
