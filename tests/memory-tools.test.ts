/**
 * list_weak_propositions (P1-7, D049 to D052) through the REAL prober and
 * teacher registries, over a temp copy of the golden data with seeded
 * reviews and a fixed clock. "Done when": the teacher can probe weak items,
 * and the call writes nothing (data/graph/ and data/learner/ byte-identical).
 */

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { after, describe, it } from "node:test";

const GOLDEN = fileURLToPath(new URL("./fixtures/golden-data", import.meta.url));
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "kv-memory-tools-"));
fs.cpSync(GOLDEN, TMP, { recursive: true });
process.env.KV_DATA_DIR = TMP;
process.env.KV_AUTH_FILE = path.join(TMP, "auth.json");

const { createProberTools, createTeacherTools } = await import("../src/agent/tools.ts");
const { memoryTools, WEAK_LIST_LIMIT } = await import("../src/agent/tools/memory.ts");
const { graphStore } = await import("../src/store/graph.ts");
const { learnerStore } = await import("../src/store/learner.ts");
const { chatStore } = await import("../src/store/chats.ts");
type ReviewEntry = import("../src/core/contracts/learner.ts").ReviewEntry;
type JobStore = import("../src/core/ports.ts").JobStore;

after(() => {
	fs.rmSync(TMP, { recursive: true, force: true });
});

const NOW = "2026-11-01T09:00:00.000Z";
const ago = (days: number, extraMinutes = 0) => new Date(Date.parse(NOW) - days * 86_400_000 + extraMinutes * 60_000).toISOString();
const graph = { readNodes: () => graphStore.readNodes(), readChains: () => graphStore.readChains() };
const ids = [...new Set(graphStore.readNodes().map((n) => n.id))];
const statements = graphStore.readNodes().map((n) => n.statement).filter((s) => s.length > 0);

// Seed: 10 cards learned 300 days ago (slipping), 1 learned 20 days ago
// (about 72%, still weak), 3 learned an hour ago (strong, not weak).
let seq = 0;
const learn = (nodeId: string, at: string): ReviewEntry[] => [
	{ id: `rev_seed_${++seq}`, nodeId, rating: 3, reviewedAt: at },
	{ id: `rev_seed_${++seq}`, nodeId, rating: 3, reviewedAt: new Date(Date.parse(at) + 10 * 60_000).toISOString() },
];
const slipping = ids.slice(0, 10);
const fading = ids[10]!;
const strong = ids.slice(11, 14);
for (const id of slipping) for (const r of learn(id, ago(300))) learnerStore.appendReview(r);
for (const r of learn(fading, ago(20))) learnerStore.appendReview(r);
for (const id of strong) for (const r of learn(id, ago(0, -60))) learnerStore.appendReview(r);

const memory = { graph, readReviews: () => learnerStore.readReviews(), readExclusions: () => [], now: () => NOW };
const stubJobStore = { createJob: () => ({}), getJob: () => undefined, listJobs: () => [], updateJob: () => {} } as unknown as JobStore;
const baseCtx = { chatId: "c1", chatStore, jobStore: stubJobStore, spawn: () => {} };

function hashes(dir: string): Record<string, string> {
	const out: Record<string, string> = {};
	for (const entry of fs.readdirSync(dir, { recursive: true, withFileTypes: true })) {
		if (!entry.isFile()) continue;
		const full = path.join(entry.parentPath, entry.name);
		out[path.relative(dir, full)] = createHash("sha256").update(fs.readFileSync(full)).digest("hex");
	}
	return out;
}

describe("registration behind the gate (D049, D050)", () => {
	it("the teacher and the prober carry list_weak_propositions only when memory is wired", () => {
		assert.equal("list_weak_propositions" in createTeacherTools(baseCtx), false);
		assert.equal("list_weak_propositions" in createTeacherTools({ ...baseCtx, memory }), true);
		assert.equal("list_weak_propositions" in createProberTools({ ...baseCtx, deliver: () => {} }), false);
		assert.equal("list_weak_propositions" in createProberTools({ ...baseCtx, deliver: () => {}, memory }), true);
	});
});

describe("the teacher probes weak items, and nothing is written (Done when)", () => {
	it("lists reviewed propositions below 80%, weakest first, names only, with no writes", async () => {
		const graphBefore = hashes(path.join(TMP, "graph"));
		const learnerBefore = hashes(path.join(TMP, "learner"));

		const tools = createTeacherTools({ ...baseCtx, memory });
		const out = (await tools.list_weak_propositions!.execute!("tc", {})).details as string;

		assert.match(out, /^11 weak proposition\(s\), weakest first:/);
		const lines = out.split("\n").slice(1);
		assert.equal(lines.length, 11);
		// The 20-day card is the least weak, so it comes last.
		assert.match(lines.at(-1)!, new RegExp(`id: ${fading}$`));
		for (const id of slipping) assert.ok(out.includes(`id: ${id}`), `${id} is listed`);
		for (const id of strong) assert.equal(out.includes(id), false, `${id} is strong, not weak`);
		const percents = lines.map((l) => Number(/recall (\d+)%/.exec(l)![1]));
		assert.deepEqual([...percents].sort((a, b) => a - b), percents, "weakest first");
		assert.ok(percents.every((p) => p < 80));
		assert.match(lines[0]!, /^1\. .+: recall \d+%, forgotten 0 times, last reviewed \d{4}-\d{2}-\d{2}, id: n_\w+$/);
		for (const statement of statements) {
			assert.equal(out.includes(statement), false, "never the statement text (D052)");
		}

		assert.deepEqual(hashes(path.join(TMP, "graph")), graphBefore, "graph files unchanged");
		assert.deepEqual(hashes(path.join(TMP, "learner")), learnerBefore, "learner files unchanged");
	});
});

describe("limits and empty states (D051)", () => {
	it("caps the list at the weakest 15", async () => {
		const many = ids.slice(20, 50).flatMap((id) => learn(id, ago(400)));
		const tools = memoryTools({ graph, readReviews: () => [...learnerStore.readReviews(), ...many], readExclusions: () => [], now: () => NOW });
		const out = (await tools.list_weak_propositions!.execute!("tc", {})).details as string;
		assert.equal(WEAK_LIST_LIMIT, 15);
		assert.match(out, /^15 weak proposition\(s\)/);
		assert.equal(out.split("\n").length, 16);
	});

	it("says when nothing has been reviewed, and when nothing is weak", async () => {
		const none = memoryTools({ graph, readReviews: () => [], readExclusions: () => [], now: () => NOW });
		assert.match((await none.list_weak_propositions!.execute!("tc", {})).details as string, /No proposition has been reviewed yet/);
		const fresh = strong.flatMap((id) => learn(id, ago(0, -60)));
		const allStrong = memoryTools({ graph, readReviews: () => fresh, readExclusions: () => [], now: () => NOW });
		assert.match((await allStrong.list_weak_propositions!.execute!("tc", {})).details as string, /No weak propositions: all 3 reviewed/);
	});
});
