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
 * - setReviewExclusion (P1-8): opts a birth session out of review or back
 *   in (D053 to D055). Every read here leaves excluded sessions' cards out.
 * All three emit "reviews-changed" so open review views refetch.
 */

import type { ReviewEntry, ReviewExclusion, ReviewQuestion, ReviewRating } from "../core/contracts/learner.ts";
import { REVIEW_RATINGS } from "../core/contracts/learner.ts";
import { deriveCards, type ReviewCard } from "../core/cards.ts";
import { emit } from "../core/events.ts";
import { getGraph } from "../core/graph.ts";
import { birthSessionOf } from "../core/session-clusters.ts";
import { excludedSessions, questionFor, uniqueReviews } from "../core/learner.ts";
import { buildQueue, measuredRetention } from "../core/review-queue.ts";
import type { ReviewExclusionsView, ReviewQueueItem, ReviewQueueView, ReviewSummary } from "../core/review-view.ts";
import { previewRatings, retrievability } from "../core/schedule.ts";
import { resolveRoleSpec } from "../core/settings-resolution.ts";
export type { ReviewExclusionsView, ReviewQueueItem, ReviewQueueView, ReviewSummary };
import { piEngineForSpec, type PiEngine } from "../agent/models.ts";
import { generateDueQuestions, type RelatedStatement } from "../agent/subagents/review-generator.ts";
import { providerKeyPresent } from "./keys.ts";
import { graphReader, stores } from "./stores.ts";

const newId = (prefix: string) => `${prefix}_${Date.now().toString(36)}_${crypto.randomUUID().slice(0, 8)}`;

/** The birth sessions currently out of review (D055). */
function currentExclusions(): Set<string> {
	return excludedSessions(stores.learnerStore.readExclusions());
}

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
	const { cards } = deriveCards(graphReader, reviews, currentExclusions());
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

/** The home signals (P1-6): today's due count (the review page's queue,
 *  limits included) and the current recall chance of every reviewed live
 *  card (D045). A pure read: no generation, no writes, no events. */
export function reviewSummary(nowDate: Date = new Date()): ReviewSummary {
	const now = nowDate.toISOString();
	const reviews = stores.learnerStore.readReviews();
	const { cards } = deriveCards(graphReader, reviews, currentExclusions());
	const { queue } = buildQueue(cards, reviews, now, localDayStart(nowDate));
	const heat: Record<string, number> = {};
	for (const card of cards) {
		if (card.state.reps === 0) continue;
		const r = retrievability(card.nodeId, reviews, card.introducedAt, now);
		if (r !== null) heat[card.nodeId] = r;
	}
	return { due: queue.length, heat };
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
	const node = getGraph(graphReader).nodes.find((n) => n.id === nodeId);
	if (!node) {
		return { ok: false, status: 409, error: "that proposition is no longer in the graph" };
	}
	const birth = birthSessionOf(node);
	if (birth !== null && currentExclusions().has(birth)) {
		return { ok: false, status: 409, error: "that proposition's session is excluded from review" };
	}
	const entry: ReviewEntry = { id, nodeId, rating: rating as ReviewRating, reviewedAt: nowDate.toISOString() };
	stores.learnerStore.appendReview(entry);
	emit("reviews-changed", {});
	return { ok: true, duplicate: false };
}

/** The birth sessions currently out of review, sorted (P1-8). */
export function reviewExclusions(): ReviewExclusionsView {
	return { excluded: [...currentExclusions()].sort() };
}

export type SetReviewExclusionResult =
	| { ok: true; changed: boolean; excluded: boolean }
	| { ok: false; status: 400; error: string };

/** Opt one birth session out of review, or back in (D053 to D055). The
 *  session must be a known chat or the birth session of a proposition in
 *  the graph. Appends a line only when the state changes, so a repeat is a
 *  no-op. Reviews are never touched. */
export function setReviewExclusion(body: unknown, nowDate: Date = new Date()): SetReviewExclusionResult {
	const b = (typeof body === "object" && body !== null ? body : {}) as Record<string, unknown>;
	const sessionId = typeof b.sessionId === "string" ? b.sessionId.trim() : "";
	if (!sessionId) return { ok: false, status: 400, error: "sessionId is required" };
	if (typeof b.excluded !== "boolean") return { ok: false, status: 400, error: "excluded must be true or false" };
	const known =
		stores.chatStore.getChat(sessionId) !== null || getGraph(graphReader).nodes.some((n) => birthSessionOf(n) === sessionId);
	if (!known) return { ok: false, status: 400, error: "unknown session" };
	const current = currentExclusions().has(sessionId);
	if (current === b.excluded) return { ok: true, changed: false, excluded: current };
	const entry: ReviewExclusion = { id: newId("rx"), sessionId, excluded: b.excluded, at: nowDate.toISOString() };
	stores.learnerStore.appendExclusion(entry);
	emit("reviews-changed", {});
	return { ok: true, changed: true, excluded: b.excluded };
}
