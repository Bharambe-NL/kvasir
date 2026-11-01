/**
 * The sources door (Kvasir P2-3, D068 to D075) through the REAL extraction
 * pipeline with faux stages (no real model, no network) and in-memory graph
 * ledgers. "Done when": bad quotes are sent back and fixed within the turn
 * limit.
 */

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { after, describe, it } from "node:test";
import { createFauxCore, fauxAssistantMessage, fauxToolCall, type FauxResponseStep, type ToolCall } from "@earendil-works/pi-ai";

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "kv-source-extraction-"));
process.env.KV_DATA_DIR = TMP;
process.env.KV_AUTH_FILE = path.join(TMP, "auth.json");

const ex = await import("../src/agent/subagents/extraction.ts");
const { createExtractionPipeline, SourceImportError, EXTRACTOR_INSTRUCTIONS, NOTES_EXTRACTOR_INSTRUCTIONS, SOURCES_EXTRACTOR_INSTRUCTIONS, SOURCES_PREAMBLE, SOURCES_CITATION_RULE, EXTRACTION_CORE } = ex;
const { chatStore } = await import("../src/store/chats.ts");
const { mergeFindings } = await import("../src/core/graph.ts");
const { actDateOf, chunkUnits, labelUnits, locateQuote, sourceView, validateCitations } = await import("../src/core/source-extract.ts");
const { contentHashOf, eurlexSourceId, fileSourceId, versionIdFor } = await import("../src/core/source-ids.ts");
const { parseEurlex } = await import("../src/core/source-parse/eurlex.ts");
const { importSourceFile } = await import("../src/server/sources.ts");
const { UnsupportedSourceError } = await import("../src/server/source-loader.ts");
type GraphStore = import("../src/core/ports.ts").GraphStore;
type PiEngine = import("../src/agent/models.ts").PiEngine;
type ParsedSource = import("../src/core/contracts.ts").ParsedSource;
type DocumentVersion = import("../src/core/contracts.ts").DocumentVersion;
type GraphNode = import("../src/core/contracts.ts").GraphNode;

after(() => fs.rmSync(TMP, { recursive: true, force: true }));

const FIX = fileURLToPath(new URL("./fixtures/sources/", import.meta.url));

function memoryLedgers(): GraphStore {
	const nodes: GraphNode[] = [];
	const chains: ReturnType<GraphStore["readChains"]> = [];
	const checkpoints: ReturnType<GraphStore["readCheckpoints"]> = [];
	const coverage: ReturnType<GraphStore["readCoverage"]> = [];
	const sources = new Map<string, ReturnType<GraphStore["readSources"]>[number]>();
	const documents: ReturnType<GraphStore["readDocumentVersions"]> = [];
	const citations: ReturnType<GraphStore["readCitations"]> = [];
	const units = new Map<string, ReturnType<GraphStore["readDocumentUnits"]> & object>();
	return {
		appendNode: (n) => void nodes.push(n), readNodes: () => [...nodes],
		appendChain: (c) => void chains.push(c), readChains: () => [...chains],
		appendCheckpoint: (c) => void checkpoints.push(c), readCheckpoints: () => [...checkpoints],
		appendCoverage: (c) => void coverage.push(c), readCoverage: () => [...coverage],
		appendDocumentVersion: (v) => void documents.push(v), readDocumentVersions: () => [...documents],
		appendCitation: (c) => void citations.push(c), readCitations: () => [...citations],
		writeDocumentUnits: (v, u) => void (units.has(v) || units.set(v, u)), readDocumentUnits: (v) => units.get(v) ?? null,
		upsertSource: (s) => void sources.set(s.id, { ...s, extractions: sources.get(s.id)?.extractions ?? [] }),
		readSources: () => [...sources.values()],
		appendSourceUsage: (id, u) => void sources.get(id)?.extractions?.push(u),
		readPositions: () => ({}), writePositions: () => {},
		rewriteLedgers: (next) => {
			if (next.nodes) nodes.splice(0, nodes.length, ...next.nodes);
			if (next.chains) chains.splice(0, chains.length, ...next.chains);
		},
	};
}

