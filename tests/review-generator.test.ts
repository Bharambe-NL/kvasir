/**
 * The review generator (P1-4) against the faux pi engine: no network, no
 * real LLM. Each scripted step reads the request it receives and answers for
 * the card named in it, so concurrent calls stay deterministic whatever
 * order they arrive in. Covers the D038 formats, the submit retry, FAILURE
 * ISOLATION ("Done when"), skipping, the shared semaphore's 3-permit cap and
 * abort.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createFauxCore, fauxAssistantMessage, fauxToolCall, type FauxResponseStep, type ToolCall } from "@earendil-works/pi-ai";
import type { PiEngine } from "../src/agent/models.ts";
import { generateDueQuestions, REVIEW_GENERATOR_INSTRUCTIONS } from "../src/agent/subagents/review-generator.ts";
import type { ReviewCard } from "../src/core/cards.ts";
import type { CardPhase, ReviewQuestion } from "../src/core/contracts/learner.ts";
import { ROLE_SLOT } from "../src/core/settings.ts";

const NOW = "2026-11-01T09:00:00.000Z";

const card = (nodeId: string, phase: CardPhase, reps = 0, due = "2026-11-01T08:00:00.000Z"): ReviewCard => ({
	nodeId,
	name: `Name ${nodeId}`,
	statement: `Statement of ${nodeId}.`,
	introducedAt: "2026-10-01T09:00:00.000Z",
	state: { nodeId, phase, due, stability: 1, difficulty: 5, reps, lapses: 0, lastReviewedAt: null },
});

type Reply = { prompt: string; answer: string } | "throw";

/** An engine with `calls` scripted steps; each step finds the card id in the
 *  request text and answers with reply(cardId, attempt). */
function scriptedEngine(reply: (nodeId: string, attempt: number) => Reply, calls = 40, delayMs = 0): { engine: PiEngine; maxConcurrent: () => number } {
	const attempts = new Map<string, number>();
	let active = 0;
	let max = 0;
	const step: FauxResponseStep = async (context) => {
		active++;
		max = Math.max(max, active);
		try {
			if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
			const text = JSON.stringify(context.messages);
			const nodeId = /Name (n_[a-z0-9]+)/.exec(text)?.[1] ?? "unknown";
			const attempt = (attempts.get(nodeId) ?? 0) + 1;
			attempts.set(nodeId, attempt);
			const r = reply(nodeId, attempt);
			if (r === "throw") throw new Error(`provider failure for ${nodeId}`);
			return fauxAssistantMessage([fauxToolCall("submit_review_question", r as unknown as ToolCall["arguments"], { id: `call-${nodeId}-${attempt}` })], {
				stopReason: "toolUse",
			});
		} finally {
			active--;
		}
	};
	const faux = createFauxCore({});
	faux.setResponses(Array.from({ length: calls }, () => step));
	return { engine: { model: faux.getModel(), streamFn: faux.streamSimple }, maxConcurrent: () => max };
}

const good = (nodeId: string): Reply => ({ prompt: `Cue for ${nodeId}`, answer: `Answer for ${nodeId}` });

function harness() {
	const appended: ReviewQuestion[] = [];
	let n = 0;
	return { appended, appendQuestion: (q: ReviewQuestion) => void appended.push(q), newId: () => `rq_${++n}` };
}

