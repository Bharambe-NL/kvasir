# Eval fixture data

`data/` is the data folder every teaching-eval run starts from (Kvasir P6-4). Each run works on a temp copy, so this folder never changes.

- It is the golden test data (`tests/fixtures/golden-data/`)
- plus the DORA import from the P2 gate run (2026-11-01), version 2022-12-14 only:
  - 138 propositions
  - their chains and citations
  - the version line
  - the version's stored units (`graph/document-units/`)

No personal sessions, review history or keys are included. The DORA text comes from the Official Journal (see `tests/fixtures/sources/README.md` for its source and reuse terms).