function fauxEngine(steps: FauxResponseStep[]): PiEngine {
	const faux = createFauxCore({});
	faux.setResponses(steps);
	return { model: faux.getModel(), streamFn: faux.streamSimple };
}
const submit = (name: string, input: unknown) =>
	fauxAssistantMessage([fauxToolCall(name, input as ToolCall["arguments"], { id: `${name}-${Math.random()}` })], { stopReason: "toolUse" });
const auditor = (links: { id: string; linkTo: string }[] = []) => fauxEngine([() => submit("submit_review", { links })]);

/** A small EUR-Lex-like document: two cited paragraphs, one with a curly
 *  apostrophe. */
const DOC: ParsedSource = {
	format: "eurlex-html",
	title: "REGULATION (EU) 2022/2554 OF THE EUROPEAN PARLIAMENT AND OF THE COUNCIL of 14 December 2022 on digital operational resilience",
	celex: "32022R2554",
	units: [
		{ path: ["Chapter V"], heading: "Managing of ICT third-party risk", text: "" },
		{ path: ["Chapter V", "Article 28"], heading: "General principles", text: "" },
		{ path: ["Chapter V", "Article 28", "paragraph 1"], text: "Financial entities shall manage ICT third-party risk as an integral component of ICT risk within their ICT risk management framework." },
		{ path: ["Chapter V", "Article 28", "paragraph 2"], text: "The financial entity’s management body shall regularly review the risks identified in respect of contractual arrangements." },
	],
};
const DORA_ID = eurlexSourceId("32022R2554");
const version = (content = "v1"): DocumentVersion => ({
	sourceId: DORA_ID,
	versionId: versionIdFor(DORA_ID, contentHashOf(content)),
	format: "eurlex-html",
	title: DOC.title,
	celex: "32022R2554",
	consolidatedAt: "2022-12-14",
	contentHash: contentHashOf(content),
	filePath: "dora.xhtml",
	importedAt: "2026-11-01T09:00:00.000Z",
});

const GOOD = {
	propositions: [
		{ id: "p1", name: "ICT third-party risk", statement: "Under DORA, financial entities must manage ICT third-party risk as part of ICT risk.", aliases: [], citations: [{ unit: "U1", quote: "shall manage ICT third-party risk as an integral component" }] },
		{ id: "p2", name: "Board review", statement: "Under DORA, a financial entity's management body must regularly review contractual ICT risks.", aliases: [], citations: [{ unit: "U2", quote: "The financial entity's management body shall regularly review" }] },
	],
	chains: [],
};
const BAD = {
	propositions: [
		{ ...GOOD.propositions[0]!, citations: [{ unit: "U1", quote: "manage the risk of ICT providers" }] },
		{ ...GOOD.propositions[1]!, citations: [{ unit: "U2", quote: "management body" }] },
		{ id: "p3", name: "Elsewhere", statement: "Under DORA, something stated elsewhere.", aliases: [], citations: [{ unit: "U9", quote: "words from another stretch here" }] },
	],
	chains: [],
};

