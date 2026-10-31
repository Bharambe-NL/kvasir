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

(record here)
