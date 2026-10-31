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

describe("ReviewQuestion (P1-4, D038, D039)", async () => {
	const { isReviewQuestion, QUESTION_FORMATS } = await import("../src/core/contracts/learner.ts");
	const { questionFor, formatFor } = await import("../src/core/learner.ts");
	type ReviewQuestion = import("../src/core/contracts/learner.ts").ReviewQuestion;
	const q: ReviewQuestion = {
		id: "rq_1",
		nodeId: "n_x1",
		cycle: 0,
		format: "cue",
		prompt: "Why must SCA elements come from different categories?",
		answer: "Each category is stolen a different way.",
		generatedAt: "2026-10-31T09:00:00.000Z",
		model: "faux:test",
	};

	it("isReviewQuestion accepts both formats and rejects malformed lines", () => {
		for (const format of QUESTION_FORMATS) assert.equal(isReviewQuestion({ ...q, format }), true);
		const bad: unknown[] = [
			null,
			{ ...q, id: "" },
			{ ...q, nodeId: " " },
			{ ...q, cycle: -1 },
			{ ...q, cycle: 1.5 },
			{ ...q, format: "quiz" },
			{ ...q, prompt: "" },
			{ ...q, answer: "  " },
			{ ...q, generatedAt: "soon" },
			{ ...q, model: "" },
		];
		for (const value of bad) assert.equal(isReviewQuestion(value), false, JSON.stringify(value));
	});

	it("questionFor returns the latest question for the card's cycle, or null", () => {
		const older = { ...q, id: "rq_old", generatedAt: "2026-10-31T08:00:00.000Z" };
		const otherCycle = { ...q, id: "rq_c1", cycle: 1 };
		const otherNode = { ...q, id: "rq_n2", nodeId: "n_y2" };
		assert.equal(questionFor("n_x1", 0, [older, q, otherCycle, otherNode])?.id, "rq_1");
		assert.equal(questionFor("n_x1", 1, [older, q, otherCycle])?.id, "rq_c1");
		assert.equal(questionFor("n_x1", 2, [q]), null);
	});

	it("formatFor: cue while learning, scenario in the review phase (D038)", () => {
		assert.equal(formatFor({ phase: "new" }), "cue");
		assert.equal(formatFor({ phase: "learning" }), "cue");
		assert.equal(formatFor({ phase: "relearning" }), "cue");
		assert.equal(formatFor({ phase: "review" }), "scenario");
	});
});
