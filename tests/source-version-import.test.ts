/**
 * Importing a new version (Kvasir P2-5, D073, D081, D082) through the real
 * pipeline with faux stages and in-memory ledgers: only new and changed
 * units reach the extractor, labels keep their numbering, citations point
 * at the new version, and "Version of" joins a file to an existing
 * document. No real model, no network.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { after, describe, it } from "node:test";
import { createFauxCore, fauxAssistantMessage, fauxToolCall, type FauxResponseStep, type ToolCall } from "@earendil-works/pi-ai";

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "kv-version-import-"));
process.env.KV_DATA_DIR = TMP;
process.env.KV_AUTH_FILE = path.join(TMP, "auth.json");

const { createExtractionPipeline, SourceImportError } = await import("../src/agent/subagents/extraction.ts");
const { chatStore } = await import("../src/store/chats.ts");
const { contentHashOf, eurlexSourceId, fileSourceId, versionIdFor } = await import("../src/core/source-ids.ts");
const { importSourceFile } = await import("../src/server/sources.ts");
type GraphStore = import("../src/core/ports.ts").GraphStore;
type ParsedSource = import("../src/core/contracts.ts").ParsedSource;
type DocumentVersion = import("../src/core/contracts.ts").DocumentVersion;
type GraphNode = import("../src/core/contracts.ts").GraphNode;
type PiEngine = import("../src/agent/models.ts").PiEngine;

after(() => fs.rmSync(TMP, { recursive: true, force: true }));

function memoryLedgers(): GraphStore {
	const nodes: GraphNode[] = [];
	const chains: ReturnType<GraphStore["readChains"]> = [];
	const sources = new Map<string, ReturnType<GraphStore["readSources"]>[number]>();
	const documents: ReturnType<GraphStore["readDocumentVersions"]> = [];
	const citations: ReturnType<GraphStore["readCitations"]> = [];
	const units = new Map<string, NonNullable<ReturnType<GraphStore["readDocumentUnits"]>>>();
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
		rewriteLedgers: (next) => { if (next.chains) chains.splice(0, chains.length, ...next.chains); },
	};
}
function engine(steps: FauxResponseStep[]): PiEngine {
	const faux = createFauxCore({});
	faux.setResponses(steps);
	return { model: faux.getModel(), streamFn: faux.streamSimple };
}
const review: FauxResponseStep = () => fauxAssistantMessage([fauxToolCall("submit_review", { links: [] } as unknown as ToolCall["arguments"])], { stopReason: "toolUse" });

/** An extractor that records the user prompt and cites the first labelled
 *  unit it is shown. */
function recordingStep(prompts: string[]): FauxResponseStep {
	return (context) => {
		const user = context.messages.find((m) => m.role === "user");
		const text = typeof user?.content === "string" ? user.content : JSON.stringify(user?.content ?? "");
		prompts.push(text);
		const lines = text.split("\n");
		const i = lines.findIndex((l) => /^\[U\d+\] /.test(l));
		const label = /^\[(U\d+)\]/.exec(lines[i]!)![1]!;
		const quote = lines[i + 1]!.split(" ").slice(0, 6).join(" ");
		return fauxAssistantMessage([fauxToolCall("submit_findings", {
			propositions: [{ id: "p1", name: `From ${label}`, statement: `Under DORA, ${quote}.`, aliases: [], citations: [{ unit: label, quote }] }],
			chains: [],
		} as unknown as ToolCall["arguments"])], { stopReason: "toolUse" });
	};
}

const TITLE = "REGULATION (EU) 2022/2554 OF THE EUROPEAN PARLIAMENT AND OF THE COUNCIL of 14 December 2022";
const DORA = eurlexSourceId("32022R2554");
const doc = (p2: string, extra = false): ParsedSource => ({
	format: "eurlex-html", title: TITLE, celex: "32022R2554",
	units: [
		{ path: ["Article 28"], heading: "General principles", text: "" },
		{ path: ["Article 28", "paragraph 1"], text: "Financial entities shall manage ICT third-party risk as part of ICT risk." },
		{ path: ["Article 28", "paragraph 2"], text: p2 },
		...(extra ? [{ path: ["Article 28", "paragraph 3"], text: "Financial entities shall keep a register of information on all contractual arrangements." }] : []),
	],
});
const ver = (content: string, date: string): DocumentVersion => ({
	sourceId: DORA, versionId: versionIdFor(DORA, contentHashOf(content)), format: "eurlex-html", title: TITLE,
	celex: "32022R2554", consolidatedAt: date, contentHash: contentHashOf(content), filePath: "dora.xhtml", importedAt: `${date}T09:00:00.000Z`,
});
const P2_V1 = "Financial entities shall adopt, and regularly review, a strategy on ICT third-party risk.";
const P2_V2 = "Financial entities shall adopt a strategy on ICT third-party risk and review it every year.";

