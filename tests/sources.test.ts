/**
 * Source contracts and ledgers (Kvasir P2-1, D058 to D063): the guards, the
 * pure helpers, the deterministic ids, and the two graph-store ledgers over
 * a temp copy of the golden data. No network, no model.
 */

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { after, describe, it } from "node:test";

const GOLDEN = fileURLToPath(new URL("./fixtures/golden-data", import.meta.url));
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "kv-sources-"));
fs.cpSync(GOLDEN, TMP, { recursive: true });
process.env.KV_DATA_DIR = TMP;
process.env.KV_AUTH_FILE = path.join(TMP, "auth.json");

const { graphStore } = await import("../src/store/graph.ts");
const { LEDGER_FILES, PATHS, GRAPH_FORMAT_FILE } = await import("../config.ts");
const { CURRENT_GRAPH_FORMAT_VERSION, isCitation, isDocumentVersion } = await import("../src/core/contracts.ts");
const { citationsFor, sourceDocuments, versionLabel } = await import("../src/core/sources.ts");
const { contentHashOf, eurlexSourceId, fileSourceId, versionIdFor } = await import("../src/core/source-ids.ts");
type DocumentVersion = import("../src/core/contracts.ts").DocumentVersion;
type Citation = import("../src/core/contracts.ts").Citation;

after(() => {
	fs.rmSync(TMP, { recursive: true, force: true });
});

const DORA = eurlexSourceId("32022R2554");
const doraV = (consolidatedAt: string, importedAt: string, content: string): DocumentVersion => ({
	sourceId: DORA,
	versionId: versionIdFor(DORA, contentHashOf(content)),
	format: "eurlex-html",
	title: "Regulation (EU) 2022/2554 (DORA)",
	celex: "32022R2554",
	consolidatedAt,
	contentHash: contentHashOf(content),
	filePath: "/Users/sagar/Downloads/dora.html",
	importedAt,
});
const GL = fileSourceId("/Users/sagar/Downloads/eba-gl-2019-04.pdf");
const glV = (label: string, importedAt: string, content: string): DocumentVersion => ({
	sourceId: GL,
	versionId: versionIdFor(GL, contentHashOf(content)),
	format: "pdf",
	title: "EBA Guidelines on ICT and security risk management",
	label,
	contentHash: contentHashOf(content),
	filePath: "/Users/sagar/Downloads/eba-gl-2019-04.pdf",
	importedAt,
});
const cite = (id: string, nodeId: string, version: string): Citation => ({
	id,
	nodeId,
	sourceId: DORA,
	version,
	path: ["Article 28", "paragraph 2", "point (a)"],
	quote: "financial entities shall manage ICT third-party risk",
	createdAt: "2026-11-01T09:00:00.000Z",
});

function hashes(dir: string): Record<string, string> {
	const out: Record<string, string> = {};
	for (const name of fs.readdirSync(dir).sort()) {
		const full = path.join(dir, name);
		if (fs.statSync(full).isFile()) out[name] = createHash("sha256").update(fs.readFileSync(full)).digest("hex");
	}
	return out;
}

describe("deterministic ids (D060)", () => {
	it("EUR-Lex ids follow the CELEX number, other ids the path, version ids the content", () => {
		assert.match(DORA, /^doc_[0-9a-f]{12}$/);
		assert.equal(eurlexSourceId(" 32022r2554 "), DORA, "trimmed and case-insensitive");
		assert.notEqual(eurlexSourceId("32015L2366"), DORA);
		assert.match(GL, /^doc_[0-9a-f]{12}$/);
		assert.notEqual(fileSourceId("/a.pdf"), fileSourceId("/b.pdf"));
		assert.notEqual(fileSourceId("32022R2554"), eurlexSourceId("32022R2554"), "the two kinds never collide");
		assert.equal(versionIdFor(DORA, contentHashOf("x")), versionIdFor(DORA, contentHashOf("x")));
		assert.notEqual(versionIdFor(DORA, contentHashOf("x")), versionIdFor(DORA, contentHashOf("y")));
		assert.notEqual(versionIdFor(DORA, contentHashOf("x")), versionIdFor(GL, contentHashOf("x")));
		assert.match(contentHashOf("x"), /^[0-9a-f]{64}$/);
	});
});

describe("guards (D058 to D060)", () => {
	it("accept the samples", () => {
		assert.equal(isDocumentVersion(doraV("2023-01-16", "2026-11-01T09:00:00.000Z", "a")), true);
		assert.equal(isDocumentVersion(glV("final", "2026-11-01T09:00:00.000Z", "b")), true);
		assert.equal(isDocumentVersion({ ...glV("draft", "2026-11-01T09:00:00.000Z", "c"), format: "markdown" }), true);
		assert.equal(isCitation(cite("cit_1", "n_1", "ver_1")), true);
	});

	it("reject each malformed field", () => {
		const d = doraV("2023-01-16", "2026-11-01T09:00:00.000Z", "a");
		const g = glV("final", "2026-11-01T09:00:00.000Z", "b");
		const badVersions: unknown[] = [
			null, [], {},
			{ ...d, sourceId: "src_1" },
			{ ...d, versionId: "v1" },
			{ ...d, format: "docx" },
			{ ...d, title: " " },
			{ ...d, contentHash: "abc" },
			{ ...d, filePath: "" },
			{ ...d, importedAt: "yesterday" },
			{ ...d, celex: undefined },
			{ ...d, consolidatedAt: "16 January 2023" },
			{ ...g, label: undefined },
			{ ...g, label: "" },
		];
		for (const bad of badVersions) assert.equal(isDocumentVersion(bad), false, JSON.stringify(bad));
		const c = cite("cit_1", "n_1", "ver_1");
		const badCitations: unknown[] = [
			null, {},
			{ ...c, id: "" },
			{ ...c, nodeId: undefined },
			{ ...c, sourceId: " " },
			{ ...c, version: "" },
			{ ...c, path: [] },
			{ ...c, path: ["Article 28", ""] },
			{ ...c, path: "Article 28" },
			{ ...c, quote: "" },
			{ ...c, createdAt: "now" },
		];
		for (const bad of badCitations) assert.equal(isCitation(bad), false, JSON.stringify(bad));
	});
});

