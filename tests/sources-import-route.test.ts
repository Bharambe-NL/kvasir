/**
 * POST /api/sources/import (Kvasir P2-3, D071, D073, D074) through the real
 * route and the real sources pipeline, with in-memory graph ledgers and
 * faux stages: the extractor cites the first unit of whatever stretch it is
 * shown. DORA end to end: every chunk merges, every node is cited, and the
 * version line is written. No real model, no network.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { after, describe, it } from "node:test";
import { createFauxCore, fauxAssistantMessage, fauxToolCall, type FauxResponseStep, type ToolCall } from "@earendil-works/pi-ai";

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "kv-sources-route-"));
process.env.KV_DATA_DIR = TMP;
process.env.KV_AUTH_FILE = path.join(TMP, "auth.json");

const { POST } = await import("../app/api/sources/import/route.ts");
const { extraction } = await import("../src/server/index.ts");
const { createExtractionPipeline } = await import("../src/agent/subagents/extraction.ts");
const { chatStore } = await import("../src/store/chats.ts");
type GraphStore = import("../src/core/ports.ts").GraphStore;
type GraphNode = import("../src/core/contracts.ts").GraphNode;

const FIX = fileURLToPath(new URL("./fixtures/sources/", import.meta.url));
const original = extraction.importSource;
after(() => {
	extraction.importSource = original;
	fs.rmSync(TMP, { recursive: true, force: true });
});

function memoryLedgers(): GraphStore {
	const nodes: GraphNode[] = [];
	const chains: ReturnType<GraphStore["readChains"]> = [];
	const sources = new Map<string, ReturnType<GraphStore["readSources"]>[number]>();
	const documents: ReturnType<GraphStore["readDocumentVersions"]> = [];
	const citations: ReturnType<GraphStore["readCitations"]> = [];
	const units = new Map<string, ReturnType<GraphStore["readDocumentUnits"]> & object>();
	return {
		appendNode: (n) => void nodes.push(n), readNodes: () => [...nodes],
		appendChain: (c) => void chains.push(c), readChains: () => [...chains],
		appendCheckpoint: () => {}, readCheckpoints: () => [],
		appendCoverage: () => {}, readCoverage: () => [],
		appendDocumentVersion: (v) => void documents.push(v), readDocumentVersions: () => [...documents],
		appendCitation: (c) => void citations.push(c), readCitations: () => [...citations],
		writeDocumentUnits: (v, u) => void (units.has(v) || units.set(v, u)), readDocumentUnits: (v) => units.get(v) ?? null,
		upsertSource: (s) => void sources.set(s.id, { ...s, extractions: sources.get(s.id)?.extractions ?? [] }),
		readSources: () => [...sources.values()],
		appendSourceUsage: (id, u) => void sources.get(id)?.extractions?.push(u),
		readPositions: () => ({}), writePositions: () => {},
		rewriteLedgers: (next) => {
			if (next.chains) chains.splice(0, chains.length, ...next.chains);
		},
	};
}

/** An extractor that cites the first unit of four or more words in the
 *  stretch it reads, quoting its first six words. */
const citingStep: FauxResponseStep = (context) => {
	const user = context.messages.find((m) => m.role === "user");
	const text = typeof user?.content === "string" ? user.content : JSON.stringify(user?.content ?? "");
	const lines = text.split("\n");
	let pick: { label: string; quote: string } | null = null;
	for (let i = 0; i < lines.length - 1 && !pick; i++) {
		const m = /^\[(U\d+)\] /.exec(lines[i]!);
		const words = lines[i + 1]!.split(/\s+/).filter(Boolean);
		if (m && words.length >= 4) pick = { label: m[1]!, quote: words.slice(0, 6).join(" ") };
	}
	return fauxAssistantMessage([fauxToolCall("submit_findings", {
		propositions: pick ? [{ id: "p1", name: `Idea from ${pick.label}`, statement: `Under DORA, ${pick.quote}.`, aliases: [], citations: [{ unit: pick.label, quote: pick.quote }] }] : [],
		chains: [],
	} as unknown as ToolCall["arguments"])], { stopReason: "toolUse" });
};
const repeating = (step: FauxResponseStep, n: number) => {
	const faux = createFauxCore({});
	faux.setResponses(Array.from({ length: n }, () => step));
	return { model: faux.getModel(), streamFn: faux.streamSimple };
};
const review: FauxResponseStep = () => fauxAssistantMessage([fauxToolCall("submit_review", { links: [] } as unknown as ToolCall["arguments"])], { stopReason: "toolUse" });

function request(files: { name: string; bytes: Uint8Array; label?: string }[]) {
	const form = new FormData();
	for (const f of files) {
		form.append("files", new File([new Uint8Array(f.bytes)], f.name));
		form.append("labels", f.label ?? "");
	}
	return new Request("http://localhost/api/sources/import", { method: "POST", body: form });
}

describe("POST /api/sources/import", () => {
	const ledgers = memoryLedgers();
	extraction.importSource = createExtractionPipeline({
		chatStore,
		graphStore: ledgers,
		engineFor: (role) => (role === "auditor" ? repeating(review, 200) : repeating(citingStep, 200)),
	}).importSource;
	const dora = new Uint8Array(fs.readFileSync(path.join(FIX, "dora.xhtml")));

	it("imports DORA end to end: every chunk merges and every node is cited", async () => {
		const res = await POST(request([{ name: "dora.xhtml", bytes: dora }]));
		const { results } = await res.json();
		assert.equal(results.length, 1);
		assert.equal(results[0].outcome, "completed", JSON.stringify(results[0]));
		assert.ok(results[0].stats.nodes > 5, `nodes: ${results[0].stats.nodes}`);
		const cited = new Set(ledgers.readCitations().map((c) => c.nodeId));
		for (const n of ledgers.readNodes()) assert.ok(cited.has(n.id));
		const [version] = ledgers.readDocumentVersions();
		assert.equal(version!.celex, "32022R2554");
		assert.equal(version!.consolidatedAt, "2022-12-14");
		assert.ok(ledgers.readCitations().every((c) => c.version === version!.versionId && c.path.length > 0));
	});

	it("refuses the same version again, and refuses plain HTML", async () => {
		const res = await POST(request([
			{ name: "dora.xhtml", bytes: dora },
			{ name: "page.html", bytes: new TextEncoder().encode("<html><p>hello</p></html>") },
		]));
		const { results } = await res.json();
		const byName = Object.fromEntries(results.map((r: { filePath: string }) => [r.filePath, r]));
		assert.equal(byName["dora.xhtml"].outcome, "duplicate");
		assert.match(byName["dora.xhtml"].error, /^This version of REGULATION \(EU\) 2022\/2554 .* is already imported\.$/);
		assert.equal(byName["page.html"].outcome, "unsupported");
		assert.match(byName["page.html"].error, /no EUR-Lex markup/);
	});

	it("passes a Markdown file's label through (D074)", async () => {
		const md = new TextEncoder().encode("# Register\n\nFinancial entities shall maintain a register of information on all contractual arrangements.");
		const res = await POST(request([{ name: "register.md", bytes: md, label: "Draft 2" }]));
		const { results } = await res.json();
		assert.equal(results[0].outcome, "completed", JSON.stringify(results[0]));
		const v = ledgers.readDocumentVersions().find((d) => d.format === "markdown")!;
		assert.equal(v.label, "Draft 2");
	});

	it("answers 400 with no files", async () => {
		const res = await POST(new Request("http://localhost/api/sources/import", { method: "POST", body: new FormData() }));
		assert.equal(res.status, 400);
	});
});
