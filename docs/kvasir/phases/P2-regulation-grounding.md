# P2: Regulation grounding

## Goal

Sagar can import a regulation, guideline or paper as a PDF or official HTML, learn from it, and every proposition taken from it points to the exact article, paragraph and version it came from. When a newer version arrives, Kvasir shows which propositions changed.

## Read first

- `docs/architecture.md` section 6 (the notes front door and the extraction pipeline)
- `src/agent/subagents/` (the existing pdf-reader)
- `app/api/graph/import/`

## Open decisions

1. Supported source formats in this phase. Default proposal: EUR-Lex HTML, PDF with a text layer, and Markdown.
2. Citation unit. Default proposal: a structured anchor `{ sourceId, version, path: ["Article 28", "paragraph 2", "point (a)"], quote }`.
3. How versions are identified: CELEX number plus consolidation date for EUR-Lex; file hash plus a user-given label for others. Confirm.
4. What happens to a proposition whose source text was removed in a newer version: mark as outdated, or hide. Default proposal: mark as outdated and keep it visible.
5. Whether Kvasir should later read from Eryndal or Hugin instead of fetching sources itself. Default proposal: not in this phase; leave a seam.

## Design outline

- A third front door to the existing extraction pipeline: **sources**. Each document becomes a `SourceDocument` with a deterministic id and a version list.
- A structure parser splits a document into addressable units (title, chapter, article, paragraph, point) before chunking. Chunks never cut across a paragraph.
- The extractor prompt gains a citation requirement for this door only. The submit validator rejects a proposition whose quote is not found verbatim in its unit.
- Citations are stored in a new append-only ledger `data/graph/citations.jsonl`, written only by the merger.
- A version diff job compares unit text across versions and marks affected propositions. The flag is derived at read time from the citations ledger and the version list.

## Tasks

| ID | Branch | Scope | Done when |
|---|---|---|---|
| P2-1 | `p2/source-contracts` | `SourceDocument`, version and citation contracts; ledger adapter | Contracts approved by Sagar |
| P2-2 | `p2/structure-parser` | Parsers for EUR-Lex HTML, PDF and Markdown into addressable units | Fixtures: DORA, PSD2 and one EBA guideline parse with correct article numbering |
| P2-3 | `p2/citation-extraction` | Extractor prompt section and verbatim-quote validator for the sources door | Faux-engine tests: bad quotes are sent back and fixed within turn limits |
| P2-4 | `p2/citation-ui` | Citation chip on propositions; side panel shows the source unit with the quote highlighted | Render tests; works from the canvas, chain table and transcript |
| P2-5 | `p2/version-diff` | Import a new version; unit-level diff; outdated flags | Fixture with two versions flags exactly the changed propositions |
| P2-6 | `p2/teacher-citations` | Teacher cites the source unit when teaching from a source | Live session on a DORA article shows citations in the lesson |

## Gate acceptance checks

1. Import DORA (Regulation (EU) 2022/2554) from EUR-Lex. Every extracted proposition has a citation that opens the correct paragraph.
2. Import two versions of one document. The diff flags only propositions tied to changed units.
3. No proposition from the sources door is stored without a citation.

## Gate results

Recorded 2026-11-01. The live checks ran with Sagar's configured models (strong `claude-opus-5-5`, cheap `claude-sonnet-5-5`) on a temp copy of his data folder, with the production build of the P2-6 branch (`6686b58`; its code is what merged as `d126635`). His real data was not touched, and his key file was read in place by the app, never opened or copied.

| # | Check | Result | Evidence |
|---|---|---|---|
| 1 | Import DORA (Regulation (EU) 2022/2554) from EUR-Lex. Every extracted proposition has a citation that opens the correct paragraph. | Pass | DORA's Official Journal XHTML (the EUR-Lex text, fetched through the Publications Office's Cellar service because EUR-Lex refuses scripts, D067) was imported through `POST /api/sources/import` in 6 min 24 s: 23 chunks, 138 propositions, 117 chains, 258 citations (174 in articles, 84 in recitals). A script over the ledgers resolved **all 258** citations to a stored paragraph of their version that contains the exact stored quote. In the app, a citation chip opened the panel on "Chapter V > Section I > Article 28 > paragraph 1 > point (a)" with the regulation's text (PR #44 comment). |
| 2 | Import two versions of one document. The diff flags only propositions tied to changed units. | Pass | Version 2 was simulated from the same file by four edits: the act date (2024-01-17), a reworded quote in Art. 28(2), an unquoted change in Art. 28(3), and Art. 28(8)(c) deleted. Importing it took 13 s: the diff reported 0 added, 2 changed, 1 removed, 873 unchanged, and only the changed units went to the model. `outdated` then listed **exactly** "Third-party risk strategy policy" (Art. 28(2), changed in 2024-01-17) and "Exit strategy requirements" (Art. 28(8)(c), removed in 2024-01-17). The Art. 28(3) proposition stayed current. `tests/source-diff.test.ts` pins the same behaviour deterministically. |
| 3 | No proposition from the sources door is stored without a citation. | Pass | All 138 propositions born in the DORA document carry at least one citation (live ledgers). The schema requires citations, the submit step checks them (the model resubmitted 4 times and fixed each), and the merger refuses an uncited proposition before writing anything (`tests/source-extraction.test.ts`). |

**Gates on a fresh clone of `main` at `d126635`:** typecheck, lint, build and house style pass. `npm test`: 3164 of 3165 pass. The one failure is the firewall-only "binds 127.0.0.1", which passes in CI.

**Findings for later, not blocking:**
- **The outdated flag:** a proposition is marked outdated when any of its citations is. In check 2 the extractor re-read the changed Art. 28(2), and the auditor linked it to the same proposition, so "Third-party risk strategy policy" now has a current 2024-01-17 citation as well as the outdated 2022-12-14 one, and still shows "Outdated". It may be clearer to treat a proposition as current when it has a citation of the newest version.
- **A streaming glimpse:** a lesson citation showed " [blocked]" once while a reply was streaming (`rehype-harden`), then rendered as the chip. It was not reproduced.
