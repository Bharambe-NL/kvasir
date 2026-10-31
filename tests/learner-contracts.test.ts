/** The learner contracts (P1-1): the review-line shape guard and the
 *  reader-side dedup. Pure; no IO. */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isReviewEntry, REVIEW_RATINGS, type ReviewEntry } from "../src/core/contracts/learner.ts";
import { uniqueReviews } from "../src/core/learner.ts";

const valid: ReviewEntry = { id: "rev_a1", nodeId: "n_x1", rating: 3, reviewedAt: "2026-10-31T09:00:00.000Z" };

describe("isReviewEntry", () => {
	it("accepts a well-formed review for every rating", () => {
		for (const rating of REVIEW_RATINGS) assert.equal(isReviewEntry({ ...valid, rating }), true);
	});

	it("rejects anything that is not exactly the stored shape", () => {
		const bad: unknown[] = [
			null,
			[],
			"rev_a1",
			{ ...valid, id: "" },
			{ ...valid, nodeId: "" },
			{ ...valid, nodeId: 7 },
			{ ...valid, rating: 0 },
			{ ...valid, rating: 5 },
			{ ...valid, rating: 2.5 },
			{ ...valid, rating: "3" },
			{ ...valid, reviewedAt: "not a date" },
			{ id: "rev_a1", nodeId: "n_x1", rating: 3 },
		];
		for (const value of bad) assert.equal(isReviewEntry(value), false, JSON.stringify(value));
	});
});

describe("uniqueReviews", () => {
	it("keeps the first line for each id and the append order", () => {
		const a = valid;
		const b: ReviewEntry = { ...valid, id: "rev_b2", nodeId: "n_y2", rating: 1 };
		const retry: ReviewEntry = { ...valid, rating: 4 };
		assert.deepEqual(uniqueReviews([a, b, retry]), [a, b]);
	});

	it("returns an empty list for an empty ledger", () => {
		assert.deepEqual(uniqueReviews([]), []);
	});
});
