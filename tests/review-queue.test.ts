/**
 * The review queue and measured retention (P1-5), pure with fixed clocks:
 * the D041 daily limits (20 new, 200 total), reviews done today counting
 * against both, in-progress cards before new ones, the day boundary, and the
 * retention measure for P1 gate check 4.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { deriveCards } from "../src/core/cards.ts";
import type { GraphNode } from "../src/core/contracts/graph.ts";
import type { ReviewEntry, ReviewRating } from "../src/core/contracts/learner.ts";
import { buildQueue, measuredRetention, REVIEW_LIMITS } from "../src/core/review-queue.ts";

const DAY_START = "2026-11-01T00:00:00.000Z";
const NOW = "2026-11-01T09:00:00.000Z";
const minutes = (base: string, m: number) => new Date(Date.parse(base) + m * 60_000).toISOString();
const days = (base: string, d: number) => new Date(Date.parse(base) + d * 86_400_000).toISOString();

const node = (i: number, createdAt = "2026-10-01T09:00:00.000Z"): GraphNode => ({
	id: `n_${String(i).padStart(3, "0")}`,
	name: `Node ${i}`,
	statement: `Statement ${i}.`,
	aliases: [],
	createdAt,
	provenance: [],
});
const graphOf = (nodes: GraphNode[]) => ({ readNodes: () => nodes, readChains: () => [] });
let rid = 0;
const review = (nodeId: string, rating: ReviewRating, reviewedAt: string): ReviewEntry => ({ id: `rev_${++rid}`, nodeId, rating, reviewedAt });

describe("buildQueue (D041)", () => {
	it("pins the limits at 20 new and 200 total per day", () => {
		assert.deepEqual({ ...REVIEW_LIMITS }, { newPerDay: 20, totalPerDay: 200 });
	});

	it("admits at most 20 new cards from a large backlog, in introduction order", () => {
		const nodes = Array.from({ length: 278 }, (_, i) => node(i, minutes("2026-10-01T09:00:00.000Z", i)));
		const { cards } = deriveCards(graphOf(nodes), []);
		const { queue, stats } = buildQueue(cards, [], NOW, DAY_START);
		assert.equal(queue.length, 20);
		assert.deepEqual(queue.map((c) => c.nodeId), nodes.slice(0, 20).map((n) => n.id));
		assert.equal(stats.newLeft, 20);
		assert.equal(stats.totalLeft, 200);
		assert.equal(stats.nextDueAt, "2026-11-02T00:00:00.000Z", "the 21st card is held back by the new limit: tomorrow, not the past");
	});

	it("counts cards first seen today against the new allowance", () => {
		const nodes = Array.from({ length: 30 }, (_, i) => node(i));
		const reviews = nodes.slice(0, 5).map((n) => review(n.id, 3, minutes(DAY_START, 60)));
		const { cards } = deriveCards(graphOf(nodes), reviews);
		const { queue, stats } = buildQueue(cards, reviews, NOW, DAY_START);
		assert.equal(stats.newToday, 5);
		assert.equal(stats.newLeft, 15);
		assert.equal(queue.filter((c) => c.state.phase === "new").length, 15);
	});

	it("puts cards already in progress before new ones", () => {
		const nodes = [node(1), node(2), node(3)];
		// n_001 was learned yesterday and is due again (a 10-minute step long past).
		const reviews = [review("n_001", 3, days(DAY_START, -1))];
		const { cards } = deriveCards(graphOf(nodes), reviews);
		const { queue } = buildQueue(cards, reviews, NOW, DAY_START);
		assert.equal(queue[0]!.nodeId, "n_001");
		assert.equal(queue[0]!.state.phase, "learning");
		assert.deepEqual(queue.slice(1).map((c) => c.state.phase), ["new", "new"]);
	});

	it("stops at the total limit, counting reviews done today", () => {
		const nodes = Array.from({ length: 3 }, (_, i) => node(i));
		const reviews = Array.from({ length: 199 }, (_, i) => review("n_000", 3, minutes(DAY_START, i)));
		const { cards } = deriveCards(graphOf(nodes), reviews);
		const { queue, stats } = buildQueue(cards, reviews, NOW, DAY_START);
		assert.equal(stats.reviewedToday, 199);
		assert.equal(stats.totalLeft, 1);
		assert.equal(queue.length, 1);
	});

	it("does not count yesterday's reviews against today", () => {
		const nodes = Array.from({ length: 25 }, (_, i) => node(i));
		const reviews = nodes.slice(0, 20).map((n) => review(n.id, 4, minutes(DAY_START, -30)));
		const { cards } = deriveCards(graphOf(nodes), reviews);
		const { stats } = buildQueue(cards, reviews, NOW, DAY_START);
		assert.equal(stats.reviewedToday, 0);
		assert.equal(stats.newToday, 0);
		assert.equal(stats.newLeft, 20);
	});

	it("a card due later today reports its own due time, not tomorrow", () => {
		const nodes = Array.from({ length: 21 }, (_, i) => node(i)).concat([node(99, minutes(NOW, 30))]);
		const { cards } = deriveCards(graphOf(nodes), []);
		// 20 new cards fill the queue; n_099 is introduced in 30 minutes but is also new, so it
		// waits for tomorrow's allowance. n_020 is held back now. Both report tomorrow.
		assert.equal(buildQueue(cards, [], NOW, DAY_START).stats.nextDueAt, "2026-11-02T00:00:00.000Z");
		const learning = [review("n_000", 3, minutes(NOW, -1))]; // due again at +9 min
		const few = deriveCards(graphOf([node(0)]), learning).cards;
		assert.equal(buildQueue(few, learning, NOW, DAY_START).stats.nextDueAt, minutes(NOW, 9));
	});

	it("is empty when nothing is due, and says when the next card is", () => {
		const nodes = [node(1, days(NOW, 2))];
		const { cards } = deriveCards(graphOf(nodes), []);
		const { queue, stats } = buildQueue(cards, [], NOW, DAY_START);
		assert.equal(queue.length, 0);
		assert.equal(stats.nextDueAt, days(NOW, 2));
	});
});

describe("measuredRetention (P1 gate check 4)", () => {
	it("is null with no scheduled reviews", () => {
		const { cards } = deriveCards(graphOf([node(1)]), []);
		assert.equal(measuredRetention(cards, [], NOW), null);
	});

	it("counts only reviews made while the card was in the review phase, and Again as forgotten", () => {
		const intro = "2026-10-20T09:00:00.000Z";
		// Learning steps (Good, then Good 10 min later) graduate the card; those two do not count.
		const learn = [review("n_001", 3, intro), review("n_001", 3, minutes(intro, 10))];
		// Then two scheduled reviews: one Good (recalled), one Again (forgotten).
		const scheduled = [review("n_001", 3, days(intro, 3)), review("n_001", 1, days(intro, 8))];
		const ledger = [...learn, ...scheduled];
		const { cards } = deriveCards(graphOf([node(1, intro)]), ledger);
		assert.deepEqual(measuredRetention(cards, ledger, NOW), { recalled: 1, total: 2 });
	});

	it("leaves out reviews older than the window and reviews of deleted nodes", () => {
		const intro = "2026-08-01T09:00:00.000Z";
		const ledger = [
			review("n_001", 3, intro),
			review("n_001", 3, minutes(intro, 10)),
			review("n_001", 3, days(intro, 3)), // scheduled, but in August: outside 30 days
			review("n_gone", 3, days(NOW, -1)),
		];
		const { cards } = deriveCards(graphOf([node(1, intro)]), ledger);
		assert.equal(measuredRetention(cards, ledger, NOW), null);
	});
});
