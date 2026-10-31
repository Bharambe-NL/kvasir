# Kvasir product brief

Owner: Sagar Bharambe. Status: approved direction, 30 October 2026.

## What Kvasir is

Kvasir is a personal learning system. It teaches hard material step by step, keeps what was taught in a knowledge graph, and makes sure that knowledge stays in memory over months.

It starts from a clean import of LearnHarness (AGPL-3.0, upstream commit `dc4c398`, 29 October 2026). It lives in its own repository with its own history. It does not track upstream. See `LINEAGE.md`.

## Who it is for

One user: Sagar. A senior risk and compliance professional in European payments who learns regulations, research papers and technical topics, often by voice while driving.

Team features (phase 5) serve a small circle he chooses to share with. Kvasir is not a hosted multi-user product.

## What we keep from LearnHarness

These parts are strong. Build on them and keep their rules.

- The probe, plan, teach, practice loop.
- The extraction pipeline (extractor, auditor, merger) as the only graph writer.
- Propositions and reasoning chains as the stored truth. The canvas is a derived view.
- The layered architecture and the import law enforced by ESLint.
- One writer per store. Append-only evidence. Everything else derived.
- Deterministic tests with injected engines. No network in tests.
- Bring-your-own keys and local storage.

## What Kvasir adds

| Area | Summary | Phase |
|---|---|---|
| Retention | A learner layer and an FSRS review schedule over propositions | 1 |
| Regulation grounding | PDF and legal-text import with article-level citations and version tracking | 2 |
| Voice | A full spoken tutor that follows the Socratic Tutor contract, with a drive mode | 3 |
| Mobile | A phone companion for reviews and voice sessions, synced with the desktop | 4 |
| Team and evidence | Shareable graph bundles and exportable training records | 5 |
| Platform | SQLite storage, an MCP server, Obsidian and Anki export, a teaching eval harness | 6 |

## Product principles

1. **Local first.** Data stays on Sagar's machines. Sync is device to device, under his control.
2. **The graph stays objective.** The graph holds facts about the world. What Sagar knows lives in a separate learner store. This keeps the upstream rule that the graph never stores mastery.
3. **Every claim has a source.** A proposition from a regulation points to the article and paragraph it came from.
4. **Voice is a first-class mode.** Anything a session needs must work without looking at a screen.
5. **Plain English.** All UI text, prompts and documents follow the house style: short sentences, everyday words, no em dashes or en dashes.
6. **The human decides design.** Agents ask before any design, naming, data-shape or scope decision that is not already written down.

## Out of scope

- A hosted or paid service.
- Accounts, logins or multi-tenant storage.
- Pulling or merging upstream LearnHarness changes.
- Mastery scores written into the graph.

## Success measures

- Sagar uses Kvasir at least four days a week for three months.
- Review retention on scheduled items stays at or above 85 percent.
- Every proposition imported from a regulation shows a working citation.
- A full voice session runs start to finish with no screen interaction.
