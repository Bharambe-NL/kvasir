/**
 * The review opt-out (P1-8, D053 to D056) over a temp copy of the golden
 * data through the real stores, with a fixed clock. "Done when": an
 * excluded session's cards leave the queue; their reviews stay in the
 * ledger; including it again restores them. The copy has no model slots
 * and no provider keys, so nothing can reach a real model.
 */

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { after, describe, it } from "node:test";

const GOLDEN = fileURLToPath(new URL("./fixtures/golden-data", import.meta.url));
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "kv-review-exclusions-"));
fs.cpSync(GOLDEN, TMP, { recursive: true });
const settingsFile = path.join(TMP, "settings.json");
const settings = JSON.parse(fs.readFileSync(settingsFile, "utf8"));
delete settings.models;
fs.writeFileSync(settingsFile, JSON.stringify(settings));
process.env.KV_DATA_DIR = TMP;
process.env.KV_AUTH_FILE = path.join(TMP, "auth.json");
for (const key of Object.keys(process.env)) if (/_API_KEY$|_TOKEN$/.test(key)) delete process.env[key];

const { reviewQueueView, reviewSummary, recordReview, reviewExclusions, setReviewExclusion } = await import("../src/server/review.ts");
const { learnerStore } = await import("../src/store/learner.ts");
const { graphStore } = await import("../src/store/graph.ts");
const { subscribe } = await import("../src/core/events.ts");
const { deriveCards } = await import("../src/core/cards.ts");
const { excludedSessions } = await import("../src/core/learner.ts");
const { isReviewExclusion } = await import("../src/core/contracts/learner.ts");
const { birthSessionPartition } = await import("../src/core/session-clusters.ts");
const { memoryTools } = await import("../src/agent/tools/memory.ts");
type ReviewExclusion = import("../src/core/contracts/learner.ts").ReviewExclusion;

after(() => {
	fs.rmSync(TMP, { recursive: true, force: true });
});

const NOW = new Date("2026-11-01T09:00:00.000Z");
const ago = (days: number) => new Date(NOW.getTime() - days * 86_400_000).toISOString();
const graph = { readNodes: () => graphStore.readNodes(), readChains: () => graphStore.readChains() };
const hash = (file: string) => createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const REVIEWS_FILE = path.join(TMP, "learner", "reviews.jsonl");
const EXCLUSIONS_FILE = path.join(TMP, "learner", "exclusions.jsonl");

// Two golden sessions with a few propositions each: A is the one excluded,
// B is the control. Every member is reviewed twice 40 days ago, so all are
// due now and all have heat.
const clusters = birthSessionPartition(graphStore.readNodes()).filter((c) => c.members.length >= 3 && c.members.length <= 30);
const A = clusters[0]!;
const B = clusters[1]!;
let seq = 0;
for (const id of [...A.members, ...B.members]) {
	learnerStore.appendReview({ id: `rev_x_${++seq}`, nodeId: id, rating: 3, reviewedAt: ago(40) });
	learnerStore.appendReview({ id: `rev_x_${++seq}`, nodeId: id, rating: 3, reviewedAt: new Date(Date.parse(ago(40)) + 600_000).toISOString() });
}
const queueIds = () => new Set(reviewQueueView(NOW, { generate: false }).items.map((i) => i.nodeId));
const dueOf = () => new Map(deriveCards(graph, learnerStore.readReviews()).cards.map((c) => [c.nodeId, c.state.due]));

describe("excludedSessions and the contract (D055)", () => {
	const line = (id: string, sessionId: string, excluded: boolean, at: string): ReviewExclusion => ({ id, sessionId, excluded, at });
	it("the latest toggle per session decides, a retried id counts once", () => {
		assert.deepEqual([...excludedSessions([])], []);
		assert.deepEqual([...excludedSessions([line("rx_1", "c1", true, ago(3))])], ["c1"]);
		assert.deepEqual([...excludedSessions([line("rx_1", "c1", true, ago(3)), line("rx_2", "c1", false, ago(2))])], []);
		assert.deepEqual(
			[...excludedSessions([line("rx_1", "c1", true, ago(3)), line("rx_2", "c1", false, ago(2)), line("rx_3", "c1", true, ago(1)), line("rx_4", "c2", true, ago(1))])].sort(),
			["c1", "c2"],
		);
		// Out of order on disk: the later `at` still wins.
		assert.deepEqual([...excludedSessions([line("rx_2", "c1", false, ago(1)), line("rx_1", "c1", true, ago(5))])], []);
		// Same `at`: the later line wins. A retried id is ignored.
		assert.deepEqual([...excludedSessions([line("rx_1", "c1", true, ago(1)), line("rx_2", "c1", false, ago(1))])], []);
		assert.deepEqual([...excludedSessions([line("rx_1", "c1", true, ago(2)), line("rx_2", "c1", false, ago(1)), line("rx_2", "c1", false, ago(1))])], []);
	});

	it("the guard is strict", () => {
		assert.equal(isReviewExclusion(line("rx_1", "c1", true, ago(1))), true);
		for (const bad of [null, [], {}, { ...line("rx_1", "c1", true, ago(1)), excluded: "yes" }, { ...line("", "c1", true, ago(1)) }, { ...line("rx_1", " ", true, ago(1)) }, { ...line("rx_1", "c1", true, "nope") }]) {
			assert.equal(isReviewExclusion(bad), false, JSON.stringify(bad));
		}
	});
});

