/** GraphStore contract (Kvasir P6-1, D111), run against both adapters. */
import { ADAPTERS, DATA } from "./harness.ts";
import assert from "node:assert/strict";
import fs from "node:fs";
import * as path from "node:path";
import { describe, it } from "node:test";

const { getGraph } = await import("../../src/core/graph.ts");

const T = "2026-11-01T09:00:00.000Z";
const pt = (chatId: string, messageId = "m1") => ({ chatId, messageId });
const node = (id: string, name: string, chat = "chat_a", aliases: string[] = []) => ({ id, name, statement: `${name} holds.`, aliases, createdAt: T, provenance: [pt(chat)] });
const chain = (id: string, premises: string[], conclusion: string, chat = "chat_a") => ({ id, premises, conclusion, provenance: [pt(chat)], createdAt: T });
const version = { sourceId: "doc_dora00000000", versionId: "ver_dfa4295bb03c", format: "eurlex-html", title: "REGULATION (EU) 2022/2554", celex: "32022R2554", consolidatedAt: "2022-12-14", contentHash: "a".repeat(64), filePath: "dora.xhtml", importedAt: T } as const;
const citation = { id: "cit_1", nodeId: "n_a", sourceId: "doc_dora00000000", version: "ver_dfa4295bb03c", path: ["Article 28", "paragraph 1"], quote: "financial entities shall manage", createdAt: T };
const units = [{ path: ["Article 28", "paragraph 1"], text: "Financial entities shall manage ICT third-party risk." }, { path: ["Article 28"], text: "", heading: "General principles" }];
const formatFile = path.join(DATA, "graph", "format.json");

