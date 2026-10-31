/**
 * Pure reader-side helpers over the review ledger (the Memory system, P1).
 * The store never decides: it returns raw lines in append order, and the
 * semantics live here. No IO.
 */

import type { ReviewEntry } from "./contracts/learner.ts";

/** The ledger with retried appends removed: the first line for each id
 *  wins, append order is kept. */
export function uniqueReviews(entries: readonly ReviewEntry[]): ReviewEntry[] {
	const seen = new Set<string>();
	const out: ReviewEntry[] = [];
	for (const entry of entries) {
		if (seen.has(entry.id)) continue;
		seen.add(entry.id);
		out.push(entry);
	}
	return out;
}
