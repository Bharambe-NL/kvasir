/**
 * The card source (P1-3). Unit cases over an in-memory graph, then the
 * golden fixture graph through the real stores ("Done when": it produces
 * the expected card set), then a node deletion end to end (the core of P1
 * gate check 3). KV_DATA_DIR points at a temp copy of the golden data
 * BEFORE any config import, so the fixture itself is never touched.
 */

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { after, describe, it } from "node:test";
import type { GraphChain, GraphNode } from "../src/core/contracts/graph.ts";
import type { ReviewEntry, ReviewRating } from "../src/core/contracts/learner.ts";

const GOLDEN = fileURLToPath(new URL("./fixtures/golden-data", import.meta.url));
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "kv-card-source-"));
fs.cpSync(GOLDEN, TMP, { recursive: true });
process.env.KV_DATA_DIR = TMP;
process.env.KV_AUTH_FILE = path.join(TMP, "auth.json");

const { deriveCards, dueCards } = await import("../src/core/cards.ts");
const { getGraph } = await import("../src/core/graph.ts");
const { deleteNodeTraces } = await import("../src/core/graph-deletion.ts");
const { graphStore } = await import("../src/store/graph.ts");
const { learnerStore } = await import("../src/store/learner.ts");

after(() => {
	fs.rmSync(TMP, { recursive: true, force: true });
});

const T0 = "2026-11-01T09:00:00.000Z";
const at = (minutes: number) => new Date(Date.parse(T0) + minutes * 60_000).toISOString();
const node = (id: string, createdAt: string, extra: Partial<GraphNode> = {}): GraphNode => ({
	id,
	name: id,
	statement: `statement of ${id}`,
	aliases: [],
	createdAt,
	provenance: [],
	...extra,
});
const review = (id: string, nodeId: string, rating: ReviewRating, reviewedAt: string): ReviewEntry => ({ id, nodeId, rating, reviewedAt });
const graphOf = (nodes: GraphNode[], chains: GraphChain[] = []) => ({ readNodes: () => nodes, readChains: () => chains });

function snapshot(dir: string): Record<string, string> {
	const out: Record<string, string> = {};
	for (const entry of fs.readdirSync(dir, { recursive: true, withFileTypes: true })) {
		if (!entry.isFile()) continue;
		const full = path.join(entry.parentPath, entry.name);
		out[path.relative(dir, full)] = createHash("sha256").update(fs.readFileSync(full)).digest("hex");
	}
	return out;
}

describe("deriveCards", () => {
	it("gives one card per proposition, introduced at its first line, even across link-appends", () => {
		const first = node("n_a", at(0), { statement: "A" });
		const linkAppend = node("n_a", at(500), { statement: "A, phrased again" });
		const { cards, inert } = deriveCards(graphOf([first, linkAppend, node("n_b", at(5))]), []);
		assert.deepEqual(cards.map((c) => c.nodeId), ["n_a", "n_b"]);
		assert.equal(cards[0]!.introducedAt, at(0));
		assert.equal(cards[0]!.statement, "A");
		assert.deepEqual(inert, []);
	});

	it("a card with no reviews is new and due at its introduction", () => {
		const [card] = deriveCards(graphOf([node("n_a", at(0))]), []).cards;
		assert.equal(card!.state.phase, "new");
		assert.equal(card!.state.due, at(0));
	});

	it("reviews move a card's state; other cards are unaffected", () => {
		const graph = graphOf([node("n_a", at(0)), node("n_b", at(0))]);
		const { cards } = deriveCards(graph, [review("rev_1", "n_a", 3, at(60))]);
		const a = cards.find((c) => c.nodeId === "n_a")!;
		const b = cards.find((c) => c.nodeId === "n_b")!;
		assert.equal(a.state.phase, "learning");
		assert.equal(a.state.reps, 1);
		assert.equal(b.state.phase, "new");
	});

	it("reviews of a node that no longer exists make it inert: no card, no error", () => {
		const reviews = [review("rev_1", "n_gone", 3, at(10)), review("rev_2", "n_a", 3, at(10)), review("rev_3", "n_never", 1, at(20))];
		const { cards, inert } = deriveCards(graphOf([node("n_a", at(0))]), reviews);
		assert.deepEqual(cards.map((c) => c.nodeId), ["n_a"]);
		assert.deepEqual(inert, ["n_gone", "n_never"]);
	});

	it("orders cards by introduction time, then id, whatever the ledger order", () => {
		const nodes = [node("n_c", at(5)), node("n_b", at(0)), node("n_a", at(5))];
		assert.deepEqual(deriveCards(graphOf(nodes), []).cards.map((c) => c.nodeId), ["n_b", "n_a", "n_c"]);
	});
});

