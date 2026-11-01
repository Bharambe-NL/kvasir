/**
 * The Kvasir MCP tools (Kvasir P6-2, D090 to D092) over a temp copy of the
 * golden data with a DORA version, a citation, reviews and an exclusion
 * seeded: each tool's output, the empty states, and the data folder left
 * byte-identical (no file or folder created). No network, no model.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { after, describe, it } from "node:test";

const GOLDEN = fileURLToPath(new URL("./fixtures/golden-data", import.meta.url));
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "kv-mcp-tools-"));
fs.cpSync(GOLDEN, TMP, { recursive: true });
process.env.KV_DATA_DIR = TMP;
process.env.KV_AUTH_FILE = path.join(TMP, "auth.json");

const { graphStore } = await import("../src/store/graph.ts");
const { learnerStore } = await import("../src/store/learner.ts");
const { chatStore } = await import("../src/store/chats.ts");
const { callKvasirTool, KVASIR_TOOLS } = await import("../src/mcp/server.ts");
const { parseEurlex } = await import("../src/core/source-parse/eurlex.ts");
const { contentHashOf, eurlexSourceId, versionIdFor } = await import("../src/core/source-ids.ts");
type KvasirReadContext = import("../src/mcp/tools.ts").KvasirReadContext;

after(() => fs.rmSync(TMP, { recursive: true, force: true }));

// Seed: DORA v1 units and version, a citation on "Knowledge tracing", two
// reviews long ago (so its recall is low), and nothing excluded.
const BYTES = fs.readFileSync(fileURLToPath(new URL("./fixtures/sources/dora.xhtml", import.meta.url)));
const PARSED = parseEurlex(BYTES.toString("utf8"));
const DORA = eurlexSourceId("32022R2554");
const V1 = versionIdFor(DORA, contentHashOf(BYTES));
graphStore.writeDocumentUnits(V1, PARSED.units);
graphStore.appendDocumentVersion({ sourceId: DORA, versionId: V1, format: "eurlex-html", title: PARSED.title, celex: "32022R2554", consolidatedAt: "2022-12-14", contentHash: contentHashOf(BYTES), filePath: "dora.xhtml", importedAt: "2026-11-01T09:00:00.000Z" });
const KT = "n_9b19474daaf7";
graphStore.appendCitation({ id: "cit_000000000001", nodeId: KT, sourceId: DORA, version: V1, path: ["Chapter V", "Section I", "Article 28", "paragraph 2"], quote: "shall adopt, and regularly review, a strategy", createdAt: "2026-11-01T09:00:00.000Z" });
learnerStore.appendReview({ id: "rev_1", nodeId: KT, rating: 3, reviewedAt: "2026-01-01T09:00:00.000Z" });
learnerStore.appendReview({ id: "rev_2", nodeId: KT, rating: 3, reviewedAt: "2026-01-01T09:10:00.000Z" });

const NOW = "2026-11-01T09:00:00.000Z";
const ctx: KvasirReadContext = {
	readNodes: () => graphStore.readNodes(),
	readChains: () => graphStore.readChains(),
	readCitations: () => graphStore.readCitations(),
	readDocumentVersions: () => graphStore.readDocumentVersions(),
	readDocumentUnits: (v) => graphStore.readDocumentUnits(v),
	readSources: () => graphStore.readSources(),
	readReviews: () => learnerStore.readReviews(),
	readExclusions: () => learnerStore.readExclusions(),
	listChats: () => fs.readdirSync(path.join(TMP, "chats")).filter((f) => f.endsWith(".json")).map((f) => chatStore.getChat(f.slice(0, -5))!).map((c) => ({ id: c.id, title: c.title, createdAt: c.createdAt, updatedAt: c.updatedAt }) as never),
	now: () => NOW,
	dayStart: () => "2026-11-01T00:00:00.000Z",
};
const call = (name: string, args: Record<string, unknown> = {}) => callKvasirTool(ctx, name, args);

function snapshot(dir: string): Record<string, string> {
	const out: Record<string, string> = {};
	for (const e of fs.readdirSync(dir, { recursive: true, withFileTypes: true })) {
		const full = path.join(e.parentPath, e.name);
		out[path.relative(dir, full)] = e.isFile() ? createHash("sha256").update(fs.readFileSync(full)).digest("hex") : "dir";
	}
	return out;
}

describe("the tool list (D090)", () => {
	it("offers exactly the six read-only tools", () => {
		assert.deepEqual(KVASIR_TOOLS.map((t) => t.name), ["search_graph", "get_proposition", "list_sources", "read_source", "list_sessions", "review_status"]);
		for (const t of KVASIR_TOOLS) assert.match(t.description!, /^Read-only\. /, t.name);
	});
});

describe("search_graph and get_proposition", () => {
	it("finds by words, names first, with source labels", () => {
		const out = call("search_graph", { query: "knowledge tracing" });
		assert.match(out, /^\d+ propositions? matched/);
		assert.match(out.split("\n")[1]!, new RegExp(`^${KT} \\| Knowledge tracing \\| .* \\| sources: Regulation \\(EU\\) 2022/2554, Art\\. 28\\(2\\)$`));
		assert.equal(call("search_graph", { query: "zzzz qqqq" }), "No proposition matched. Try fewer or different words.");
		assert.equal(call("search_graph", {}), "Give some words to search for.");
		assert.equal(call("search_graph", { query: "the", limit: 2 }).split("\n").length, 3, "limit respected");
	});
	it("gives a proposition's statement, birth, chains, citations and review state", () => {
		const out = call("get_proposition", { id: KT });
		assert.match(out, new RegExp(`^Knowledge tracing \\(${KT}\\)\\nKnowledge tracing is the problem`));
		assert.match(out, /\nBorn in: /);
		assert.match(out, /\nUsed as a premise in:\n- /);
		assert.match(out, /\nCitations:\n- Regulation \(EU\) 2022\/2554, Art\. 28\(2\) \(version 2022-12-14\): "shall adopt, and regularly review, a strategy"/);
		assert.match(out, /\nReview: 2 reviews, recall \d+%, next due \d{4}-\d{2}-\d{2}, forgotten 0 times\.$/);
		assert.equal(call("get_proposition", { id: "n_nope" }), 'No proposition with id "n_nope". Use search_graph to find ids.');
		const other = call("search_graph", { query: "item response theory" }).split("\n")[1]!.split(" | ")[0]!;
		assert.match(call("get_proposition", { id: other }), /\nReview: not reviewed yet\.$/);
	});
});

describe("list_sources and read_source", () => {
	it("lists the document with its version and citing count", () => {
		assert.equal(
			call("list_sources"),
			["1 imported document:", "", `Regulation (EU) 2022/2554: ${PARSED.title}`, "Versions: 2022-12-14 (imported 2026-11-01)", "Propositions citing it: 1"].join("\n"),
		);
	});
	it("reads by address with labels, not lesson links", () => {
		const out = call("read_source", { address: "Art. 28(2)" });
		assert.match(out, /^1 paragraph from Regulation \(EU\) 2022\/2554 \(version 2022-12-14\):\nRegulation \(EU\) 2022\/2554, Art\. 28\(2\) General principles\nAs part of their ICT risk management framework/);
		assert.doesNotMatch(out, /#src-/);
	});
});

describe("list_sessions and review_status", () => {
	it("lists sessions with kind and counts, and a session's propositions", () => {
		const out = call("list_sessions");
		assert.match(out, /^\d+ sessions? produced propositions, most recent first:/);
		const first = out.split("\n")[1]!.split(" | ");
		assert.equal(first.length, 5);
		assert.ok(["session", "notes", "document"].includes(first[1]!));
		const props = call("list_sessions", { session: first[0] });
		assert.match(props, /^\d+ propositions? from /);
		assert.match(props.split("\n")[1]!, /^n_[0-9a-f]+ \| /);
		assert.match(call("list_sessions", { session: "nope" }), /^No session "nope"/);
	});
	it("reports due today, weak propositions and retention", () => {
		const out = call("review_status");
		assert.match(out, /^Due today: \d+ \(limits: 20 new and 200 reviews a day; \d+ new left\)\./);
		assert.match(out, /\nCards: \d+, of which 1 reviewed at least once\./);
		assert.match(out, /\nMeasured retention, last 30 days: no scheduled reviews yet\./);
		assert.match(out, /\nWeakest propositions \(recall below 80%\):\n- Knowledge tracing: recall \d+% \(n_9b19474daaf7\)$/);
	});
	it("an unknown tool is an error", () => {
		assert.throws(() => call("write_graph"), /Unknown tool: write_graph/);
	});
});

describe("read-only (Done when, in part)", () => {
	it("calling every tool leaves the data folder byte-identical, with nothing created", () => {
		const before = snapshot(TMP);
		for (const t of KVASIR_TOOLS) call(t.name, { query: "risk", id: KT, address: "Art. 28", session: "x" });
		assert.deepEqual(snapshot(TMP), before);
	});
});
