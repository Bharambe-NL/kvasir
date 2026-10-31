/**
 * The Memory scheduler (P1-2): FSRS over the review ledger. Pure: no IO and
 * no clock reads. Every timestamp arrives as an argument, so the same ledger
 * always gives the same schedule (fuzz off, D035).
 *
 * Card state is DERIVED, never stored (D030): a card's state is the replay
 * of that node's reviews through FSRS, from an empty card introduced at
 * `introducedAt` (the card source, P1-3, decides when a card is introduced).
 *
 * The library (`ts-fsrs` 5.4.2, D032) is an implementation detail of this
 * module: nothing else imports it, and only the P1-1 contracts cross this
 * boundary.
 */

import {
	createEmptyCard,
	fsrs,
	generatorParameters,
	State,
	type Card,
	type Grade,
} from "ts-fsrs";
import type { CardPhase, CardState, ReviewEntry, ReviewRating } from "./contracts/learner.ts";
import { REVIEW_RATINGS } from "./contracts/learner.ts";
import { uniqueReviews } from "./learner.ts";

/** The scheduler's settings: D033 (retention), D034 (short-term steps),
 *  D035 (no fuzz). Constants for now; a settings control is a later
 *  decision. */
export const SCHEDULER_SETTINGS = Object.freeze({
	requestRetention: 0.9,
	maximumIntervalDays: 36500,
	learningSteps: ["1m", "10m"] as const,
	relearningSteps: ["10m"] as const,
	enableFuzz: false,
	enableShortTerm: true,
});

const scheduler = fsrs(
	generatorParameters({
		request_retention: SCHEDULER_SETTINGS.requestRetention,
		maximum_interval: SCHEDULER_SETTINGS.maximumIntervalDays,
		learning_steps: [...SCHEDULER_SETTINGS.learningSteps],
		relearning_steps: [...SCHEDULER_SETTINGS.relearningSteps],
		enable_fuzz: SCHEDULER_SETTINGS.enableFuzz,
		enable_short_term: SCHEDULER_SETTINGS.enableShortTerm,
	}),
);

const PHASE_OF: Record<State, CardPhase> = {
	[State.New]: "new",
	[State.Learning]: "learning",
	[State.Review]: "review",
	[State.Relearning]: "relearning",
};

/** This node's reviews, retries dropped, in time order (ties keep append
 *  order, because Array.prototype.sort is stable). */
function reviewsFor(nodeId: string, reviews: readonly ReviewEntry[]): ReviewEntry[] {
	return uniqueReviews(reviews)
		.filter((r) => r.nodeId === nodeId)
		.sort((a, b) => Date.parse(a.reviewedAt) - Date.parse(b.reviewedAt));
}

/** The library card after replaying this node's reviews. */
function replay(nodeId: string, reviews: readonly ReviewEntry[], introducedAt: string): Card {
	let card = createEmptyCard(new Date(introducedAt));
	for (const review of reviewsFor(nodeId, reviews)) {
		card = scheduler.next(card, new Date(review.reviewedAt), review.rating as Grade).card;
	}
	return card;
}

function toCardState(nodeId: string, card: Card): CardState {
	return {
		nodeId,
		phase: PHASE_OF[card.state],
		due: card.due.toISOString(),
		stability: card.stability,
		difficulty: card.difficulty,
		reps: card.reps,
		lapses: card.lapses,
		lastReviewedAt: card.last_review ? card.last_review.toISOString() : null,
	};
}

/** A card's schedule: the replay of this node's reviews. With no reviews the
 *  card is "new" and due at `introducedAt`. Reviews of other nodes are
 *  ignored, so the whole ledger can be passed. */
export function scheduleCard(nodeId: string, reviews: readonly ReviewEntry[], introducedAt: string): CardState {
	return toCardState(nodeId, replay(nodeId, reviews, introducedAt));
}

/** The state each rating would lead to if the card were reviewed at `now`,
 *  for the review page to show next intervals. Equal to scheduleCard after
 *  appending that rating at `now`. */
export function previewRatings(
	nodeId: string,
	reviews: readonly ReviewEntry[],
	introducedAt: string,
	now: string,
): Record<ReviewRating, CardState> {
	const card = replay(nodeId, reviews, introducedAt);
	const at = new Date(now);
	const out = {} as Record<ReviewRating, CardState>;
	for (const rating of REVIEW_RATINGS) {
		out[rating] = toCardState(nodeId, scheduler.next(card, at, rating as Grade).card);
	}
	return out;
}

/** Whether a card is due at `now`. */
export function isDue(state: CardState, now: string): boolean {
	return Date.parse(state.due) <= Date.parse(now);
}