describe("the Done-when: bad quotes are sent back and fixed within the turn limit (D070)", () => {
	it("returns every problem in one message, accepts the fix, and stores the document's own quote text", async () => {
		const ledgers = memoryLedgers();
		let seenError = "";
		const extractor = fauxEngine([
			() => submit("submit_findings", BAD),
			(context) => {
				seenError = JSON.stringify(context.messages);
				return submit("submit_findings", GOOD);
			},
		]);
		const pipeline = createExtractionPipeline({ chatStore, graphStore: ledgers, extractor, auditor: auditor() });
		const stats = await pipeline.importSource({ parsed: DOC, version: version() });
		assert.deepEqual(stats, { nodes: 2, chains: 0 });

		assert.match(seenError, /p1: quote not found in U1: \\"manage the risk of ICT providers\\"/);
		assert.match(seenError, /p2: the quote from U2 has fewer than 4 words: \\"management body\\"/);
		assert.match(seenError, /p3: \\"U9\\" is not a unit label in this stretch/);

		const nodes = ledgers.readNodes();
		const cites = ledgers.readCitations();
		assert.equal(cites.length, 2);
		const byNode = new Map(cites.map((c) => [nodes.find((n) => n.id === c.nodeId)!.name, c]));
		assert.deepEqual(byNode.get("ICT third-party risk")!.path, ["Chapter V", "Article 28", "paragraph 1"]);
		assert.equal(byNode.get("Board review")!.quote, "The financial entity’s management body shall regularly review", "the source's curly apostrophe, not the model's");
		for (const c of cites) {
			assert.equal(c.sourceId, DORA_ID);
			assert.equal(c.version, version().versionId);
			assert.match(c.id, /^cit_[0-9a-f]{12}$/);
		}
		assert.deepEqual(ledgers.readDocumentVersions(), [version()], "the version line is written once every chunk merged");
		assert.equal(ledgers.readSources()[0]!.filePath, DOC.title, "the document's cluster label");
		for (const n of nodes) assert.equal(n.provenance[0]!.chatId, DORA_ID, "a document is a birth session");
	});

	it("fails honestly when the turns run out: nothing merged, no version line, and a retry is allowed", async () => {
		const ledgers = memoryLedgers();
		const always = fauxEngine([0, 1, 2, 3].map(() => () => submit("submit_findings", BAD)));
		await assert.rejects(
			createExtractionPipeline({ chatStore, graphStore: ledgers, extractor: always, auditor: auditor() }).importSource({ parsed: DOC, version: version() }),
			(err: unknown) => err instanceof SourceImportError && err.outcome === "failed",
		);
		assert.equal(ledgers.readNodes().length, 0);
		assert.equal(ledgers.readCitations().length, 0);
		assert.equal(ledgers.readDocumentVersions().length, 0);
		const ok = createExtractionPipeline({ chatStore, graphStore: ledgers, extractor: fauxEngine([() => submit("submit_findings", GOOD)]), auditor: auditor() });
		assert.deepEqual(await ok.importSource({ parsed: DOC, version: version() }), { nodes: 2, chains: 0 });
	});
});

describe("merging citations", () => {
	it("a proposition the auditor links puts its citation on the existing node", async () => {
		const ledgers = memoryLedgers();
		ledgers.appendNode({ id: "n_existing", name: "Third-party risk", statement: "ICT third-party risk is part of ICT risk.", aliases: [], createdAt: "2026-10-01T00:00:00.000Z", provenance: [{ chatId: "c1", messageId: "" }] });
		const pipeline = createExtractionPipeline({ chatStore, graphStore: ledgers, extractor: fauxEngine([() => submit("submit_findings", GOOD)]), auditor: auditor([{ id: "p1", linkTo: "n_existing" }]) });
		assert.deepEqual(await pipeline.importSource({ parsed: DOC, version: version("linked") }), { nodes: 1, chains: 0 });
		const cite = ledgers.readCitations().find((c) => c.path.at(-1) === "paragraph 1")!;
		assert.equal(cite.nodeId, "n_existing");
	});

	it("refuses a merge with an uncited proposition before writing anything (gate check 3)", () => {
		const ledgers = memoryLedgers();
		const units = chunkUnits(labelUnits(DOC.units), 10_000)[0]!.citable;
		const findings = { propositions: [{ id: "p1", name: "x", statement: "y", aliases: [] }], chains: [] };
		assert.throws(
			() => mergeFindings(DORA_ID, findings, { links: [] }, { chatStore, graphStore: ledgers }, { foldedAt: "t", citations: { sourceId: DORA_ID, version: "ver_x", units } }),
			/proposition p1 has no valid citation/,
		);
		assert.equal(ledgers.readNodes().length, 0);
		assert.equal(ledgers.readCitations().length, 0);
	});

	it("every node the sources door creates has at least one citation", async () => {
		const ledgers = memoryLedgers();
		await createExtractionPipeline({ chatStore, graphStore: ledgers, extractor: fauxEngine([() => submit("submit_findings", GOOD)]), auditor: auditor() }).importSource({ parsed: DOC, version: version("all") });
		const cited = new Set(ledgers.readCitations().map((c) => c.nodeId));
		for (const n of ledgers.readNodes()) assert.ok(cited.has(n.id), `${n.name} is cited`);
	});
});

describe("refusals (D073)", () => {
	it("refuses a version that is already imported, with the exact message, and runs no model", async () => {
		const ledgers = memoryLedgers();
		ledgers.appendDocumentVersion(version());
		let calls = 0;
		const pipeline = createExtractionPipeline({ chatStore, graphStore: ledgers, extractor: fauxEngine([() => (calls++, submit("submit_findings", GOOD))]), auditor: auditor() });
		await assert.rejects(pipeline.importSource({ parsed: DOC, version: version() }), (err: unknown) => {
			assert.ok(err instanceof SourceImportError);
			assert.equal(err.outcome, "duplicate");
			assert.equal(err.message, `This version of ${DOC.title} is already imported.`);
			return true;
		});
		assert.equal(calls, 0);
	});
});

