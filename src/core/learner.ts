/**
 * Pure reader-side helpers over the review ledger (the Memory system, P1).
 * The store never decides: it returns raw lines in append order, and the
 * semantics live here. No IO.
 */

import type { CardState, QuestionFormat, ReviewEntry, ReviewExclusion, ReviewQuestion } from "./contracts/learner.ts";

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

/** The stored question for a card's current review cycle: the latest one
 *  generated for (nodeId, cycle), or null when none exists yet. */
export function questionFor(nodeId: string, cycle: number, questions: readonly ReviewQuestion[]): ReviewQuestion | null {
	let found: ReviewQuestion | null = null;
	for (const q of questions) {
		if (q.nodeId !== nodeId || q.cycle !== cycle) continue;
		if (!found || Date.parse(q.generatedAt) >= Date.parse(found.generatedAt)) found = q;
	}
	return found;
}

/** The question format for a card (D038): a cue while the memory is still
 *  forming, an applied scenario once the card is in the review phase. */
export function formatFor(state: Pick<CardState, "phase">): QuestionFormat {
	return state.phase === "review" ? "scenario" : "cue";
}

/** The birth sessions currently out of review (D055): the latest toggle per
 *  session decides, by `at`, ties going to the later line in append order.
 *  A retried append (same id) counts once. */
export function excludedSessions(entries: readonly ReviewExclusion[]): Set<string> {
	const seen = new Set<string>();
	const latest = new Map<string, ReviewExclusion>();
	for (const entry of entries) {
		if (seen.has(entry.id)) continue;
		seen.add(entry.id);
		const prev = latest.get(entry.sessionId);
		if (!prev || Date.parse(entry.at) >= Date.parse(prev.at)) latest.set(entry.sessionId, entry);
	}
	const out = new Set<string>();
	for (const [sessionId, entry] of latest) if (entry.excluded) out.add(sessionId);
	return out;
}
