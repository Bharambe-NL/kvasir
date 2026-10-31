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

import * as fs from "node:fs";
import * as path from "node:path";
import { LEARNER_FILES } from "../../config.ts";
import {
	isReviewEntry,
	isReviewExclusion,
	isReviewQuestion,
	type ReviewEntry,
	type ReviewExclusion,
	type ReviewQuestion,
} from "../core/contracts/learner.ts";
import type { LearnerStore } from "../core/ports.ts";

function appendLine(file: string, record: unknown): void {
	fs.mkdirSync(path.dirname(file), { recursive: true });
	fs.appendFileSync(file, `${JSON.stringify(record)}\n`, "utf-8");
}

function readRawLines(file: string): unknown[] {
	let raw: string;
	try {
		raw = fs.readFileSync(file, "utf-8");
	} catch {
		return []; // no ledger yet: nothing has been reviewed
	}
	const out: unknown[] = [];
	for (const line of raw.split("\n")) {
		const trimmed = line.trim();
		if (trimmed.length === 0) continue;
		try {
			out.push(JSON.parse(trimmed));
		} catch {
			// Corrupt line: skip it, so a torn append never hides the rest.
		}
	}
	return out;
}

export const learnerStore: LearnerStore = {
	appendReview(entry: ReviewEntry): void {
		appendLine(LEARNER_FILES.reviews, entry);
	},
	readReviews(): ReviewEntry[] {
		return readRawLines(LEARNER_FILES.reviews).filter(isReviewEntry);
	},
	appendQuestion(question: ReviewQuestion): void {
		appendLine(LEARNER_FILES.questions, question);
	},
	readQuestions(): ReviewQuestion[] {
		return readRawLines(LEARNER_FILES.questions).filter(isReviewQuestion);
	},
	appendExclusion(entry: ReviewExclusion): void {
		appendLine(LEARNER_FILES.exclusions, entry);
	},
	readExclusions(): ReviewExclusion[] {
		return readRawLines(LEARNER_FILES.exclusions).filter(isReviewExclusion);
	},
};