describe("the second chunk reads the graph so far", () => {
	it("chunks run in order and later chunks see earlier merges by id", async () => {
		const ledgers = memoryLedgers();
		const prompts: string[] = [];
		const step = (n: number): FauxResponseStep => (context) => {
			prompts.push(JSON.stringify(context.messages));
			return submit("submit_findings", { propositions: [GOOD.propositions[n - 1]!].map((p) => ({ ...p, citations: [{ unit: `U${n}`, quote: p.citations[0]!.quote }] })), chains: [] });
		};
		const pipeline = createExtractionPipeline({ chatStore, graphStore: ledgers, getChunkTokens: () => 40, extractor: fauxEngine([step(1), step(2)]), auditor: fauxEngine([() => submit("submit_review", { links: [] }), () => submit("submit_review", { links: [] })]) });
		assert.deepEqual(await pipeline.importSource({ parsed: DOC, version: version("chunks") }), { nodes: 2, chains: 0 });
		assert.equal(prompts.length, 2);
		assert.match(prompts[0]!, /\(part 1\/2\)/);
		// The digest header (the shared system prompt also names THE GRAPH SO FAR).
		const digest = /THE GRAPH SO FAR \u2014 everything already extracted from this source/;
		assert.doesNotMatch(prompts[0]!, digest);
		assert.match(prompts[1]!, digest);
		assert.match(prompts[1]!, /ICT third-party risk/);
	});
});

describe("chunking and the view (D068)", () => {
	const dora = parseEurlex(fs.readFileSync(path.join(FIX, "dora.xhtml"), "utf8"));
	it("labels every unit with text once, in order, the same in every chunk", () => {
		const labelled = labelUnits(dora.units);
		const chunks = chunkUnits(labelled, 4000);
		const labels = chunks.flatMap((c) => [...c.citable.keys()]);
		const expected = labelled.filter((l) => l.label).map((l) => l.label);
		assert.deepEqual(labels, expected, "every label in exactly one chunk, in document order");
		assert.equal(expected[0], "U1");
		assert.equal(chunks.flatMap((c) => c.units).length, dora.units.length, "no unit lost or split");
	});

	it("keeps an article in one chunk when it fits the budget", () => {
		const chunks = chunkUnits(labelUnits(dora.units), 4000);
		const where = new Map<string, Set<number>>();
		chunks.forEach((c, i) => c.units.forEach(({ unit }) => {
			const a = unit.path.findIndex((p) => p.startsWith("Article "));
			if (a < 0) return;
			const key = unit.path.slice(0, a + 1).join(" > ");
			where.set(key, (where.get(key) ?? new Set()).add(i));
		}));
		const a28 = [...where].find(([k]) => k.endsWith("Article 28"))!;
		assert.equal(a28[1].size, 1, "Article 28 sits in one chunk");
		const split = [...where].filter(([, s]) => s.size > 1).map(([k]) => k);
		assert.ok(split.length < 5, `only oversized articles split: ${split.join("; ")}`);
	});

	it("renders containers as context lines and units with their labels", () => {
		const chunk = chunkUnits(labelUnits(DOC.units), 10_000)[0]!;
		assert.equal(
			sourceView(DOC, "2022-12-14", chunk),
			[
				`SOURCE (a document): ${DOC.title}, version 2022-12-14`,
				"",
				"Chapter V: Managing of ICT third-party risk",
				"Chapter V > Article 28: General principles",
				"[U1] Chapter V > Article 28 > paragraph 1",
				DOC.units[2]!.text,
				"[U2] Chapter V > Article 28 > paragraph 2",
				DOC.units[3]!.text,
			].join("\n"),
		);
	});
});

