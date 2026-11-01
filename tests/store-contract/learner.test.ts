/** LearnerStore contract (Kvasir P6-1, D111), run against both adapters. */
import { ADAPTERS } from "./harness.ts";
import assert from "node:assert/strict";
import { describe, it } from "node:test";

const review = (id: string, nodeId: string, rating: 1 | 2 | 3 | 4 = 3) => ({ id, nodeId, rating, reviewedAt: "2026-11-01T09:00:00.000Z" });
const question = { id: "rq_1", nodeId: "n_a", cycle: 0, format: "cue", prompt: "What is A?", answer: "A is B.", generatedAt: "2026-11-01T09:00:00.000Z", model: "faux" } as const;

for (const adapter of ADAPTERS) {
	describe(`LearnerStore on ${adapter.name}`, () => {
		it("reads empty ledgers as empty", () => {
			const { learner } = adapter.fresh();
			assert.deepEqual([learner.readReviews(), learner.readQuestions(), learner.readExclusions()], [[], [], []]);
		});
		it("reads reviews back in append order, repeats kept, wrong shapes skipped", () => {
			const { learner, backend } = adapter.fresh();
			learner.appendReview(review("rv_1", "n_b"));
			backend.appendLine("reviews", { id: "rv_bad", nodeId: "n_a", rating: 9, reviewedAt: "x" });
			learner.appendReview(review("rv_2", "n_a", 4));
			learner.appendReview(review("rv_1", "n_b"));
			assert.deepEqual(learner.readReviews(), [review("rv_1", "n_b"), review("rv_2", "n_a", 4), review("rv_1", "n_b")]);
		});
		it("reads questions and exclusions back", () => {
			const { learner } = adapter.fresh();
			learner.appendQuestion(question);
			const x1 = { id: "rx_1", sessionId: "chat_a", excluded: true, at: "2026-11-01T09:00:00.000Z" };
			const x2 = { id: "rx_2", sessionId: "chat_a", excluded: false, at: "2026-11-01T10:00:00.000Z" };
			learner.appendExclusion(x1);
			learner.appendExclusion(x2);
			assert.deepEqual(learner.readQuestions(), [question]);
			assert.deepEqual(learner.readExclusions(), [x1, x2]);
		});
	});
}
