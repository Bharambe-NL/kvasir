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

/** The two review question formats, chosen by card phase (D038): a cue
 *  that makes the learner recall the proposition, or an applied scenario
 *  where it must come to mind unnamed. */
export type QuestionFormat = "cue" | "scenario";

export const QUESTION_FORMATS: readonly QuestionFormat[] = ["cue", "scenario"];

/** One generated review question, as stored: one line of
 *  data/learner/questions.jsonl (D039). Append-only; failures are never
 *  stored, so the ledger holds only usable questions. */
export interface ReviewQuestion {
	/** "rq_" + nanoid-like. */
	id: string;
	/** The card (D031): a graph node id. */
	nodeId: string;
	/** The card's reps when generated: this question serves the review after
	 *  that many reviews. A new review cycle needs a new question. */
	cycle: number;
	format: QuestionFormat;
	/** What the learner sees: the cue, or the scenario. */
	prompt: string;
	/** What is revealed: the proposition (cue) or a model answer (scenario). */
	answer: string;
	/** ISO timestamp of generation. */
	generatedAt: string;
	/** The model that wrote it, as "provider:id". */
	model: string;
}

/** Strict shape guard for one stored question line. */
export function isReviewQuestion(value: unknown): value is ReviewQuestion {
	if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
	const v = value as Record<string, unknown>;
	const nonEmpty = (x: unknown) => typeof x === "string" && x.trim().length > 0;
	return (
		nonEmpty(v.id) &&
		nonEmpty(v.nodeId) &&
		typeof v.cycle === "number" &&
		Number.isInteger(v.cycle) &&
		v.cycle >= 0 &&
		typeof v.format === "string" &&
		(QUESTION_FORMATS as readonly string[]).includes(v.format) &&
		nonEmpty(v.prompt) &&
		nonEmpty(v.answer) &&
		typeof v.generatedAt === "string" &&
		!Number.isNaN(Date.parse(v.generatedAt)) &&
		nonEmpty(v.model)
	);
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

/** One review opt-out toggle, as stored: one line of
 *  data/learner/exclusions.jsonl (P1-8, D055). Append-only; the latest line
 *  for a session decides whether its cards are in review (core/learner.ts
 *  excludedSessions). Keyed by birth session (D053): a chat id, or a notes
 *  import's "src_" id. */
export interface ReviewExclusion {
	/** "rx_" + nanoid-like. */
	id: string;
	/** The birth session the toggle applies to. */
	sessionId: string;
	/** true: the session's cards leave review. false: they come back. */
	excluded: boolean;
	/** ISO timestamp of the toggle. */
	at: string;
}

/** Strict shape guard for one stored exclusion line. */
export function isReviewExclusion(value: unknown): value is ReviewExclusion {
	if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
	const v = value as Record<string, unknown>;
	const nonEmpty = (x: unknown) => typeof x === "string" && x.trim().length > 0;
	return (
		nonEmpty(v.id) &&
		nonEmpty(v.sessionId) &&
		typeof v.excluded === "boolean" &&
		typeof v.at === "string" &&
		!Number.isNaN(Date.parse(v.at))
	);
}
