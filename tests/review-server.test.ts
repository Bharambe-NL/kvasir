/**
 * The review server module (P1-5) over a temp copy of the golden data
 * through the real stores. The copy's settings have NO model slots and the
 * environment has no provider keys, so background generation can never
 * reach a real model: no network, no real LLM (the test rule).
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { after, describe, it } from "node:test";

const GOLDEN = fileURLToPath(new URL("./fixtures/golden-data", import.meta.url));
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "kv-review-server-"));
fs.cpSync(GOLDEN, TMP, { recursive: true });
const settingsFile = path.join(TMP, "settings.json");
const settings = JSON.parse(fs.readFileSync(settingsFile, "utf8"));
delete settings.models;
fs.writeFileSync(settingsFile, JSON.stringify(settings));
process.env.KV_DATA_DIR = TMP;
process.env.KV_AUTH_FILE = path.join(TMP, "auth.json");
for (const key of Object.keys(process.env)) if (/_API_KEY$|_TOKEN$/.test(key)) delete process.env[key];

const { reviewQueueView, recordReview } = await import("../src/server/review.ts");
const { learnerStore } = await import("../src/store/learner.ts");
const { subscribe } = await import("../src/core/events.ts");

after(() => {
	fs.rmSync(TMP, { recursive: true, force: true });
});

const NOW = new Date("2026-11-01T09:00:00.000Z");
const later = (minutes: number) => new Date(NOW.getTime() + minutes * 60_000);

describe("reviewQueueView", () => {
	it("serves 20 new cards from the 278-card golden graph, each with the name fallback (D041, D042)", () => {
		const view = reviewQueueView(NOW, { generate: false });
		assert.equal(view.items.length, 20);
		assert.equal(view.stats.newLeft, 20);
		assert.equal(view.retention, null);
		for (const item of view.items) {
			assert.equal(item.question.format, "fallback");
			assert.equal(item.question.prompt, `Recall: ${item.name}`);
			assert.ok(item.question.answer.length > 0);
			assert.equal(item.phase, "new");
			const order = [1, 2, 3, 4].map((r) => Date.parse(item.previews[r as 1 | 2 | 3 | 4]));
			assert.ok(order[0]! < order[1]! || order[0]! <= order[1]!, "Again comes no later than Hard");
			assert.ok(order[2]! < order[3]!, "Good comes before Easy");
		}
	});

	it("with no model configured, reading the queue starts no generation and throws nothing", () => {
		const before = learnerStore.readQuestions().length;
		assert.doesNotThrow(() => reviewQueueView(NOW));
		assert.equal(learnerStore.readQuestions().length, before);
	});

	it("a stored question for the card's cycle replaces the fallback", () => {
		const [first] = reviewQueueView(NOW, { generate: false }).items;
		learnerStore.appendQuestion({
			id: "rq_test_1",
			nodeId: first!.nodeId,
			cycle: 0,
			format: "cue",
			prompt: "A stored cue",
			answer: "A stored answer",
			generatedAt: NOW.toISOString(),
			model: "faux:test",
		});
		const item = reviewQueueView(NOW, { generate: false }).items.find((i) => i.nodeId === first!.nodeId)!;
		assert.deepEqual(item.question, { format: "cue", prompt: "A stored cue", answer: "A stored answer" });
	});
});

describe("recordReview", () => {
	it("appends one review, moves the card out of the queue, and emits reviews-changed", () => {
		const events: string[] = [];
		const stop = subscribe((e) => events.push(e.type));
		const [first] = reviewQueueView(NOW, { generate: false }).items;
		const result = recordReview({ id: "rev_test_1", nodeId: first!.nodeId, rating: 3 }, NOW);
		stop();
		assert.deepEqual(result, { ok: true, duplicate: false });
		assert.ok(events.includes("reviews-changed"));
		assert.equal(learnerStore.readReviews().filter((r) => r.id === "rev_test_1").length, 1);
		const view = reviewQueueView(NOW, { generate: false });
		assert.equal(view.items.some((i) => i.nodeId === first!.nodeId), false, "Good on a new card waits for the 10-minute step");
		assert.equal(view.stats.newToday, 1);
		assert.equal(view.stats.newLeft, 19);
		const back = reviewQueueView(later(11), { generate: false });
		assert.equal(back.items[0]!.nodeId, first!.nodeId, "after the step it comes back first, as an in-progress card");
		assert.equal(back.items[0]!.phase, "learning");
	});

	it("is idempotent by id: a retried rating appends nothing", () => {
		const [item] = reviewQueueView(NOW, { generate: false }).items;
		const before = learnerStore.readReviews().length;
		assert.deepEqual(recordReview({ id: "rev_retry", nodeId: item!.nodeId, rating: 4 }, NOW), { ok: true, duplicate: false });
		assert.deepEqual(recordReview({ id: "rev_retry", nodeId: item!.nodeId, rating: 4 }, NOW), { ok: true, duplicate: true });
		assert.equal(learnerStore.readReviews().length, before + 1);
	});

	it("refuses bad input and nodes that are no longer cards", () => {
		const before = learnerStore.readReviews().length;
		assert.equal(recordReview({ nodeId: "", rating: 3 }).ok, false);
		const bad = recordReview({ nodeId: "n_x", rating: 7 });
		assert.ok(!bad.ok && bad.status === 400);
		const gone = recordReview({ id: "rev_gone", nodeId: "n_does_not_exist", rating: 3 });
		assert.ok(!gone.ok && gone.status === 409);
		assert.equal(learnerStore.readReviews().length, before);
	});
});
