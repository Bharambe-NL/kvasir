/**
 * The LearnerStore fs adapter (P1-1) and the Memory system's boundary with
 * the graph (D030). KV_DATA_DIR (and KV_AUTH_FILE, for the composition-root
 * import) point at a fresh tmp dir BEFORE the first config import: the seam
 * is module-load-bound, so no real data dir is ever touched.
 *
 * Pinning: append/read round-trips; a missing ledger reads []; corrupt and
 * wrong-shape lines are skipped; duplicate ids stay in the raw read (dedup is
 * core's job); every write lands under data/learner/; data/graph/ is
 * byte-identical after learner writes; the Memory system's graph view has
 * read methods only.
 */

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { after, describe, it } from "node:test";

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "kv-learner-store-"));
process.env.KV_DATA_DIR = path.join(TMP, "data");
process.env.KV_AUTH_FILE = path.join(TMP, "auth.json");

// Import AFTER the env redirect: module-load-bound seam.
const { learnerStore } = await import("../src/store/learner.ts");
const { LEARNER_FILES, PATHS } = await import("../config.ts");
const { uniqueReviews } = await import("../src/core/learner.ts");
type ReviewEntry = import("../src/core/contracts/learner.ts").ReviewEntry;

after(() => {
	fs.rmSync(TMP, { recursive: true, force: true });
});

const review = (id: string, nodeId: string, rating: 1 | 2 | 3 | 4): ReviewEntry => ({
	id,
	nodeId,
	rating,
	reviewedAt: "2026-10-31T09:00:00.000Z",
});

/** Every file under a dir, relative, with a content hash. */
function snapshot(dir: string): Record<string, string> {
	const out: Record<string, string> = {};
	if (!fs.existsSync(dir)) return out;
	for (const entry of fs.readdirSync(dir, { recursive: true, withFileTypes: true })) {
		if (!entry.isFile()) continue;
		const full = path.join(entry.parentPath, entry.name);
		out[path.relative(dir, full)] = createHash("sha256").update(fs.readFileSync(full)).digest("hex");
	}
	return out;
}

describe("LearnerStore adapter", () => {
	it("reads [] before anything has been reviewed", () => {
		assert.equal(fs.existsSync(LEARNER_FILES.reviews), false);
		assert.deepEqual(learnerStore.readReviews(), []);
	});

	it("round-trips appends in order, keeping duplicate ids in the raw read", () => {
		const a = review("rev_a", "n_1", 3);
		const b = review("rev_b", "n_2", 1);
		learnerStore.appendReview(a);
		learnerStore.appendReview(b);
		learnerStore.appendReview(a);
		assert.deepEqual(learnerStore.readReviews(), [a, b, a]);
		assert.deepEqual(uniqueReviews(learnerStore.readReviews()), [a, b]);
	});

	it("skips corrupt and wrong-shape lines instead of failing the read", () => {
		const before = learnerStore.readReviews();
		fs.appendFileSync(LEARNER_FILES.reviews, '{"id":"rev_torn","nodeId":\n');
		fs.appendFileSync(LEARNER_FILES.reviews, `${JSON.stringify({ id: "rev_bad", nodeId: "n_3", rating: 9, reviewedAt: "2026-10-31T09:00:00.000Z" })}\n`);
		const c = review("rev_c", "n_3", 4);
		learnerStore.appendReview(c);
		assert.deepEqual(learnerStore.readReviews(), [...before, c]);
	});

	it("writes only under data/learner/", () => {
		const all = Object.keys(snapshot(PATHS.data));
		assert.ok(all.length > 0);
		for (const file of all) assert.ok(file.startsWith(`learner${path.sep}`), `unexpected write: ${file}`);
		assert.equal(path.dirname(LEARNER_FILES.reviews), PATHS.learner);
	});
});