describe("a new version extracts only new and changed units (D081)", () => {
	const ledgers = memoryLedgers();
	const prompts: string[] = [];
	const pipeline = createExtractionPipeline({ chatStore, graphStore: ledgers, extractor: engine(Array.from({ length: 6 }, () => recordingStep(prompts))), auditor: engine(Array.from({ length: 6 }, () => review)) });
	const v1 = ver("one", "2022-12-14");
	const v2 = ver("two", "2024-06-01");

	it("version 1 extracts everything", async () => {
		await pipeline.importSource({ parsed: doc(P2_V1), version: v1 });
		assert.match(prompts[0]!, /\[U1\] Article 28 > paragraph 1/);
		assert.match(prompts[0]!, /\[U2\] Article 28 > paragraph 2/);
	});

	it("version 2 shows only the changed and the new unit, with the same labels", async () => {
		await pipeline.importSource({ parsed: doc(P2_V2, true), version: v2 });
		const view = prompts[1]!;
		assert.doesNotMatch(view, /\[U1\]/, "the unchanged paragraph 1 is skipped");
		assert.match(view, /\[U2\] Article 28 > paragraph 2\n.*review it every year/);
		assert.match(view, /\[U3\] Article 28 > paragraph 3/);
		assert.match(view, /^Article 28: General principles$/m, "its container stays as context");
		const v2Cites = ledgers.readCitations().filter((c) => c.version === v2.versionId);
		assert.equal(v2Cites.length, 1);
		assert.deepEqual(v2Cites[0]!.path, ["Article 28", "paragraph 2"]);
		assert.deepEqual(ledgers.readDocumentVersions().map((v) => v.versionId), [v1.versionId, v2.versionId]);
	});

	it("an identical version is still refused, and a version with no changes runs no model", async () => {
		await assert.rejects(pipeline.importSource({ parsed: doc(P2_V2, true), version: v2 }), (e: unknown) => e instanceof SourceImportError && e.outcome === "duplicate");
		const before = prompts.length;
		const v3 = ver("three", "2025-01-01");
		assert.deepEqual(await pipeline.importSource({ parsed: doc(P2_V2, true), version: v3 }), { nodes: 0, chains: 0 });
		assert.equal(prompts.length, before, "no extractor call");
		assert.equal(ledgers.readDocumentVersions().at(-1)!.versionId, v3.versionId, "the version line is written");
		assert.ok(ledgers.readDocumentUnits(v3.versionId), "and its units");
	});
});

describe("Version of (D082)", () => {
	const md = (text: string) => new TextEncoder().encode(text);
	const capture = () => {
		const seen: { version?: DocumentVersion } = {};
		return { seen, run: async (input: { version: DocumentVersion }) => ((seen.version = input.version), { nodes: 0, chains: 0 }) };
	};
	const existing = (): DocumentVersion[] => [{ ...ver("x", "2022-01-01"), sourceId: fileSourceId("policy.md"), format: "markdown", consolidatedAt: undefined, celex: undefined, label: "v1" }];

	it("joins a differently named file to an existing document", async () => {
		const { seen, run } = capture();
		await importSourceFile({ fileName: "policy-2025.md", bytes: md("# Policy\n\nFirms must keep a register of all contracts."), versionOf: fileSourceId("policy.md") }, run, undefined, existing);
		assert.equal(seen.version!.sourceId, fileSourceId("policy.md"));
		await importSourceFile({ fileName: "policy-2025.md", bytes: md("# Policy\n\nFirms must keep a register of all contracts.") }, run, undefined, existing);
		assert.equal(seen.version!.sourceId, fileSourceId("policy-2025.md"), "without it, a new document");
	});

	it("refuses an unknown document, or one of another format", async () => {
		const { run } = capture();
		const bytes = md("# Policy\n\nFirms must keep a register of all contracts.");
		await assert.rejects(importSourceFile({ fileName: "p.md", bytes, versionOf: "doc_nope" }, run, undefined, existing), /That document was not found\./);
		await assert.rejects(importSourceFile({ fileName: "p.md", bytes, versionOf: DORA }, run, undefined, () => [ver("d", "2022-12-14")]), /That document was not found\./);
	});
});