describe("the quote check (D070)", () => {
	const units = new Map([["U1", DOC.units[3]!]]);
	it("folds whitespace, quotes and dashes, and keeps the source's text", () => {
		assert.equal(locateQuote("a  “quoted”\nword — here and there", 'a "quoted" word - here'), "a “quoted” word — here");
		assert.equal(locateQuote("The entity’s body", "The entity's body"), "The entity’s body");
		assert.equal(locateQuote("Case Matters here now", "case matters here now"), null, "case-sensitive");
	});
	it("accepts good citations and lists every problem otherwise", () => {
		assert.equal(validateCitations([{ id: "p1", citations: [{ unit: "U1", quote: "management body shall regularly review" }] }], units), null);
		assert.equal(
			validateCitations([{ id: "p1" }, { id: "p2", citations: [{ unit: "U1", quote: "shall regularly" }] }], units),
			"citations:\np1: no citation. Give at least one unit label and a quote from it.\np2: the quote from U1 has fewer than 4 words: \"shall regularly\"",
		);
	});
	it("reads an act's date from its title (D072)", () => {
		assert.equal(actDateOf(DOC.title), "2022-12-14");
		assert.equal(actDateOf("DIRECTIVE (EU) 2015/2366 OF THE EUROPEAN PARLIAMENT AND OF THE COUNCIL of 25 November 2015 on payment services"), "2015-11-25");
		assert.equal(actDateOf("EBA Guidelines"), null);
	});
});

describe("importSourceFile identifies the version (D060, D072, D074)", () => {
	const capture = () => {
		const seen: { version?: DocumentVersion; parsed?: ParsedSource } = {};
		return { seen, run: async (input: { version: DocumentVersion; parsed: ParsedSource }) => (Object.assign(seen, input), { nodes: 0, chains: 0 }) };
	};
	it("EUR-Lex: CELEX id and the act's date", async () => {
		const bytes = new Uint8Array(fs.readFileSync(path.join(FIX, "dora.xhtml")));
		const { seen, run } = capture();
		await importSourceFile({ fileName: "dora.xhtml", bytes, label: "ignored" }, run, () => "2026-11-01T09:00:00.000Z");
		assert.equal(seen.version!.sourceId, DORA_ID);
		assert.equal(seen.version!.consolidatedAt, "2022-12-14");
		assert.equal(seen.version!.celex, "32022R2554");
		assert.equal(seen.version!.label, undefined);
		assert.equal(seen.version!.versionId, versionIdFor(DORA_ID, createHash("sha256").update(bytes).digest("hex")));
	});
	it("Markdown: file id and the given label, defaulting to the file name", async () => {
		const bytes = new TextEncoder().encode("# Policy\n\nFirms must keep a register of contracts.");
		const { seen, run } = capture();
		await importSourceFile({ fileName: "policy.md", bytes, label: "  v2 final " }, run);
		assert.equal(seen.version!.sourceId, fileSourceId("policy.md"));
		assert.equal(seen.version!.label, "v2 final");
		await importSourceFile({ fileName: "policy.md", bytes }, run);
		assert.equal(seen.version!.label, "policy.md");
	});
	it("refuses plain HTML and an empty document", async () => {
		const run = async () => ({ nodes: 0, chains: 0 });
		await assert.rejects(importSourceFile({ fileName: "page.html", bytes: new TextEncoder().encode("<p>hi</p>") }, run), UnsupportedSourceError);
		await assert.rejects(importSourceFile({ fileName: "empty.md", bytes: new TextEncoder().encode("# Only a heading") }, run), /no text could be read/);
	});
});

describe("the session and notes doors are unchanged", () => {
	const sha = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 16);
	it("their prompts are byte-identical to before P2-3, and the sources prompt is the approved text", () => {
		assert.deepEqual({ session: sha(EXTRACTOR_INSTRUCTIONS), notes: sha(NOTES_EXTRACTOR_INSTRUCTIONS) }, PINNED);
		assert.equal(SOURCES_EXTRACTOR_INSTRUCTIONS, `${SOURCES_PREAMBLE}\n\n${EXTRACTION_CORE}\n\n${SOURCES_CITATION_RULE}`);
		assert.match(SOURCES_CITATION_RULE, /^Every new proposition cites the text it comes from\. .* so the statement stands alone\.$/);
	});
});
// sha256 prefixes of the prompts on main before P2-3 (a8bddd7d…, 790b1633…).
const PINNED = { session: "a8bddd7d47130ed5", notes: "790b16339ea386c2" };