describe("questions ledger (P1-4, D039)", () => {
	const question = (id: string, nodeId: string) => ({
		id,
		nodeId,
		cycle: 0,
		format: "cue" as const,
		prompt: "a cue",
		answer: "the proposition",
		generatedAt: "2026-10-31T09:00:00.000Z",
		model: "faux:test",
	});

	it("reads [] before any question exists, then round-trips appends in order", () => {
		assert.deepEqual(learnerStore.readQuestions(), []);
		const a = question("rq_a", "n_1");
		const b = question("rq_b", "n_2");
		learnerStore.appendQuestion(a);
		learnerStore.appendQuestion(b);
		assert.deepEqual(learnerStore.readQuestions(), [a, b]);
		assert.equal(path.dirname(LEARNER_FILES.questions), PATHS.learner);
	});

	it("skips corrupt and wrong-shape question lines", () => {
		const before = learnerStore.readQuestions();
		fs.appendFileSync(LEARNER_FILES.questions, '{"id":"rq_torn",\n');
		fs.appendFileSync(LEARNER_FILES.questions, `${JSON.stringify({ ...question("rq_bad", "n_3"), format: "quiz" })}\n`);
		const c = question("rq_c", "n_3");
		learnerStore.appendQuestion(c);
		assert.deepEqual(learnerStore.readQuestions(), [...before, c]);
	});

	it("keeps reviews and questions in separate files", () => {
		assert.notEqual(LEARNER_FILES.questions, LEARNER_FILES.reviews);
		assert.equal(learnerStore.readReviews().some((r) => (r as { id: string }).id.startsWith("rq_")), false);
	});
});

describe("exclusions ledger (P1-8, D055)", () => {
	const toggle = (id: string, sessionId: string, excluded: boolean) => ({ id, sessionId, excluded, at: "2026-11-01T09:00:00.000Z" });

	it("reads [] before any toggle, round-trips appends in order, and skips bad lines", () => {
		assert.deepEqual(learnerStore.readExclusions(), []);
		const a = toggle("rx_a", "c1", true);
		const b = toggle("rx_b", "c1", false);
		learnerStore.appendExclusion(a);
		fs.appendFileSync(LEARNER_FILES.exclusions, '{"id":"rx_torn",\n');
		fs.appendFileSync(LEARNER_FILES.exclusions, `${JSON.stringify({ ...toggle("rx_bad", "c1", true), excluded: 1 })}\n`);
		learnerStore.appendExclusion(b);
		assert.deepEqual(learnerStore.readExclusions(), [a, b]);
		assert.equal(path.dirname(LEARNER_FILES.exclusions), PATHS.learner);
		assert.notEqual(LEARNER_FILES.exclusions, LEARNER_FILES.reviews);
	});
});

describe("the Memory system never writes to the graph (D030)", () => {
	it("leaves data/graph/ byte-identical across learner writes and reads", () => {
		fs.mkdirSync(PATHS.graph, { recursive: true });
		fs.writeFileSync(path.join(PATHS.graph, "nodes.jsonl"), '{"id":"n_1","name":"x","statement":"x","aliases":[],"createdAt":"2026-10-31T09:00:00.000Z","provenance":[]}\n');
		fs.writeFileSync(path.join(PATHS.graph, "chains.jsonl"), "");
		const beforeGraph = snapshot(PATHS.graph);
		learnerStore.appendReview(review("rev_d", "n_1", 2));
		learnerStore.readReviews();
		assert.deepEqual(snapshot(PATHS.graph), beforeGraph);
	});

	it("the learner adapter never references the graph ledgers or the graph adapter", () => {
		const source = fs.readFileSync(new URL("../src/store/learner.ts", import.meta.url), "utf8");
		const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
		for (const forbidden of ["LEDGER_FILES", "PATHS.graph", "POSITIONS_FILE", "SOURCES_FILE", "GRAPH_FORMAT_FILE", "./graph", "graphStore"]) {
			assert.equal(code.includes(forbidden), false, `src/store/learner.ts references ${forbidden}`);
		}
	});

	it("the composition root hands Memory a graph view with read methods only", async () => {
		const { graphReader, stores } = await import("../src/server/stores.ts");
		assert.deepEqual(Object.keys(graphReader).sort(), ["readChains", "readNodes"]);
		assert.deepEqual(graphReader.readNodes(), stores.graphStore.readNodes());
		assert.equal(stores.learnerStore, learnerStore);
	});
});
