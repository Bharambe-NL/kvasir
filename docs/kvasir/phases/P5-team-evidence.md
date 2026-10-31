# P5: Team sharing and training evidence

## Goal

Sagar can share a curated part of his graph with colleagues, and anyone using Kvasir can export a record of what they studied and practised, in a form fit for a training file.

## Context

DORA (Article 13(6)) requires ICT security awareness programmes and digital operational resilience training for staff, and training for the management body. NIS2 (Article 20(2)) requires management body members to follow training. A dated record of topics studied, sources used and practice results supports that evidence. Kvasir provides the record; it does not decide whether a training obligation is met.

## Read first

- `docs/kvasir/phases/P1-retention.md` and `P2-regulation-grounding.md`
- `src/core/practice.ts`

## Open decisions

1. Sharing format. Default proposal: a signed, versioned **graph bundle** file (propositions, chains, citations, source metadata; no learner data, no transcripts) that another Kvasir user imports through a fourth front door.
2. How imported bundles merge: through the auditor like any other source, so identity merging works. Confirm.
3. Evidence report contents and format. Default proposal: PDF and CSV with person, period, sources studied (with versions), sessions held, practice sets taken with scores, review retention. Ask Sagar to mark which fields are required and which are optional.
4. Whether the report needs a tamper check (for example a hash chain over the review ledger). Default proposal: yes, a hash printed on the report.

## Tasks

| ID | Branch | Scope | Done when |
|---|---|---|---|
| P5-1 | `p5/bundle-format` | Bundle contract, export from a cluster or chain-table selection, signing | Round trip test: export then import gives the same propositions |
| P5-2 | `p5/bundle-import` | Import front door through the auditor | Importing a bundle twice is a no-op |
| P5-3 | `p5/evidence-model` | Pure derivation of an evidence record from session, practice and review ledgers | Golden fixture produces the expected record |
| P5-4 | `p5/evidence-export` | PDF and CSV export with ledger hash | Sagar approves the layout |
| P5-5 | `p5/curriculum` | A named curriculum: an ordered list of sources and clusters a colleague can work through | One DORA awareness curriculum ships as an example |

## Gate acceptance checks

1. A colleague installs Kvasir, imports a bundle, and studies from it with citations intact.
2. The evidence export for a sample month matches the ledgers line by line.
3. No transcript or learner data leaves the machine in a bundle (test enforced).

## Gate results

(record here)