for (const adapter of ADAPTERS) {
	describe(`GraphStore on ${adapter.name}`, () => {
		it("reads an empty graph as empty", () => {
			const { graph } = adapter.fresh();
			assert.deepEqual([graph.readNodes(), graph.readChains(), graph.readCheckpoints(), graph.readCoverage(), graph.readDocumentVersions(), graph.readCitations(), graph.readSources()], [[], [], [], [], [], [], []]);
			assert.deepEqual(graph.readPositions(), {});
			assert.equal(graph.readDocumentUnits("ver_dfa4295bb03c"), null);
			assert.equal(fs.existsSync(formatFile), false, "reads never stamp");
		});

		it("keeps every node and chain line in append order; getGraph merges link-appends", () => {
			const { graph, backend } = adapter.fresh();
			graph.appendNode(node("n_a", "A"));
			graph.appendNode(node("n_b", "B"));
			graph.appendNode(node("n_a", "A again", "chat_b", ["alias of A"]));
			backend.appendLine("nodes", { id: "n_bad" });
			graph.appendChain(chain("arg_1", ["n_a"], "n_b"));
			graph.appendChain(chain("arg_2", ["n_a"], "n_b", "chat_b"));
			backend.appendLine("chains", chain("arg_3", [], "n_b"));
			assert.deepEqual(graph.readNodes().map((n) => n.id), ["n_a", "n_b", "n_a"]);
			assert.deepEqual(graph.readChains().map((c) => c.id), ["arg_1", "arg_2"]);
			const g = getGraph(graph);
			const a = g.nodes.find((n) => n.id === "n_a")!;
			assert.equal(a.name, "A", "the first line defines");
			assert.deepEqual(a.aliases, ["A again holds.", "alias of A"]);
			assert.deepEqual(a.provenance, [pt("chat_a"), pt("chat_b")]);
			assert.equal(g.chains.length, 1, "chain assertions merge by premises and conclusion");
			assert.deepEqual(g.chains[0]!.provenance, [pt("chat_a"), pt("chat_b")]);
		});

		it("reads checkpoints, coverage, document versions and citations back", () => {
			const { graph } = adapter.fresh();
			const cp = { chatId: "src_notes", foldedAt: T };
			const cov = { chatId: "chat_a", fp: "fp1", tokens: 120, foldedAt: T };
			graph.appendCheckpoint(cp);
			graph.appendCoverage(cov);
			graph.appendDocumentVersion(version);
			graph.appendCitation(citation);
			assert.deepEqual(graph.readCheckpoints(), [cp]);
			assert.deepEqual(graph.readCoverage(), [cov]);
			assert.deepEqual(graph.readDocumentVersions(), [version]);
			assert.deepEqual(graph.readCitations(), [citation]);
		});

		it("the first write stamps the format; a newer stamp makes reads refuse", () => {
			const { graph } = adapter.fresh();
			graph.appendNode(node("n_a", "A"));
			assert.equal(JSON.parse(fs.readFileSync(formatFile, "utf8")).version, 1);
			fs.writeFileSync(formatFile, JSON.stringify({ version: 99 }));
			assert.throws(() => graph.readNodes(), /format version 99/);
		});

		it("rewriteLedgers replaces only the ledgers it is given; an empty list empties one", () => {
			const { graph } = adapter.fresh();
			graph.appendNode(node("n_a", "A"));
			graph.appendNode(node("n_b", "B"));
			graph.appendChain(chain("arg_1", ["n_a"], "n_b"));
			graph.appendCheckpoint({ chatId: "src_x", foldedAt: T });
			graph.appendCoverage({ chatId: "chat_a", fp: "fp1", tokens: 1, foldedAt: T });
			graph.rewriteLedgers({ nodes: [node("n_b", "B")], chains: [], checkpoints: [] });
			assert.deepEqual(graph.readNodes().map((n) => n.id), ["n_b"]);
			assert.deepEqual(graph.readChains(), []);
			assert.deepEqual(graph.readCheckpoints(), []);
			assert.equal(graph.readCoverage().length, 1, "coverage untouched");
			graph.appendNode(node("n_c", "C"));
			assert.deepEqual(graph.readNodes().map((n) => n.id), ["n_b", "n_c"], "appends continue after a rewrite");
		});

		it("document units are written once and read back; bad ids are refused", () => {
			const { graph } = adapter.fresh();
			graph.writeDocumentUnits("ver_dfa4295bb03c", units);
			graph.writeDocumentUnits("ver_dfa4295bb03c", [{ path: ["X"], text: "changed" }]);
			assert.deepEqual(graph.readDocumentUnits("ver_dfa4295bb03c"), units);
			assert.equal(graph.readDocumentUnits("ver_000000000000"), null);
			assert.equal(graph.readDocumentUnits("../etc"), null);
			assert.throws(() => graph.writeDocumentUnits("ver_x", units), /invalid version id/);
		});

		it("sources upsert keeps the usage log; usage appends once per run", () => {
			const { graph } = adapter.fresh();
			const run = { startedAt: T, model: "m", calls: [] } as never;
			graph.upsertSource({ id: "src_1", filePath: "notes.md", importedAt: T });
			graph.appendSourceUsage("src_1", run);
			graph.appendSourceUsage("src_1", run);
			graph.appendSourceUsage("src_missing", run);
			graph.upsertSource({ id: "src_1", filePath: "notes-renamed.md", importedAt: "2026-11-02T09:00:00.000Z" });
			const [s] = graph.readSources();
			assert.equal(s!.filePath, "notes-renamed.md");
			assert.deepEqual(s!.extractions, [run]);
			assert.equal(graph.readSources().length, 1);
		});

		it("positions replace whole and keep only finite points", () => {
			const { graph } = adapter.fresh();
			graph.writePositions({ n_a: { x: 1, y: 2 }, n_b: { x: Number.NaN, y: 0 } });
			assert.deepEqual(graph.readPositions(), { n_a: { x: 1, y: 2 } });
			graph.writePositions({ n_c: { x: 3, y: 4 } });
			assert.deepEqual(graph.readPositions(), { n_c: { x: 3, y: 4 } });
		});
	});
}