describe("review generator", () => {
	it("runs on the reviewGenerator role, which resolves through the cheap slot (D040)", () => {
		assert.equal(ROLE_SLOT.reviewGenerator, "cheap");
		assert.match(REVIEW_GENERATOR_INSTRUCTIONS, /submit_review_question/);
	});

	it("writes a cue for a learning card and a scenario for a review card (D038), and stores them", async () => {
		const { engine } = scriptedEngine((id) => good(id));
		const h = harness();
		const results = await generateDueQuestions({
			cards: [card("n_a", "learning", 1), card("n_b", "review", 3)],
			questions: [],
			relatedFor: () => [],
			engine,
			appendQuestion: h.appendQuestion,
			now: NOW,
			newId: h.newId,
		});
		assert.deepEqual(results.map((r) => r.ok), [true, true]);
		const byNode = new Map(h.appended.map((q) => [q.nodeId, q]));
		assert.equal(byNode.get("n_a")!.format, "cue");
		assert.equal(byNode.get("n_b")!.format, "scenario");
		assert.equal(byNode.get("n_a")!.cycle, 1);
		assert.equal(byNode.get("n_b")!.cycle, 3);
		assert.equal(byNode.get("n_a")!.prompt, "Cue for n_a");
		assert.equal(byNode.get("n_a")!.answer, "Answer for n_a");
		assert.equal(byNode.get("n_a")!.generatedAt, NOW);
		assert.match(byNode.get("n_a")!.model, /^faux/);
	});

	it("retries a schema-valid but empty submit, then accepts the second", async () => {
		const { engine } = scriptedEngine((id, attempt) => (attempt === 1 ? { prompt: " ", answer: "x" } : good(id)));
		const h = harness();
		const [result] = await generateDueQuestions({
			cards: [card("n_a", "new")],
			questions: [],
			relatedFor: () => [],
			engine,
			appendQuestion: h.appendQuestion,
			now: NOW,
			newId: h.newId,
		});
		assert.equal(result!.ok, true);
		assert.equal(h.appended.length, 1);
		assert.equal(h.appended[0]!.prompt, "Cue for n_a");
	});

	it("isolates a failure to its own card (Done when)", async () => {
		const { engine } = scriptedEngine((id) => (id === "n_b" ? "throw" : good(id)));
		const h = harness();
		const results = await generateDueQuestions({
			cards: [card("n_a", "new"), card("n_b", "new"), card("n_c", "review", 2)],
			questions: [],
			relatedFor: () => [],
			engine,
			appendQuestion: h.appendQuestion,
			now: NOW,
			newId: h.newId,
		});
		const byNode = new Map(results.map((r) => [r.nodeId, r]));
		assert.equal(byNode.get("n_a")!.ok, true);
		assert.equal(byNode.get("n_c")!.ok, true);
		const failed = byNode.get("n_b")!;
		assert.equal(failed.ok, false);
		assert.ok(!failed.ok && failed.error.length > 0, "the failure carries its error");
		assert.deepEqual(h.appended.map((q) => q.nodeId).sort(), ["n_a", "n_c"], "nothing is stored for the failed card");
	});

	it("skips cards that are not due or already have a question for their cycle; a new cycle gets a new one", async () => {
		const { engine } = scriptedEngine((id) => good(id));
		const h = harness();
		const existing: ReviewQuestion = {
			id: "rq_old",
			nodeId: "n_has",
			cycle: 2,
			format: "scenario",
			prompt: "old",
			answer: "old",
			generatedAt: "2026-10-31T09:00:00.000Z",
			model: "faux:test",
		};
		const results = await generateDueQuestions({
			cards: [
				card("n_has", "review", 2),
				card("n_moved", "review", 3),
				card("n_later", "new", 0, "2026-11-02T09:00:00.000Z"),
			],
			questions: [existing, { ...existing, id: "rq_moved_old", nodeId: "n_moved", cycle: 2 }],
			relatedFor: () => [],
			engine,
			appendQuestion: h.appendQuestion,
			now: NOW,
			newId: h.newId,
		});
		assert.deepEqual(results.map((r) => r.nodeId), ["n_moved"]);
		assert.equal(h.appended[0]!.cycle, 3);
	});

	it("never runs more than the shared semaphore's 3 permits at once", async () => {
		const { engine, maxConcurrent } = scriptedEngine((id) => good(id), 40, 25);
		const h = harness();
		const cards = ["n_a", "n_b", "n_c", "n_d", "n_e"].map((id) => card(id, "new"));
		const results = await generateDueQuestions({ cards, questions: [], relatedFor: () => [], engine, appendQuestion: h.appendQuestion, now: NOW, newId: h.newId });
		assert.equal(results.filter((r) => r.ok).length, 5);
		assert.equal(maxConcurrent(), 3);
	});

	it("passes related propositions to the model", async () => {
		let seen = "";
		const faux = createFauxCore({});
		faux.setResponses([
			(context) => {
				seen = JSON.stringify(context.messages);
				return fauxAssistantMessage([fauxToolCall("submit_review_question", good("n_a") as unknown as ToolCall["arguments"], { id: "c1" })], { stopReason: "toolUse" });
			},
		]);
		const h = harness();
		await generateDueQuestions({
			cards: [card("n_a", "review", 2)],
			questions: [],
			relatedFor: () => [{ relation: "premise", statement: "Each category is stolen a different way." }],
			engine: { model: faux.getModel(), streamFn: faux.streamSimple },
			appendQuestion: h.appendQuestion,
			now: NOW,
			newId: h.newId,
		});
		assert.match(seen, /Format: scenario/);
		assert.match(seen, /premise of it\) Each category is stolen a different way\./);
	});

	it("an aborted run stores nothing and reports every card as failed", async () => {
		const { engine } = scriptedEngine((id) => good(id));
		const h = harness();
		const controller = new AbortController();
		controller.abort();
		const results = await generateDueQuestions({
			cards: [card("n_a", "new"), card("n_b", "new")],
			questions: [],
			relatedFor: () => [],
			engine,
			appendQuestion: h.appendQuestion,
			now: NOW,
			newId: h.newId,
			signal: controller.signal,
		});
		assert.deepEqual(results.map((r) => r.ok), [false, false]);
		assert.equal(h.appended.length, 0);
	});
});
