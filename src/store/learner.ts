/**
 * LearnerStore — the fs JSONL adapter for the Memory system (D030).
 *   reviews.jsonl     ReviewEntry    — one line per review, append-only
 *   questions.jsonl   ReviewQuestion — one line per generated question (D039)
 *
 * Implements core/ports.ts LearnerStore. data/learner/* is exclusively this
 * adapter's, and this adapter touches nothing else: never data/graph/ (the
 * graph stays objective; an ESLint zone keeps the graph adapter out of
 * reach). Same idioms as src/store/graph.ts: sync fs, corrupt lines skipped,
 * strict shape guards on read, and the store never decides (dedup by id is
 * core/learner.ts uniqueReviews).
 */

import {
	isReviewEntry,
	isReviewExclusion,
	isReviewQuestion,
	type ReviewEntry,
	type ReviewExclusion,
	type ReviewQuestion,
} from "../core/contracts/learner.ts";
import type { LearnerStore } from "../core/ports.ts";
import type { StoreBackend } from "./backend.ts";
import { fileBackend } from "./file-backend.ts";
import { encryptionLayer } from "./encrypted-backend.ts";

/** Kvasir P6-1: the logic runs over a StoreBackend (backend.ts), so the same
 *  store works on data/learner/ (the `learnerStore` export) and on SQLite. */
export function createLearnerStore(backend: StoreBackend): LearnerStore {
	return {
		appendReview(entry: ReviewEntry): void {
			backend.appendLine("reviews", entry);
		},
		readReviews(): ReviewEntry[] {
			return backend.readLines("reviews").filter(isReviewEntry);
		},
		appendQuestion(question: ReviewQuestion): void {
			backend.appendLine("questions", question);
		},
		readQuestions(): ReviewQuestion[] {
			return backend.readLines("questions").filter(isReviewQuestion);
		},
		appendExclusion(entry: ReviewExclusion): void {
			backend.appendLine("exclusions", entry);
		},
		readExclusions(): ReviewExclusion[] {
			return backend.readLines("exclusions").filter(isReviewExclusion);
		},
	};
}

/** The file-backed store (data/learner/), as wired before P6-1. */
export const learnerStore: LearnerStore = createLearnerStore(encryptionLayer(fileBackend));
