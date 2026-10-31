/**
 * Learner contracts: the Memory system (P1, D030). Learner state lives in its
 * own store under data/learner/ and never in the graph: the graph stays
 * objective (architecture section 6), Memory reads it and never writes it.
 *
 * One review card is one proposition, keyed by its graph node id (D031). The
 * review ledger is the only learner evidence. Card state (schedule, due date)
 * is DERIVED from it at read time and never stored, so nothing is
 * dual-tracked. A node that no longer exists makes its card inert at read
 * time; the ledger is never rewritten.
 */

/** Self-rating after a review, on the FSRS grade scale. */
export type ReviewRating = 1 | 2 | 3 | 4;

/** The four ratings, in order: Again, Hard, Good, Easy. */
export const REVIEW_RATINGS: readonly ReviewRating[] = [1, 2, 3, 4];

/** One review, as stored: one line of data/learner/reviews.jsonl. */
export interface ReviewEntry {
	/** "rev_" + nanoid-like, made by the caller. A retried append with the
	 *  same id is dropped by readers (core/learner.ts uniqueReviews). */
	id: string;
	/** The card key (D031): the reviewed proposition's graph node id. */
	nodeId: string;
	rating: ReviewRating;
	/** ISO timestamp of the review. */
	reviewedAt: string;
}

/** Where a card stands in the FSRS cycle. */
export type CardPhase = "new" | "learning" | "review" | "relearning";

/** A card's schedule, DERIVED from the review ledger at read time (the
 *  scheduler computes it). Never stored. */
export interface CardState {
	nodeId: string;
	phase: CardPhase;
	/** ISO timestamp: when the card is next due. */
	due: string;
	/** FSRS memory stability, in days. */
	stability: number;
	/** FSRS difficulty, from 1 to 10. */
	difficulty: number;
	reps: number;
	lapses: number;
	/** ISO timestamp of the latest review; null for a new card. */
	lastReviewedAt: string | null;
}

/** Strict shape guard for one stored review line. Readers drop anything
 *  that fails it rather than guess. */
export function isReviewEntry(value: unknown): value is ReviewEntry {
	if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
	const v = value as Record<string, unknown>;
	return (
		typeof v.id === "string" &&
		v.id.length > 0 &&
		typeof v.nodeId === "string" &&
		v.nodeId.length > 0 &&
		typeof v.rating === "number" &&
		(REVIEW_RATINGS as readonly number[]).includes(v.rating) &&
		typeof v.reviewedAt === "string" &&
		!Number.isNaN(Date.parse(v.reviewedAt))
	);
}
