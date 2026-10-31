/**
 * The review queue and measured retention (P1-5). Pure: no IO, no clock
 * reads. The server passes `now` and `dayStart` (local midnight), so the
 * same ledger always gives the same queue.
 *
 * Daily limits (D041): at most 20 cards seen for the first time and at most
 * 200 reviews in all per local day. Reviews already done today count against
 * both. Cards already in progress come first, earliest due; new cards follow
 * in introduction order.
 */

import type { ReviewEntry } from "./contracts/learner.ts";
import { dueCards, type ReviewCard } from "./cards.ts";
import { uniqueReviews } from "./learner.ts";
import { scheduleCard } from "./schedule.ts";

export const REVIEW_LIMITS = Object.freeze({ newPerDay: 20, totalPerDay: 200 });

export interface QueueStats {
	/** Reviews recorded since dayStart. */
	reviewedToday: number;
	/** Cards whose first review was since dayStart. */
	newToday: number;
	/** New cards still allowed today. */
	newLeft: number;
	/** Reviews still allowed today. */
	totalLeft: number;
	/** ISO: when the next card not in the queue becomes reviewable. A card
	 *  already due but held back by today's limits counts from the start of
	 *  the next day. null when no card is waiting. */
	nextDueAt: string | null;
}

export interface ReviewQueue {
	queue: ReviewCard[];
	stats: QueueStats;
}

const at = (iso: string) => Date.parse(iso);

/** The cards to review now, within today's limits. */
export function buildQueue(
	cards: readonly ReviewCard[],
	reviews: readonly ReviewEntry[],
	now: string,
	dayStart: string,
): ReviewQueue {
	const ledger = uniqueReviews(reviews);
	const today = ledger.filter((r) => at(r.reviewedAt) >= at(dayStart) && at(r.reviewedAt) <= at(now));
	const firstReview = new Map<string, number>();
	for (const r of ledger) {
		const t = at(r.reviewedAt);
		const seen = firstReview.get(r.nodeId);
		if (seen === undefined || t < seen) firstReview.set(r.nodeId, t);
	}
	const newToday = [...firstReview.values()].filter((t) => t >= at(dayStart) && t <= at(now)).length;
	const newLeft = Math.max(0, REVIEW_LIMITS.newPerDay - newToday);
	const totalLeft = Math.max(0, REVIEW_LIMITS.totalPerDay - today.length);

	const due = dueCards(cards, now);
	const inProgress = due.filter((c) => c.state.phase !== "new");
	const fresh = due.filter((c) => c.state.phase === "new").slice(0, newLeft);
	const queue = [...inProgress, ...fresh].slice(0, totalLeft);

	const queued = new Set(queue.map((c) => c.nodeId));
	const tomorrow = new Date(at(dayStart) + 24 * 60 * 60 * 1000).toISOString();
	// What is still allowed today once this queue is reviewed.
	const totalSpent = totalLeft - queue.length <= 0;
	const newSpent = newLeft - queue.filter((c) => c.state.phase === "new").length <= 0;
	let nextDueAt: string | null = null;
	for (const c of cards) {
		if (queued.has(c.nodeId)) continue;
		// A card held back by today's limits (due now, or later today with its
		// allowance spent) is reviewable from the start of tomorrow.
		const heldBack =
			at(c.state.due) <= at(now) || totalSpent || (c.state.phase === "new" && newSpent);
		const when = heldBack && at(c.state.due) < at(tomorrow) ? tomorrow : c.state.due;
		if (nextDueAt === null || at(when) < at(nextDueAt)) nextDueAt = when;
	}

	return { queue, stats: { reviewedToday: today.length, newToday, newLeft, totalLeft, nextDueAt } };
}

export interface Retention {
	/** Scheduled reviews not rated Again. */
	recalled: number;
	/** Scheduled reviews in the window. */
	total: number;
}

/** Measured retention (P1 gate check 4): over the last `days`, the share of
 *  SCHEDULED reviews (the card was in the review phase when reviewed, not in
 *  a learning step) that were not rated Again. null when there are none.
 *  Reviews of nodes that no longer exist are left out. */
export function measuredRetention(
	cards: readonly ReviewCard[],
	reviews: readonly ReviewEntry[],
	now: string,
	days = 30,
): Retention | null {
	const from = at(now) - days * 24 * 60 * 60 * 1000;
	const introducedAt = new Map(cards.map((c) => [c.nodeId, c.introducedAt]));
	const byNode = new Map<string, ReviewEntry[]>();
	for (const r of uniqueReviews(reviews)) {
		if (!introducedAt.has(r.nodeId)) continue;
		const list = byNode.get(r.nodeId);
		if (list) list.push(r);
		else byNode.set(r.nodeId, [r]);
	}
	let recalled = 0;
	let total = 0;
	for (const [nodeId, list] of byNode) {
		const ordered = [...list].sort((a, b) => at(a.reviewedAt) - at(b.reviewedAt));
		const intro = introducedAt.get(nodeId)!;
		ordered.forEach((r, i) => {
			const t = at(r.reviewedAt);
			if (t < from || t > at(now)) return;
			if (scheduleCard(nodeId, ordered.slice(0, i), intro).phase !== "review") return;
			total++;
			if (r.rating > 1) recalled++;
		});
	}
	return total === 0 ? null : { recalled, total };
}
