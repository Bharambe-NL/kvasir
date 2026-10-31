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
| D030 | 2026-10-31 | P1 decision 1: D007 confirmed. Learner state lives in a separate store under `data/learner/`, owned by the Memory system, which reads the graph and never writes to it | Sagar | D007 |
| D031 | 2026-10-31 | P1 decision 2: one review card is one proposition (graph node); the card key is the node id. The node's chains may give context to a review question | Sagar | |
| D032 | 2026-10-31 | P1 decision 3: the scheduler uses `ts-fsrs` 5.4.2 from npm, pinned exactly (MIT, no dependencies). A move to 6.x is its own task once 6 has settled | Sagar | |
| D033 | 2026-10-31 | Scheduler target retention is 0.90 (the FSRS default) | Sagar | |
| D034 | 2026-10-31 | Scheduler keeps the FSRS short-term steps: new cards return after 1 and 10 minutes, a forgotten card after 10 minutes, then day-based scheduling | Sagar | |
| D035 | 2026-10-31 | Interval fuzz is off: the same reviews always give the same schedule. Clumping is handled by the daily limit (P1 decision 6) | Sagar | |
| D036 | 2026-10-31 | P1 decision 4: every proposition in the graph gets a review card automatically, introduced at its createdAt. The per-birth-session opt-out becomes its own task, P1-8 | Sagar | |
| D037 | 2026-10-31 | Repository interactions limited to collaborators for six months (until 2027-04-30), after an automated account (`basic-AKB`) posted task reports on the public P1 issues. Its 7 comments were deleted | Sagar | |
| D038 | 2026-10-31 | P1 decision 5: review questions use two formats chosen by card phase. New, learning and relearning cards get a cue-and-recall question; review-phase cards get an applied scenario. The learner always self-rates (Again, Hard, Good, Easy) after seeing the answer | Sagar | |
| D039 | 2026-10-31 | Review questions are pre-generated in the background under the shared background-LLM semaphore and stored append-only in `data/learner/questions.jsonl`, one per card per review cycle | Sagar | |
| D040 | 2026-10-31 | The review generator runs on the cheap model slot | Sagar | |
| D041 | 2026-10-31 | P1 decision 6: the review queue shows at most 20 new cards and at most 200 reviews in all per day (local day) | Sagar | |
| D042 | 2026-10-31 | A card whose generated question is not ready (generating, failed, or no model configured) shows the proposition name as the cue and reveals the full statement; the generated question replaces it once stored | Sagar | |
| D043 | 2026-10-31 | The review page is reached from a third sidebar row, "Review", below Teaching and Practice | Sagar | |
| D044 | 2026-10-31 | No typed answers on the review page: think, reveal with Space, rate with keys 1 to 4 | Sagar | |
| D045 | 2026-10-31 | The retention heat shows each proposition's current recall chance (FSRS retrievability); unreviewed propositions get no heat | Sagar | |
| D046 | 2026-10-31 | Heat encoding: red below 70%, amber from 70% to 90%, green at 90% or above; unreviewed nodes keep the normal colour. Colour appears only while the overlay is on | Sagar | |
| D047 | 2026-10-31 | The overlay toggle is a "Retention" button in the home graph toolbar, off by default, remembered in the window's local storage (nothing written to data/graph/) | Sagar | |
| D048 | 2026-10-31 | The due count shows on the sidebar Review row and as a chip in the home graph toolbar that opens /review; both hide when nothing is due | Sagar | |
| D049 | 2026-10-31 | `list_weak_propositions` is given to both the prober and the teacher | Sagar | |
| D050 | 2026-10-31 | It is gated by its own "Memory tools" toggle under Settings, Agent, Tools (default on), and also requires the graph to be on | Sagar | |
| D051 | 2026-10-31 | Weak means a reviewed proposition with current recall chance below 80%; the tool returns the weakest 15, weakest first | Sagar | |
| D052 | 2026-10-31 | Each line shows name, recall percentage, lapses, last review date and node id; never the statement text (the map tools' names-only rule) | Sagar | |
| D053 | 2026-10-31 | The review opt-out control lives on each cluster row of the Chains table (chats and notes imports) and in the sidebar session right-click menu (chats) | Sagar | |
| D054 | 2026-10-31 | An excluded session's cards leave everything derived from the card source: the queue, the due count, the retention heat, the memory tool and question pre-generation. Their reviews stay in the ledger | Sagar | |
| D055 | 2026-10-31 | `data/learner/exclusions.jsonl` holds toggle events `{id, sessionId, excluded, at}`, append-only; the latest line per session decides | Sagar | |
| D056 | 2026-10-31 | The control reads "Exclude from review", and "Include in review" once excluded; an excluded cluster row shows a muted "Not in review" tag | Sagar | |
| D057 | 2026-10-31 | Self-merge is allowed in P2 for PRs that need no review from Sagar (no contract, prompt, store format or user-facing text change), as D029 allowed for P1 | Sagar | |
