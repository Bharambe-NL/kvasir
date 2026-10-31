/**
 * The review session's server side (P1-5): the Memory system's composition
 * of the card source, the queue, the scheduler's previews, the question
 * ledger and the generator. It reads the graph only through graphReader
 * (D030) and writes only the learner ledgers.
 *
 * - reviewQueueView: today's queue within the D041 limits. Each item carries
 *   its stored question for the current cycle, or the D042 fallback (the
 *   proposition name as the cue), plus the four rating previews. Reading the
 *   queue starts background generation for items without a question.
 * - recordReview: appends one review, idempotent by id, and refuses a node
 *   that is no longer a card.
 * Both emit "reviews-changed" so open review views refetch.
 */

import type { ReviewEntry, ReviewQuestion, ReviewRating } from "../core/contracts/learner.ts";
import { REVIEW_RATINGS } from "../core/contracts/learner.ts";
import { deriveCards, type ReviewCard } from "../core/cards.ts";
import { emit } from "../core/events.ts";
import { getGraph } from "../core/graph.ts";
import { questionFor, uniqueReviews } from "../core/learner.ts";
import { buildQueue, measuredRetention } from "../core/review-queue.ts";
import type { ReviewQueueItem, ReviewQueueView } from "../core/review-view.ts";
import { previewRatings } from "../core/schedule.ts";
import { resolveRoleSpec } from "../core/settings-resolution.ts";
export type { ReviewQueueItem, ReviewQueueView };
import { piEngineForSpec, type PiEngine } from "../agent/models.ts";
import { generateDueQuestions, type RelatedStatement } from "../agent/subagents/review-generator.ts";
import { providerKeyPresent } from "./keys.ts";
import { graphReader, stores } from "./stores.ts";

const newId = (prefix: string) => `${prefix}_${Date.now().toString(36)}_${crypto.randomUUID().slice(0, 8)}`;

/** Local midnight of `now` (the server runs on the learner's machine). */
function localDayStart(now: Date): string {
	const d = new Date(now);
	d.setHours(0, 0, 0, 0);
	return d.toISOString();
}

/** The reviewGenerator engine, or undefined when no model is set or its
 *  provider key is missing (then the D042 fallback carries the review). */
function reviewEngine(): PiEngine | undefined {
	const spec = resolveRoleSpec("reviewGenerator", stores.settingsStore.readSettings());
	if (!spec) return undefined;
	const engine = piEngineForSpec(spec);
	return providerKeyPresent(engine.model.provider) ? engine : undefined;
}

/** Related propositions for a node: its premises and what it supports. */
function relatedLookup(): (nodeId: string) => RelatedStatement[] {
	const graph = getGraph(graphReader);
	const statement = new Map(graph.nodes.map((n) => [n.id, n.statement]));
	return (nodeId) => {
		const out: RelatedStatement[] = [];
		for (const chain of graph.chains) {
			if (chain.conclusion === nodeId) {
				for (const p of chain.premises) {
					const s = statement.get(p);
					if (s) out.push({ relation: "premise", statement: s });
				}
			} else if (chain.premises.includes(nodeId)) {
				const s = statement.get(chain.conclusion);
				if (s) out.push({ relation: "supports", statement: s });
			}
		}
		return out;
	};
}

interface GenerationGlobal {
	__kvReviewGenerationRunning?: boolean;
}

/** Start background generation for queue cards without a question. At most
 *  one run at a time (globalThis: one process, one truth); each stored
 *  question emits reviews-changed. Never throws into the caller. */
function startGeneration(queue: readonly ReviewCard[], questions: readonly ReviewQuestion[], now: string): void {
	const g = globalThis as typeof globalThis & GenerationGlobal;
	if (g.__kvReviewGenerationRunning) return;
	const missing = queue.filter((c) => questionFor(c.nodeId, c.state.reps, questions) === null);
	if (missing.length === 0) return;
	const engine = reviewEngine();
	if (!engine) return;
	g.__kvReviewGenerationRunning = true;
	void generateDueQuestions({
		cards: missing,
		questions,
		relatedFor: relatedLookup(),
		engine,
		appendQuestion: (q) => {
			stores.learnerStore.appendQuestion(q);
			emit("reviews-changed", {});
		},
		now,
		newId: () => newId("rq"),
	})
		.catch((err) => console.error("[review] question generation failed:", err))
		.finally(() => {
			g.__kvReviewGenerationRunning = false;
		});
}

/** Today's review queue, with questions, previews, counts and retention. */
export function reviewQueueView(nowDate: Date = new Date(), options: { generate?: boolean } = {}): ReviewQueueView {
	const now = nowDate.toISOString();
	const reviews = stores.learnerStore.readReviews();
	const questions = stores.learnerStore.readQuestions();
	const { cards } = deriveCards(graphReader, reviews);
	const { queue, stats } = buildQueue(cards, reviews, now, localDayStart(nowDate));
	if (options.generate !== false) startGeneration(queue, questions, now);

	const items = queue.map((card): ReviewQueueItem => {
		const stored = questionFor(card.nodeId, card.state.reps, questions);
		const previews = previewRatings(card.nodeId, reviews, card.introducedAt, now);
		return {
			nodeId: card.nodeId,
			name: card.name,
			phase: card.state.phase,
			question: stored
				? { format: stored.format, prompt: stored.prompt, answer: stored.answer }
				: { format: "fallback", prompt: `Recall: ${card.name}`, answer: card.statement },
			previews: { 1: previews[1].due, 2: previews[2].due, 3: previews[3].due, 4: previews[4].due },
		};
	});
	return { now, items, stats, retention: measuredRetention(cards, reviews, now) };
}

export type RecordReviewResult =
	| { ok: true; duplicate: boolean }
	| { ok: false; status: 400 | 409; error: string };

/** Record one self-rating. Idempotent by id; refuses a node that is not a
 *  live card. reviewedAt is the server's clock. */
export function recordReview(body: unknown, nowDate: Date = new Date()): RecordReviewResult {
	const b = (typeof body === "object" && body !== null ? body : {}) as Record<string, unknown>;
	const nodeId = typeof b.nodeId === "string" ? b.nodeId : "";
	const rating = b.rating;
	if (!nodeId) return { ok: false, status: 400, error: "nodeId is required" };
	if (typeof rating !== "number" || !(REVIEW_RATINGS as readonly number[]).includes(rating)) {
		return { ok: false, status: 400, error: "rating must be 1, 2, 3 or 4" };
	}
	const id = typeof b.id === "string" && b.id.length > 0 ? b.id : newId("rev");
	const reviews = uniqueReviews(stores.learnerStore.readReviews());
	if (reviews.some((r) => r.id === id)) return { ok: true, duplicate: true };
	if (!getGraph(graphReader).nodes.some((n) => n.id === nodeId)) {
		return { ok: false, status: 409, error: "that proposition is no longer in the graph" };
	}
	const entry: ReviewEntry = { id, nodeId, rating: rating as ReviewRating, reviewedAt: nowDate.toISOString() };
	stores.learnerStore.appendReview(entry);
	emit("reviews-changed", {});
	return { ok: true, duplicate: false };
}
