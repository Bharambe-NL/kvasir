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
| D058 | 2026-10-31 | P2 source formats: EUR-Lex HTML, PDF with a text layer, and Markdown. Scanned PDFs without text are out of scope | Sagar | |
| D059 | 2026-10-31 | A citation is a structured anchor `{ sourceId, version, path, quote }`, for example path `["Article 28", "paragraph 2", "point (a)"]`; the quote must appear verbatim in that unit | Sagar | |
| D060 | 2026-10-31 | Source versions: EUR-Lex documents are identified by CELEX number plus consolidation date; other files by content hash plus a label Sagar gives at import | Sagar | |
| D061 | 2026-10-31 | A proposition whose cited text is removed in a newer version is marked outdated and stays visible, pointing at the version where its text changed | Sagar | |
| D062 | 2026-10-31 | P2 imports files Sagar picks; reading from Eryndal or Hugin is out of scope. The source loader sits behind a port so another provider can plug in later | Sagar | |
| D063 | 2026-10-31 | Source documents and versions live in the graph store: `data/graph/documents.jsonl` (one line per document version, append-only) beside `data/graph/citations.jsonl`, both behind `GraphStore` and written only on the merger side | Sagar | |
| D064 | 2026-10-31 | A EUR-Lex unit's citation path is the full hierarchy, for example `["Chapter V", "Section I", "Article 28", "paragraph 2", "point (a)"]` | Sagar | |
| D065 | 2026-10-31 | Citable parts of a EUR-Lex act: recitals (`["Recital 12"]`), the enacting articles, and annexes (`["Annex I", ...]`) | Sagar | |
| D066 | 2026-10-31 | PDFs and Markdown follow the document's own numbering: for example `["Section 3.2", "paragraph 14"]` for EBA guidelines, and the heading path then paragraph number for Markdown. Unnumbered PDF text falls back to the page number | Sagar | |
| D067 | 2026-10-31 | Test fixtures DORA (32022R2554) and PSD2 (32015L2366) as XHTML from the EU Publications Office Cellar service, and EBA/GL/2019/04 as PDF from eba.europa.eu, are committed under `tests/fixtures/sources/` with their sources acknowledged | Sagar | |
| D068 | 2026-10-31 | The sources extractor cites a unit by a short label shown in its prompt (`[U12] …`); the server maps the label to the unit's path | Sagar | |
| D069 | 2026-10-31 | A proposition from the sources door carries one or more citations | Sagar | |
| D070 | 2026-10-31 | The quote check is exact after collapsing whitespace and treating curly and straight quotes, apostrophes and dashes alike; a quote has at least 4 words; a failing quote is sent back to the model to fix | Sagar | |
| D071 | 2026-10-31 | P2-3 includes `POST /api/sources/import` and routes `.xhtml`/`.html` and `.pdf` files from the existing import button through the sources door | Sagar | |
| D072 | 2026-10-31 | An Official Journal text's version date is the act's date from its title (DORA: 2022-12-14) | Sagar | |
| D073 | 2026-10-31 | Importing a version that is already imported is refused with "This version of <title> is already imported."; nothing is re-extracted | Sagar | |
| D074 | 2026-10-31 | PDF and Markdown imports ask for a version label, prefilled with the file name | Sagar | |
| D075 | 2026-10-31 | Markdown stays a notes import by default; a "cite as source" toggle sends it through the sources door | Sagar | |
| D076 | 2026-11-01 | At import, every parsed unit of a version is stored in `data/graph/document-units/<versionId>.json`, written once and never changed; the citation panel and P2-5's version diff read it | Sagar | |
| D077 | 2026-11-01 | A citation chip uses a legal short form: "Regulation (EU) 2022/2554, Art. 28(2)(a)", "Recital 12", "Annex I, point 3(a)"; PDFs and Markdown use their label, for example "EBA/GL/2019/04, 3.3.3 para 17". Two or more citations show the first plus "+N" | Sagar | |
| D078 | 2026-11-01 | Clicking a chip opens a right-side panel over the current view: document title, version, path, the unit's heading and text with the quote highlighted, and every citation of the proposition. Esc or X closes it | Sagar | |
| D079 | 2026-11-01 | In transcripts, the chip appears in the graph context card | Sagar | |
| D080 | 2026-11-01 | A cited proposition is outdated when the newest version of its source no longer has the cited unit, or that unit no longer contains the quote; it points at the first later version where this happened | Sagar | |
| D081 | 2026-11-01 | Importing a new version extracts only units that are new or whose text changed since the previous version; unchanged units are skipped and their propositions stay current | Sagar | |
| D082 | 2026-11-01 | The import dialog has a "Version of" choice for PDF and Markdown: a new document, or one of the imported PDF or Markdown documents, preselected when the file name matches. EUR-Lex versions join their document by CELEX number | Sagar | |
| D083 | 2026-11-01 | An outdated citation shows an amber "Outdated" tag on the chip; the panel adds "Changed in version <label>" with that version's text for the unit, or "Removed in version <label>" | Sagar | |
| D084 | 2026-11-01 | In the teacher's lesson a citation is a link in a fixed form that the chat renders as the citation chip; a click opens the source panel on that paragraph | Sagar | |
| D085 | 2026-11-01 | The teacher sees the citations of a session's picked propositions in the session context, and has a `read_source` tool to look up a document's articles and paragraphs by address or by words | Sagar | |
| D086 | 2026-11-01 | `read_source` rides the existing "Graph tools" setting and the graph switch; no new setting | Sagar | |
| D087 | 2026-11-01 | Only the teacher gets `read_source`; the prober keeps its map tools | Sagar | |
| D088 | 2026-11-01 | P2 passed its gate before P1, so the P2 release is `v0.2.0` (package version 0.2.0) and includes the P1 work; when P1 passes its gate it is recorded in the roadmap and release notes without a separate `v0.1.0` tag, so versions stay in order | Sagar | |
| D089 | 2026-11-01 | Self-merge is allowed in P6 for PRs that need no review from Sagar (no contract, prompt, store format or user-facing text change), as D029 and D057 allowed for P1 and P2 | Sagar | |
| D090 | 2026-11-01 | The MCP server's read-only tools: `search_graph`, `get_proposition`, `list_sources`, `read_source`, `list_sessions` and `review_status` | Sagar | |
| D091 | 2026-11-01 | Claude Desktop runs the MCP server as a command over stdio; it reads the Kvasir data folder directly and works whether or not the app is open | Sagar | |
| D092 | 2026-11-01 | The MCP server shares learner state read-only: recall and next due date per proposition, due counts, weak propositions and measured retention | Sagar | |
| D093 | 2026-11-01 | The MCP server is installed with a documented `claude_desktop_config.json` entry (printed by `npm run mcp:config`); `npm run mcp` runs it directly | Sagar | |
| D094 | 2026-11-01 | In teaching evals a simulated learner (a model playing a scripted persona: knowledge, misconceptions, style) answers the prober and teacher | Sagar | |
| D095 | 2026-11-01 | Eval transcripts are scored by a rubric judge (each item 0 to 2 with a quoted reason) plus deterministic checks read from the transcript | Sagar | |
| D096 | 2026-11-01 | The first eval scenarios: DORA Article 28 with a misconception (uses the imported source), a conceptual topic without a source (Bayes' rule, confusing P(A|B) with P(B|A)), and a fast learner who already knows most of it | Sagar | |
| D097 | 2026-11-01 | Eval results are committed in the repo under `evals/results/<short commit>/`: one JSON per scenario and a `summary.md` | Sagar | |
| D098 | 2026-11-01 | An eval run uses the session model (strong slot) for the prober and teacher, the cheap slot for the simulated learner, the strong slot for the judge, at most 12 learner replies per scenario, and prints tokens and cost | Sagar | |
| D099 | 2026-11-01 | The simulated learner runs on a provider other than Anthropic, which blocks a model writing the learner side of a session: `KV_EVAL_LEARNER` (provider/model id), default `openrouter/deepseek/deepseek-v4.1-flash`. The session and judge stay on the strong slot | Sagar | D098 (learner slot only) |
| D100 | 2026-11-01 | Exports start from an Export menu in the graph toolbar with two items, Obsidian vault and Anki deck; the server writes the files and the app shows where | Sagar | |
| D101 | 2026-11-01 | The Anki export is a text import file (`.txt` with Anki's header lines, imported with File > Import), with the proposition id as the guid so a re-export updates the same notes | Sagar | |
| D102 | 2026-11-01 | An Anki card is a Basic note, one per proposition: the name on the front; the statement, its reasoning chains and its citations on the back; tagged by birth session | Sagar | |
| D103 | 2026-11-01 | The Obsidian vault has one note per proposition, named after it (a short id suffix only when names clash): the statement, a Because section with one line per chain linking its premises, a Leads to section linking what it supports, citations, and frontmatter with the id, aliases and birth session | Sagar | |
| D104 | 2026-11-01 | The Obsidian vault carries every proposition; the Anki deck leaves out propositions whose birth session is excluded from review | Sagar | |
| D105 | 2026-11-01 | Each export writes a new folder `~/Documents/Kvasir exports/<date time>/` and never overwrites; the menu shows the path with a Show in Finder button | Sagar | |
| D106 | 2026-11-01 | The SQLite adapters use Node's built-in `node:sqlite` (works in Node 26 and in the packaged app's Node 24.22); no new dependency | Sagar | |
| D107 | 2026-11-01 | SQLite holds the graph ledgers (nodes, chains, coverage, checkpoints, documents, citations, sources, document units, positions), the learner ledgers, chats and jobs, in one `data/kvasir.db`. Settings, prompt overrides and render settings stay JSON files; `auth.json` never moves | Sagar | |
| D108 | 2026-11-01 | `src/server/stores.ts` uses the SQLite adapters when `data/kvasir.db` exists and the file adapters otherwise | Sagar | |
| D109 | 2026-11-01 | Migration with the app closed: `npm run migrate:sqlite` copies everything into `data/kvasir.db`, checks the counts, then moves the old files to `data/pre-sqlite-<date>/`; `npm run migrate:files` writes the database back out as the same files and moves `kvasir.db` to `data/pre-files-<date>/`. Nothing is deleted | Sagar | |
| D110 | 2026-11-01 | SQLite tables keep each record as JSON exactly as the files hold it, plus indexed key columns (id, chat id, node id, version id); insertion order is ledger order | Sagar | |
| D111 | 2026-11-01 | "Store tests pass against both adapters" means shared port contract suites in `tests/store-contract/`, one per port, run once per adapter, plus golden data migrated both ways reading back identically. Other tests keep the file adapters | Sagar | |
| D112 | 2026-11-01 | Encryption at rest covers everything the stores hold (graph and learner ledgers, document units, chats, jobs, sources, positions; on files or SQLite) and `auth.json`. `settings.json`, prompt overrides, render settings and the format stamp stay readable | Sagar | |
| D113 | 2026-11-01 | The data key is sealed with Electron `safeStorage` (Keychain, DPAPI or libsecret) in `data/encryption.json`; the main process unseals it and sends it to the server child over the private IPC channel, never in an environment variable | Sagar | |
| D114 | 2026-11-01 | Key recovery: turning encryption on shows a recovery key once (24 letters and digits in groups, with Copy); the data key is sealed by both the keychain and the recovery key, and the recovery key re-seals it to a new keychain | Sagar | |
| D115 | 2026-11-01 | Encryption is turned on and off in a Security section in Settings (desktop app only); turning off decrypts in place after a confirm | Sagar | |
| D116 | 2026-11-01 | When the keychain cannot unlock the data, the app shows a Locked screen asking for the recovery key; a wrong key changes nothing, and no store is read or written while locked | Sagar | |
| D117 | 2026-11-01 | Each value is sealed on its own with AES-256-GCM (random 12-byte nonce, the ledger or record id as associated data), stored as `{"kv":1,"iv","ct","tag"}` in base64 where the JSON was; `data/encryption.json` holds the sealed keys and a check value | Sagar | |
| D118 | 2026-11-01 | The MCP server refuses clearly when the data is encrypted; no key leaves the app | Sagar | |
| D119 | 2026-11-01 | A phase gate no longer blocks other phases: P3, P4 (after P3) and P5 may start now. Gates still record each phase's checks before its release tag | Sagar | ROADMAP "a phase starts only when the previous phase gate has passed" |
| D120 | 2026-11-01 | P1's real-use check (two weeks of reviews on schedule) stays as a later, non-blocking check, recorded once Sagar has used reviews for two weeks | Sagar | |
| D121 | 2026-11-01 | New phase P7 Look and feel: a new app symbol, colour themes users can pick, a light mode and a polish pass. Opened first, before P3 | Sagar | |
| D122 | 2026-11-01 | Self-merge is allowed in P7 for PRs that need no review from Sagar; anything visible (colours, the symbol, text) still waits for his approval | Sagar | |
| D123 | 2026-11-01 | Tailwind palette classes (`text-red-500`, `bg-white` and the like) count as hard-coded colours; with hex, rgb, hsl and oklch literals they move onto tokens | Sagar | |
| D124 | 2026-11-01 | Status colour tokens are `--danger`, `--warning`, `--success` (beside `--destructive`), with `--heat-low`, `--heat-mid`, `--heat-high` for the retention overlay, `--confidence-0` to `--confidence-100` for the rail, and `--scrim` for dark overlays | Sagar | |
| D125 | 2026-11-01 | A test fails `npm test` on any hard-coded colour outside the token files, with a short allow list for real exceptions | Sagar | |
| D126 | 2026-11-01 | Today's shades are kept exactly: each status colour gets a main and a soft token (`--danger` and `--danger-soft` as red-500 and red-400, and the same for warning and success); red-300's two uses become `--danger-soft` | Sagar | |
| D127 | 2026-11-01 | Two more colour tokens: `--paper` (the white backing behind rendered SVGs and demos, white in every theme) and `--ink-bright` (the plan diagram ink and the callout border, white in dark mode); `--on-accent` is text on coloured buttons | Sagar | |
| D128 | 2026-11-01 | Mode offers Dark, Light and System (follows the Mac and switches live); the default stays Dark | Sagar | |
| D129 | 2026-11-01 | The light palette is warm paper: background #faf8f4, cards #f2efe9, text #1c1b19, borders #d9d4ca | Sagar | |
| D130 | 2026-11-01 | The Background setting becomes one per mode (Dark background, Light background), each with its own derivation: lighter steps in dark, darker steps in light | Sagar | |
| D131 | 2026-11-01 | Settings shape: `appearance.mode` is `"dark" | "light" | "system"`; `appearance.background` keeps meaning the dark background; a new `appearance.lightBackground` (hex or null) is the light one. No migration | Sagar | |
| D132 | 2026-11-01 | A colour theme sits on top of Mode: each theme has a dark and a light version and Mode picks one. E-ink's light version is paper and ink, its dark version white ink on black | Sagar | |
| D133 | 2026-11-01 | Four preset themes: Kvasir (today's palettes), Sepia, Forest and E-ink | Sagar | |
| D134 | 2026-11-01 | Custom colour is one accent, the highlight colour (swatches plus a hex field), over any preset; the per-mode background fields stay | Sagar | |
| D135 | 2026-11-01 | The chromatic accent token is `--highlight` with `--on-highlight` for text on it (Tailwind `bg-highlight`, `ring-highlight` and so on); `--accent` stays the grey hover background | Sagar | |
| D136 | 2026-11-01 | E-ink shows colour-coded things with greys plus shape: three grey heat levels and a ring on slipping nodes, a grey confidence fill with ticks, status text in ink with a symbol, grey cluster regions, and all motion off | Sagar | |
| D137 | 2026-11-01 | Settings shape: `appearance.theme` is `"kvasir" | "sepia" | "forest" | "eink"` (default `"kvasir"`); `appearance.highlight` is a hex or null (null = the theme's own). Optional, no migration | Sagar | |
| D138 | 2026-11-01 | Cluster regions take `--region-saturation`, `--region-lightness` and `--region-label-lightness` per theme and mode (E-ink: saturation 0); the hue stays per cluster | Sagar | |
| D139 | 2026-11-01 | The Kvasir symbol is a chevron and a round gold dot (a prompt, then the point) on a black squircle. Checked against the marks of Claude Code, Cursor, GitHub Copilot, Replit, v0 and OpenAI Codex (the closest: `›_` in a cloud) and terminal `>_` icons; no match found. Not a legal trademark search | Sagar | |
| D140 | 2026-11-01 | In the app the mark's chevron takes the theme's ink and the dot stays Kvasir gold in every theme (grey in E-ink), through `--mark-fill` and `--mark-detail` | Sagar | |
| D141 | 2026-11-01 | The P7-5 polish list has four areas: the chat session; review; home, graph and sidebar; settings and dialogs. Small motion runs across all four | Sagar | |
| D142 | 2026-11-01 | Chat text runs in a centred column of about 72 characters; code blocks, tables and diagrams may run wider; the composer lines up with the column | Sagar | |
| D143 | 2026-11-01 | Type keeps three families with set roles: mono only for small labels, numbers and keys; sans for controls and body text; serif only for page and session titles, at a calmer size; one type scale | Sagar | |
| D144 | 2026-11-01 | Motion is subtle and quick: fades and short slides of 150 to 200 ms on dialogs, menus, the review card and new messages; off for reduced motion and in E-ink | Sagar | |
| D145 | 2026-11-01 | Each polish area is done when Sagar approves before and after screenshots in Kvasir dark and light, plus one sheet across the four themes; each area is its own commit | Sagar | |
| D146 | 2026-11-01 | The zero-keys notice reads "No provider key yet. Add one to start." ("Add one" is the link), true whenever it shows; replaces the plan's "No model yet." | Sagar | |
| D147 | 2026-11-01 | Release tags count up in release order: each phase gate takes the next minor after the latest release (`v0.7.0` shipped first, so the next gate is `v0.8.0`), so the auto-updater always sees a newer version | Sagar | ROADMAP's per-phase tags for P3 to P6 |
| D148 | 2026-11-01 | Self-merge is allowed in P3 for PRs that need no review from Sagar (no contract, prompt, store format or user-facing change), once CI is green, as in P7 (D122). Recorded in tracking issue #88 | Sagar | |
| D149 | 2026-11-01 | The `voice` prompt profile is an overlay: fragments in `src/agent/prompts/voice/` add to the prober and teacher prompts in a voice session, and a voice speaking guide replaces `shared/40-formatting.md` (Markdown and LaTeX) | Sagar | |
| D150 | 2026-11-01 | P3-1 adds the profile to prompt composition and its tests only; the `voice` flag on the chat record comes in P3-3 with `ask_spoken`, so prompts and tools switch together | Sagar | |
| D151 | 2026-11-01 | In voice, the prober asks the four setup questions (background, goal, session length, hint style) first, one at a time; the answers stay in the transcript, where the teacher reads them. No `probe_done` change | Sagar | |
| D152 | 2026-11-01 | Voice examples come from the field the learner names in the background question; the prompt gives EU payments, EPI, Wero and regulators as Sagar's case | Sagar | |
| D153 | 2026-11-01 | P3-1's "prompt eval cases pass" is a scripted live check: the real prober and teacher with the voice profile against fixed learner replies, each reply checked for one question, no formula symbols, no option lists, no Markdown and a length cap; asked before each run. Deterministic composition tests run in `npm test` | Sagar | |
| D154 | 2026-11-01 | Text-to-speech is Deepgram Aura-2 ($0.030 per 1,000 characters, about $0.81 an hour of session), on the Deepgram key dictation already uses | Sagar | |
| D155 | 2026-11-01 | A reply is spoken sentence by sentence as it streams; stopping cuts the rest | Sagar | |
| D156 | 2026-11-01 | Text-to-speech uses a short-lived Deepgram token minted by the server, as dictation does; the window streams text to Deepgram and plays the audio directly | Sagar | |
| D157 | 2026-11-01 | The voice SpeechIn adapter is new, beside dictation, reusing its pure helpers; moving dictation onto it is a later change | Sagar | |
| D158 | 2026-11-01 | The default voice is `aura-2-thalia-en`, one setting value; a voice picker can come with drive mode (P3-5) | Sagar | |