describe("dueCards", () => {
	it("keeps the cards due at now, earliest due first", () => {
		const graph = graphOf([node("n_a", at(0)), node("n_b", at(-30)), node("n_later", at(60))]);
		const { cards } = deriveCards(graph, [review("rev_1", "n_a", 3, at(1))]);
		// n_a is due at +11 min (10-minute step after its review at +1); n_b at -30; n_later at +60.
		assert.deepEqual(dueCards(cards, at(0)).map((c) => c.nodeId), ["n_b"]);
		assert.deepEqual(dueCards(cards, at(30)).map((c) => c.nodeId), ["n_b", "n_a"]);
		assert.deepEqual(dueCards(cards, at(90)).map((c) => c.nodeId), ["n_b", "n_a", "n_later"]);
	});
});

describe("golden fixture graph (Done when)", () => {
	it("produces exactly one new card per proposition: 278 cards, introduced at each node's first line", () => {
		const before = snapshot(TMP);
		const graph = { readNodes: () => graphStore.readNodes(), readChains: () => graphStore.readChains() };
		const lines = graphStore.readNodes();
		const firstCreated = new Map<string, string>();
		for (const line of lines) if (!firstCreated.has(line.id)) firstCreated.set(line.id, line.createdAt);

		const { cards, inert } = deriveCards(graph, learnerStore.readReviews());
		assert.equal(lines.length, 298, "fixture node lines");
		assert.equal(cards.length, 278, "one card per unique proposition (20 link-appends)");
		assert.deepEqual(new Set(cards.map((c) => c.nodeId)), new Set(getGraph(graph).nodes.map((n) => n.id)));
		for (const card of cards) {
			assert.equal(card.introducedAt, firstCreated.get(card.nodeId));
			assert.equal(card.state.phase, "new");
			assert.equal(card.state.due, card.introducedAt);
		}
		assert.deepEqual(inert, []);
		assert.deepEqual(snapshot(TMP), before, "deriving cards writes nothing");
	});
});

describe("deleting a node end to end (P1 gate check 3)", () => {
	it("removes its card from the cards and the due queue, keeps its reviews, and throws nothing", () => {
		const graph = { readNodes: () => graphStore.readNodes(), readChains: () => graphStore.readChains() };
		const [first, second] = deriveCards(graph, []).cards;
		const now = "2026-11-01T09:00:00.000Z";
		learnerStore.appendReview(review("rev_del_1", first!.nodeId, 3, "2026-10-31T09:00:00.000Z"));
		learnerStore.appendReview(review("rev_keep_1", second!.nodeId, 4, "2026-10-31T09:00:00.000Z"));
		const ledgerBefore = fs.readFileSync(path.join(TMP, "learner", "reviews.jsonl"), "utf8");
		const secondBefore = deriveCards(graph, learnerStore.readReviews()).cards.find((c) => c.nodeId === second!.nodeId)!;

		assert.notEqual(deleteNodeTraces(graphStore, first!.nodeId), null, "the node existed");

		const after = deriveCards(graph, learnerStore.readReviews());
		assert.equal(after.cards.some((c) => c.nodeId === first!.nodeId), false);
		assert.equal(dueCards(after.cards, now).some((c) => c.nodeId === first!.nodeId), false);
		assert.deepEqual(after.inert, [first!.nodeId]);
		assert.equal(after.cards.length, 277);
		assert.deepEqual(after.cards.find((c) => c.nodeId === second!.nodeId), secondBefore);
		assert.equal(fs.readFileSync(path.join(TMP, "learner", "reviews.jsonl"), "utf8"), ledgerBefore, "the review ledger is untouched");
	});
});