describe("deriveCards leaves excluded sessions out (D054)", () => {
	it("lists the excluded node ids and leaves other sessions' cards alone", () => {
		const reviews = learnerStore.readReviews();
		const all = deriveCards(graph, reviews);
		assert.deepEqual(all.excluded, []);
		const without = deriveCards(graph, reviews, new Set([A.id]));
		assert.deepEqual(without.excluded, [...A.members].sort());
		assert.equal(without.cards.length, all.cards.length - A.members.length);
		for (const id of A.members) assert.equal(without.cards.some((c) => c.nodeId === id), false);
		for (const id of B.members) assert.ok(without.cards.some((c) => c.nodeId === id));
	});
});

describe("excluding and including a session (Done when)", () => {
	it("its cards leave the queue, the due count and the heat; reviews stay; including restores them", () => {
		const events: string[] = [];
		const off = subscribe((e) => events.push(e.type));
		try {
			const dueBefore = dueOf();
			const before = queueIds();
			for (const id of [...A.members, ...B.members]) assert.ok(before.has(id), `${id} is due before`);
			const heatBefore = reviewSummary(NOW).heat;
			const countBefore = reviewSummary(NOW).due;
			const reviewsHash = hash(REVIEWS_FILE);

			assert.deepEqual(setReviewExclusion({ sessionId: A.id, excluded: true }, NOW), { ok: true, changed: true, excluded: true });
			assert.deepEqual(reviewExclusions(), { excluded: [A.id] });
			assert.deepEqual(events, ["reviews-changed"]);

			const during = queueIds();
			for (const id of A.members) assert.equal(during.has(id), false, `${id} left the queue`);
			for (const id of B.members) assert.ok(during.has(id), `${id} is untouched`);
			const summary = reviewSummary(NOW);
			for (const id of A.members) assert.equal(id in summary.heat, false, `${id} has no heat`);
			for (const id of B.members) assert.equal(summary.heat[id], heatBefore[id]);
			assert.equal(summary.due, countBefore - A.members.length);
			assert.equal(hash(REVIEWS_FILE), reviewsHash, "reviews.jsonl is byte-identical");
			assert.equal(learnerStore.readReviews().filter((r) => A.members.includes(r.nodeId)).length, A.members.length * 2);
			const refused = recordReview({ nodeId: A.members[0], rating: 3 }, NOW);
			assert.equal(refused.ok, false);
			assert.equal(hash(REVIEWS_FILE), reviewsHash, "a refused rating writes nothing");

			assert.deepEqual(setReviewExclusion({ sessionId: A.id, excluded: false }, new Date(NOW.getTime() + 1000)), { ok: true, changed: true, excluded: false });
			assert.deepEqual(reviewExclusions(), { excluded: [] });
			assert.deepEqual(queueIds(), before, "the same queue comes back");
			assert.deepEqual(reviewSummary(NOW).heat, heatBefore, "the same heat comes back");
			assert.deepEqual(dueOf(), dueBefore, "the same schedules come back");
			assert.equal(hash(REVIEWS_FILE), reviewsHash);
		} finally {
			off();
		}
	});

	it("a repeat appends nothing, and bad bodies are refused", () => {
		setReviewExclusion({ sessionId: B.id, excluded: true }, NOW);
		const lines = fs.readFileSync(EXCLUSIONS_FILE, "utf8");
		assert.deepEqual(setReviewExclusion({ sessionId: B.id, excluded: true }, NOW), { ok: true, changed: false, excluded: true });
		assert.equal(fs.readFileSync(EXCLUSIONS_FILE, "utf8"), lines, "no new line for a repeat");
		assert.equal(learnerStore.readExclusions().length, 3);
		for (const body of [null, {}, { sessionId: "" }, { sessionId: B.id }, { sessionId: B.id, excluded: "true" }, { sessionId: "chat_nope", excluded: true }]) {
			const r = setReviewExclusion(body, NOW);
			assert.equal(r.ok, false, JSON.stringify(body));
			if (!r.ok) assert.equal(r.status, 400);
		}
		assert.equal(fs.readFileSync(EXCLUSIONS_FILE, "utf8"), lines);
		setReviewExclusion({ sessionId: B.id, excluded: false }, new Date(NOW.getTime() + 1000));
	});

	it("the memory tool hides an excluded session's weak cards", async () => {
		const weakAt = new Date(NOW.getTime() + 400 * 86_400_000).toISOString();
		const ctx = (exclusions: ReviewExclusion[]) =>
			memoryTools({ graph, readReviews: () => learnerStore.readReviews(), readExclusions: () => exclusions, now: () => weakAt });
		const open = (await ctx([]).list_weak_propositions!.execute!("tc", {})).details as string;
		assert.ok(A.members.some((id) => open.includes(id)), "A is weak while included");
		const hidden = (await ctx([{ id: "rx_m", sessionId: A.id, excluded: true, at: ago(0) }]).list_weak_propositions!.execute!("tc", {})).details as string;
		for (const id of A.members) assert.equal(hidden.includes(id), false, `${id} is hidden`);
	});
});
