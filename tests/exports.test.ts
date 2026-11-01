/**
 * Graph exports (Kvasir P6-3, D100 to D105) over a temp copy of the golden
 * data with DORA citations seeded: the Obsidian vault (every link resolves,
 * clashing names get suffixes, chains and sources in the notes), the Anki
 * text file (headers, one row per proposition outside excluded sessions,
 * escaping), the dated folders that never overwrite, the route, the Show in
 * Finder guard, and that nothing in the data folder changes. No network.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { after, describe, it } from "node:test";

const GOLDEN = fileURLToPath(new URL("./fixtures/golden-data", import.meta.url));
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "kv-exports-"));
const DATA = path.join(TMP, "data");
const OUT = path.join(TMP, "exports");
fs.cpSync(GOLDEN, DATA, { recursive: true });
process.env.KV_DATA_DIR = DATA;
process.env.KV_EXPORT_DIR = OUT;

const { stores } = await import("../src/server/stores.ts");
const { exportGraph, exportStamp, insideExportRoot } = await import("../src/server/exports.ts");
const { POST } = await import("../app/api/graph/export/route.ts");
const { ankiDeck, ankiTag, noteName, noteNames, obsidianVault } = await import("../src/core/exports.ts");
const { getGraph } = await import("../src/core/graph.ts");
const { birthSessionOf } = await import("../src/core/session-clusters.ts");
const { revealTarget } = createRequire(import.meta.url)("../electron/export-reveal.cjs") as { revealTarget: (p: unknown, root?: string) => string | null };

after(() => fs.rmSync(TMP, { recursive: true, force: true }));

const g = stores.graphStore;
const graph = getGraph(g);
const V1 = "ver_dfa4295bb03c";
g.appendDocumentVersion({ sourceId: "doc_dora00000000", versionId: V1, format: "eurlex-html", title: "REGULATION (EU) 2022/2554 OF THE EUROPEAN PARLIAMENT AND OF THE COUNCIL of 14 December 2022", celex: "32022R2554", consolidatedAt: "2022-12-14", contentHash: "a".repeat(64), filePath: "dora.xhtml", importedAt: "2026-11-01T09:00:00.000Z" });
const CITED = graph.nodes[0]!;
g.appendCitation({ id: "cit_000000000001", nodeId: CITED.id, sourceId: "doc_dora00000000", version: V1, path: ["Chapter V", "Section I", "Article 28", "paragraph 2"], quote: "shall adopt, and regularly review, a strategy", createdAt: "2026-11-01T09:00:00.000Z" });

const snapshot = (dir: string) => {
	const out: Record<string, string> = {};
	const walk = (d: string) => {
		for (const e of fs.readdirSync(d, { withFileTypes: true })) {
			const p = path.join(d, e.name);
			if (e.isDirectory()) walk(p);
			else out[path.relative(dir, p)] = fs.readFileSync(p, "utf8");
		}
	};
	if (fs.existsSync(dir)) walk(dir);
	return out;
};
const before = { graph: snapshot(path.join(DATA, "graph")), learner: snapshot(path.join(DATA, "learner")) };

const input = () => {
	const sessionNames = new Map<string, string>([...stores.chatStore.listChats().map((c) => [c.id, c.title] as [string, string]), ...g.readSources().map((s) => [s.id, s.filePath] as [string, string])]);
	return { nodes: graph.nodes, chains: graph.chains, citations: g.readCitations(), versions: g.readDocumentVersions(), sessionNames };
};

describe("note names (D103)", () => {
	it("are safe for files and wiki links", () => {
		assert.equal(noteName('A/B: "c" [d] #e ^f | g?'), "A B c d e f g");
		assert.equal(noteName("...hidden"), "hidden");
		assert.equal(noteName("  "), "Untitled");
		assert.equal(noteName("x".repeat(200)).length, 120);
	});
	it("give every clashing name a short id suffix, ignoring case", () => {
		const names = noteNames([{ id: "n_abcdef123", name: "Strategy" }, { id: "n_zyxwvu987", name: "strategy" }, { id: "n_q1", name: "Other" }]);
		assert.deepEqual([...names.values()], ["Strategy (abcdef)", "strategy (zyxwvu)", "Other"]);
		assert.equal(noteNames([{ id: "n_ix1234", name: "Index" }]).get("n_ix1234"), "Index (ix1234)", "the vault's index note keeps its name");
	});
});

describe("the Obsidian vault (D103, D104)", () => {
	const files = obsidianVault(input());
	const notes = files.filter((f) => f.path !== "index.md");
	const byPath = new Map(files.map((f) => [f.path, f.text]));
	it("has one note per proposition, every proposition, plus the index", () => {
		assert.equal(notes.length, graph.nodes.length);
		assert.equal(new Set(files.map((f) => f.path.toLowerCase())).size, files.length, "no two files differ only in case");
		assert.ok(byPath.has("index.md"));
	});
	it("every [[link]] resolves to a note", () => {
		const names = new Set(files.map((f) => f.path.replace(/\.md$/, "")));
		const links = files.flatMap((f) => [...f.text.matchAll(/\[\[([^\]]+)\]\]/g)].map((m) => m[1]!));
		assert.ok(links.length > graph.nodes.length, "the index and the chains link");
		assert.deepEqual(links.filter((l) => !names.has(l)), []);
	});
	it("a note has frontmatter, the statement, Because, Leads to and Sources from the ledgers", () => {
		const names = noteNames(graph.nodes);
		const chain = graph.chains.find((c) => c.premises.length > 1)!;
		const text = byPath.get(`${names.get(chain.conclusion)}.md`)!;
		const node = graph.nodes.find((n) => n.id === chain.conclusion)!;
		assert.match(text, new RegExp(`^---\\nkvasir-id: "${node.id}"\\n`));
		assert.ok(text.includes(`\n# ${node.name}\n\n${node.statement}\n`));
		assert.ok(text.includes(`## Because\n\n`));
		assert.ok(text.includes(`- ${[...chain.premises].sort().map((p) => `[[${names.get(p)}]]`).join(" + ")}`));
		const premiseNote = byPath.get(`${names.get(chain.premises[0]!)}.md`)!;
		assert.ok(premiseNote.includes(`## Leads to\n\n`) && premiseNote.includes(`- [[${names.get(chain.conclusion)}]]`));
		const cited = byPath.get(`${names.get(CITED.id)}.md`)!;
		assert.ok(cited.includes('## Sources\n\n- Regulation (EU) 2022/2554, Art. 28(2): "shall adopt, and regularly review, a strategy"'));
	});
	it("frontmatter values are valid quoted strings", () => {
		for (const f of notes) {
			const front = f.text.split("\n---\n")[0]!.split("\n").slice(1);
			for (const line of front) {
				const value = line.startsWith("  - ") ? line.slice(4) : line.slice(line.indexOf(": ") + 2);
				if (line === "aliases:") continue;
				assert.doesNotThrow(() => JSON.parse(value), `${f.path}: ${line}`);
			}
		}
	});
});

describe("the Anki file (D101, D102, D104)", () => {
	const excludedSession = birthSessionOf(graph.nodes[0]!)!;
	const inExcluded = graph.nodes.filter((n) => birthSessionOf(n) === excludedSession).length;
	const deck = ankiDeck(input(), new Set([excludedSession]));
	const lines = deck.text.trimEnd().split("\n");
	it("starts with the header lines Anki reads", () => {
		assert.deepEqual(lines.slice(0, 6), ["#separator:tab", "#html:true", "#notetype:Basic", "#deck:Kvasir", "#guid column:1", "#tags column:4"]);
	});
	it("has one row per proposition outside excluded sessions, four columns, the id as guid", () => {
		const rows = lines.slice(6);
		assert.equal(rows.length, graph.nodes.length - inExcluded);
		assert.equal(deck.notes, rows.length);
		assert.ok(inExcluded > 0);
		for (const r of rows) assert.equal(r.split("\t").length, 4, r.slice(0, 60));
		const ids = new Set(rows.map((r) => r.split("\t")[0]));
		assert.ok(graph.nodes.filter((n) => birthSessionOf(n) !== excludedSession).every((n) => ids.has(n.id)));
	});
	it("escapes HTML, tabs and newlines; tags have no spaces", () => {
		const one = ankiDeck({ ...input(), nodes: [{ ...graph.nodes[1]!, name: "A <b> & \"c\"", statement: "line one\nline\ttwo" }], chains: [] }, new Set());
		const [, front, back, tag] = one.text.trimEnd().split("\n")[6]!.split("\t");
		assert.equal(front, "A &lt;b&gt; &amp; &quot;c&quot;");
		assert.equal(back, "line one<br>line two");
		assert.doesNotMatch(tag!, /\s/);
		assert.equal(ankiTag("My session: DORA  art 28"), "kvasir::My_session:_DORA_art_28");
	});
});

describe("writing exports (D105)", () => {
	const now = new Date(2026, 10, 1, 10, 30);
	it("writes a dated folder and never overwrites", () => {
		const first = exportGraph("obsidian", now);
		const second = exportGraph("anki", now);
		assert.equal(path.basename(first.path), "2026-11-01 1030");
		assert.equal(path.basename(second.path), "2026-11-01 1030 2");
		assert.equal(exportStamp(now), "2026-11-01 1030");
		assert.equal(fs.readdirSync(path.join(first.path, "Kvasir vault")).length, graph.nodes.length + 1);
		assert.ok(fs.readFileSync(path.join(second.path, "kvasir-anki.txt"), "utf8").startsWith("#separator:tab\n"));
		assert.equal(first.propositions, graph.nodes.length);
	});
	it("the route checks the kind and returns the folder", async () => {
		const bad = await POST(new Request("http://x/api/graph/export", { method: "POST", body: JSON.stringify({ kind: "pdf" }) }));
		assert.equal(bad.status, 400);
		const res = await POST(new Request("http://x/api/graph/export", { method: "POST", body: JSON.stringify({ kind: "anki" }) }));
		assert.equal(res.status, 200);
		const body = await res.json();
		assert.ok(insideExportRoot(body.path));
		assert.ok(fs.existsSync(path.join(body.path, "kvasir-anki.txt")));
		assert.equal(typeof body.display, "string");
	});
	it("Show in Finder reveals only existing paths inside the export root", () => {
		const inside = fs.readdirSync(OUT).map((d) => path.join(OUT, d))[0]!;
		assert.equal(revealTarget(inside, OUT), fs.realpathSync(inside));
		for (const p of [OUT, DATA, path.join(OUT, "missing"), path.join(OUT, "..", "data"), "", 42]) assert.equal(revealTarget(p, OUT), null, String(p));
		assert.equal(insideExportRoot(DATA), false);
	});
	it("the data folder is unchanged", () => {
		assert.deepEqual(snapshot(path.join(DATA, "graph")), before.graph);
		assert.deepEqual(snapshot(path.join(DATA, "learner")), before.learner);
	});
});
