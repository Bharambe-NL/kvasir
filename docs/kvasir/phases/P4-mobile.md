# P4: Mobile companion

## Goal

Sagar can clear reviews and run voice sessions from his phone. The phone and the desktop stay in sync with no cloud service in between.

## Read first

- `docs/kvasir/phases/P1-retention.md` and `P3-voice.md` (the phone runs these two)
- `docs/architecture.md` section 8 (process boundaries) and section 10 (events channel)

## Open decisions

This phase has the largest design choice. Ask it first, with a short comparison.

1. Architecture:
   - **A. Remote client.** The phone is a PWA that talks to the desktop server over a private network (for example Tailscale). Simple, but the desktop must be awake.
   - **B. Local-first sync.** The phone app holds its own copy of the review data and syncs ledgers with the desktop when both are reachable. Works offline, more work.
   - **C. Hybrid.** Reviews and voice work offline on the phone (B); teaching sessions and extraction stay on the desktop (A).
   Default proposal: C. Append-only ledgers make B and C safer, since merging is a union plus a deterministic re-derive.
2. Phone app technology: PWA, React Native, or native SwiftUI (Sagar has an iOS skill and Xcode setup). Default proposal: decide after decision 1.
3. Which LLM calls the phone makes directly, with which key. Keys must never be sent in sync payloads.
4. Pairing method: QR code with a one-time secret. Confirm.

## Design outline (for option C)

- Sync unit: ledger lines with stable ids. A sync is a set union per ledger, then each side re-derives. No line is ever edited.
- The review ledger and voice-session records sync both ways. The graph syncs desktop to phone only (the desktop merger stays the sole graph writer).
- Transport: an authenticated endpoint on the desktop, reachable over the private network. Mutual pairing secret.
- Conflicts are not possible for append-only ledgers. Settings sync last-writer-wins per key, with a log.

## Tasks

Write the task table after decision 1. Expect: pairing, sync protocol and tests, phone review UI, phone voice session, offline queue, background sync, release pipeline for the phone app.

## Gate acceptance checks

1. Reviews done offline on the phone appear on the desktop after reconnect, with no duplicates.
2. A voice session started on the phone in the car syncs its transcript and review results to the desktop.
3. No API key ever appears in a sync payload (test enforced).

## Gate results

(record here)