describe("sourceDocuments, citationsFor, versionLabel", () => {
	it("groups versions by document and orders them (EUR-Lex by date, others by import time)", () => {
		const d2024 = doraV("2024-06-01", "2026-10-01T09:00:00.000Z", "dora 2024");
		const d2023 = doraV("2023-01-16", "2026-10-02T09:00:00.000Z", "dora 2023");
		const gFinal = glV("final", "2026-09-01T09:00:00.000Z", "gl final");
		const gDraft = glV("draft", "2026-08-01T09:00:00.000Z", "gl draft");
		const docs = sourceDocuments([d2024, gFinal, d2023, gDraft, { ...d2024, importedAt: "2026-10-05T09:00:00.000Z" }]);
		assert.deepEqual(docs.map((d) => d.id), [GL, DORA], "oldest first by first version");
		const dora = docs.find((d) => d.id === DORA)!;
		assert.deepEqual(dora.versions.map((v) => v.consolidatedAt), ["2023-01-16", "2024-06-01"], "by consolidation date, not import order");
		assert.equal(dora.versions.length, 2, "a repeated versionId counts once");
		assert.equal(dora.celex, "32022R2554");
		assert.equal(dora.format, "eurlex-html");
		const gl = docs.find((d) => d.id === GL)!;
		assert.deepEqual(gl.versions.map((v) => v.label), ["draft", "final"]);
		assert.equal(gl.celex, undefined);
		assert.deepEqual(sourceDocuments([]), []);
	});

	it("finds a node's citations, a repeated id counted once", () => {
		const all = [cite("cit_1", "n_1", "ver_a"), cite("cit_2", "n_2", "ver_a"), cite("cit_1", "n_1", "ver_a"), cite("cit_3", "n_1", "ver_b")];
		assert.deepEqual(citationsFor("n_1", all).map((c) => c.id), ["cit_1", "cit_3"]);
		assert.deepEqual(citationsFor("n_gone", all), []);
	});

	it("names a version by its consolidation date or its label", () => {
		assert.equal(versionLabel(doraV("2023-01-16", "2026-11-01T09:00:00.000Z", "a")), "2023-01-16");
		assert.equal(versionLabel(glV("final", "2026-11-01T09:00:00.000Z", "b")), "final");
	});
});

describe("the documents and citations ledgers (D063)", () => {
	it("the golden copy has none, and both files live in data/graph/", () => {
		assert.deepEqual(graphStore.readDocumentVersions(), []);
		assert.deepEqual(graphStore.readCitations(), []);
		assert.equal(path.dirname(LEDGER_FILES.documents), PATHS.graph);
		assert.equal(path.dirname(LEDGER_FILES.citations), PATHS.graph);
	});

	it("round-trips appends in order, skips bad lines, and leaves every other ledger byte-identical", () => {
		const before = hashes(PATHS.graph);
		const a = doraV("2023-01-16", "2026-11-01T09:00:00.000Z", "a");
		const b = glV("final", "2026-11-01T09:01:00.000Z", "b");
		graphStore.appendDocumentVersion(a);
		fs.appendFileSync(LEDGER_FILES.documents, '{"sourceId":"doc_torn",\n');
		fs.appendFileSync(LEDGER_FILES.documents, `${JSON.stringify({ ...a, format: "docx" })}\n`);
		graphStore.appendDocumentVersion(b);
		assert.deepEqual(graphStore.readDocumentVersions(), [a, b]);

		const c1 = cite("cit_1", "n_1", a.versionId);
		const c2 = cite("cit_2", "n_2", a.versionId);
		graphStore.appendCitation(c1);
		fs.appendFileSync(LEDGER_FILES.citations, `${JSON.stringify({ ...c1, id: "cit_bad", quote: "" })}\n`);
		graphStore.appendCitation(c2);
		assert.deepEqual(graphStore.readCitations(), [c1, c2]);

		const after = hashes(PATHS.graph);
		for (const name of Object.keys(before)) {
			if (name === "format.json") continue;
			assert.equal(after[name], before[name], `${name} unchanged`);
		}
		assert.deepEqual(
			Object.keys(after).filter((n) => !(n in before)).sort(),
			["citations.jsonl", "documents.jsonl", ...(before["format.json"] ? [] : ["format.json"])].sort(),
		);
	});

	it("writes stamp the graph format, and a newer stamp refuses reads (honest refusal)", () => {
		const stamp = JSON.parse(fs.readFileSync(GRAPH_FORMAT_FILE, "utf8")) as { version: number };
		assert.equal(stamp.version, CURRENT_GRAPH_FORMAT_VERSION, "no format bump: the ledgers are additive");
		const saved = fs.readFileSync(GRAPH_FORMAT_FILE, "utf8");
		fs.writeFileSync(GRAPH_FORMAT_FILE, JSON.stringify({ version: CURRENT_GRAPH_FORMAT_VERSION + 1 }));
		try {
			assert.throws(() => graphStore.readDocumentVersions());
			assert.throws(() => graphStore.readCitations());
		} finally {
			fs.writeFileSync(GRAPH_FORMAT_FILE, saved);
		}
	});
});
