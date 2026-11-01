/**
 * Teacher citations (Kvasir P2-6, D084 to D087) over a temp copy of the
 * golden data with the real DORA units seeded: the `#src-` link form,
 * read_source, the source-unit route, the session context's source lines,
 * the teacher-only registration, the prompt section, and the Done-when run
 * with a faux teacher. No real model, no network.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { after, describe, it } from "node:test";
import { createFauxCore, fauxAssistantMessage, fauxToolCall, type FauxResponseStep, type ToolCall } from "@earendil-works/pi-ai";

const GOLDEN = fileURLToPath(new URL("./fixtures/golden-data", import.meta.url));
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "kv-source-cite-"));
fs.cpSync(GOLDEN, TMP, { recursive: true });
process.env.KV_DATA_DIR = TMP;
process.env.KV_AUTH_FILE = path.join(TMP, "auth.json");

const { stores } = await import("../src/server/stores.ts");
const { GET } = await import("../app/api/graph/source-unit/route.ts");
const { citationSourceLines } = await import("../src/server/source-cite.ts");
const { parseSourceRef, sourceHref, sourceLink } = await import("../src/core/source-cite.ts");
const { readSource, sourceTools, READ_SOURCE_LIMIT } = await import("../src/agent/tools/sources.ts");
const { createProberTools, createTeacherTools } = await import("../src/agent/tools.ts");
const { createTeacherAgent, composeInstructions } = await import("../src/agent/teacher-agent.ts");
const { newGraphContextMessage } = await import("../src/core/native-messages.ts");
const { parseEurlex } = await import("../src/core/source-parse/eurlex.ts");
const { contentHashOf, eurlexSourceId, versionIdFor } = await import("../src/core/source-ids.ts");
type PiEngine = import("../src/agent/models.ts").PiEngine;
type JobStore = import("../src/core/ports.ts").JobStore;

after(() => fs.rmSync(TMP, { recursive: true, force: true }));

const g = stores.graphStore;
const BYTES = fs.readFileSync(fileURLToPath(new URL("./fixtures/sources/dora.xhtml", import.meta.url)));
const PARSED = parseEurlex(BYTES.toString("utf8"));
const DORA = eurlexSourceId("32022R2554");
const V1 = versionIdFor(DORA, contentHashOf(BYTES));
g.writeDocumentUnits(V1, PARSED.units);
g.appendDocumentVersion({ sourceId: DORA, versionId: V1, format: "eurlex-html", title: PARSED.title, celex: "32022R2554", consolidatedAt: "2022-12-14", contentHash: contentHashOf(BYTES), filePath: "dora.xhtml", importedAt: "2026-11-01T09:00:00.000Z" });
const P28_2 = ["Chapter V", "Section I", "Article 28", "paragraph 2"];
const NODE = g.readNodes()[0]!.id;
g.appendCitation({ id: "cit_000000000001", nodeId: NODE, sourceId: DORA, version: V1, path: P28_2, quote: "shall adopt, and regularly review, a strategy", createdAt: "2026-11-01T09:00:00.000Z" });
const ctx = { readDocumentVersions: () => g.readDocumentVersions(), readDocumentUnits: (v: string) => g.readDocumentUnits(v) };
const LINK_28_2 = /\[Regulation \(EU\) 2022\/2554, Art\. 28\(2\)\]\(#src-ver_[0-9a-f]{12}-U(\d+)\)/;

describe("the link form (D084)", () => {
	it("formats and parses #src- links, and nothing else", () => {
		assert.equal(sourceHref("ver_dfa4295bb03c", "U412"), "#src-ver_dfa4295bb03c-U412");
		assert.equal(sourceLink("A [b] c", "ver_dfa4295bb03c", "U412"), "[A b c](#src-ver_dfa4295bb03c-U412)");
		assert.deepEqual(parseSourceRef("#src-ver_dfa4295bb03c-U412"), { versionId: "ver_dfa4295bb03c", label: "U412" });
		for (const bad of ["", "https://x", "#src-ver_x-U1", "#src-ver_dfa4295bb03c-412", "#src-ver_dfa4295bb03c-U412 extra", null]) {
			assert.equal(parseSourceRef(bad), null, String(bad));
		}
	});
});

describe("read_source (D085)", () => {
	it("reads a paragraph by address, with its link and its article's heading", () => {
		const out = readSource(ctx, { address: "Art. 28(2)" });
		const [head, link, text] = out.split("\n");
		assert.equal(head, "1 paragraph from Regulation (EU) 2022/2554 (version 2022-12-14):");
		assert.match(link!, new RegExp(`^${LINK_28_2.source} General principles$`));
		assert.match(text!, /^As part of their ICT risk management framework, financial entities/);
	});
	it("reads an article and what is under it, capped at 12; Art. 2 never matches Art. 28", () => {
		const out = readSource(ctx, { address: "Article 28" });
		assert.match(out, /^\d+ paragraphs from Regulation \(EU\) 2022\/2554/);
		const links = out.match(/\(#src-/g)!.length;
		assert.equal(links, READ_SOURCE_LIMIT, "Article 28 has more units than the cap");
		assert.ok(out.split("\n").filter((l) => l.startsWith("[")).every((l) => l.includes("Art. 28")));
		assert.ok(readSource(ctx, { address: "Art. 2" }).split("\n").filter((l) => l.startsWith("[")).every((l) => /Art\. 2[(\]]/.test(l)));
	});
	it("finds paragraphs by words, filters by document, and says when nothing matched", () => {
		assert.match(readSource(ctx, { words: "multi-vendor strategy" }), /Art\. 28\(2\)/);
		assert.match(readSource(ctx, { document: "2022/2554", address: "Recital 12" }), /Regulation \(EU\) 2022\/2554, Recital 12\]/);
		assert.equal(readSource(ctx, { document: "Directive (EU) 2015/2366", address: "Art. 1" }), "No paragraph matched. Try an article number such as Art. 28, or fewer words.");
		assert.equal(readSource(ctx, {}), "No paragraph matched. Try an article number such as Art. 28, or fewer words.");
		assert.equal(readSource({ readDocumentVersions: () => [], readDocumentUnits: () => null }, { address: "Art. 1" }), "No source document is imported yet.");
	});
	it("reads the newest version only", () => {
		const v2Units = PARSED.units.map((u) => (u.path.join() === P28_2.join() ? { ...u, text: "Financial entities shall adopt a revised strategy on ICT third-party risk." } : u));
		const V2 = versionIdFor(DORA, contentHashOf("v2"));
		const versions = [...g.readDocumentVersions(), { ...g.readDocumentVersions()[0]!, versionId: V2, consolidatedAt: "2024-06-01", contentHash: contentHashOf("v2") }];
		const out = readSource({ readDocumentVersions: () => versions, readDocumentUnits: (v) => (v === V2 ? v2Units : g.readDocumentUnits(v)) }, { address: "Art. 28(2)" });
		assert.match(out, /version 2024-06-01/);
		assert.match(out, new RegExp(`#src-${V2}-U`));
		assert.match(out, /a revised strategy/);
	});
});

describe("GET /api/graph/source-unit (D084)", () => {
	it("resolves a link from read_source to its unit, and 404s otherwise", async () => {
		const label = LINK_28_2.exec(readSource(ctx, { address: "Art. 28(2)" }))![1]!;
		const res = await GET(new Request(`http://localhost/api/graph/source-unit?ref=${V1}-U${label}`));
		assert.equal(res.status, 200);
		const view = await res.json();
		assert.equal(view.label, "Regulation (EU) 2022/2554, Art. 28(2)");
		assert.equal(view.versionLabel, "2022-12-14");
		assert.deepEqual(view.path, P28_2);
		assert.equal(view.heading, undefined, "a paragraph has no heading of its own");
		assert.match(view.unitText, /^As part of their ICT risk management framework/);
		assert.equal(view.outdated, undefined);
		for (const ref of [`${V1}-U999999`, "ver_000000000000-U1", "nonsense"]) {
			assert.equal((await GET(new Request(`http://localhost/api/graph/source-unit?ref=${ref}`))).status, 404, ref);
		}
	});
});

describe("the session context (D085)", () => {
	it("a cited pick gets its source line; an uncited session's marker is unchanged", () => {
		const lines = citationSourceLines([NODE, "n_uncited"]);
		assert.deepEqual([...lines.keys()], [NODE]);
		assert.match(lines.get(NODE)![0]!, new RegExp(`^source: ${LINK_28_2.source} "shall adopt, and regularly review, a strategy"$`));
		const picks = [{ id: NODE, name: "Strategy", statement: "Firms must adopt a strategy." }, { id: "n_uncited", name: "Other", statement: "Something else." }];
		const content = newGraphContextMessage(picks, [], lines).content as string;
		assert.match(content, new RegExp(`- \\[${NODE}\\] Strategy: Firms must adopt a strategy\\.\\n  source: \\[Regulation`));
		assert.match(content, /- \[n_uncited\] Other: Something else\.$/);
		const uncited = [picks[1]!];
		assert.equal(newGraphContextMessage(uncited, [], lines).content, newGraphContextMessage(uncited, []).content);
	});
});

describe("registration and the prompt (D086, D087)", () => {
	const stubJobStore = { createJob: () => ({}), getJob: () => undefined, listJobs: () => [], updateJob: () => {} } as unknown as JobStore;
	const base = { chatId: "c1", chatStore: stores.chatStore, jobStore: stubJobStore, spawn: () => {} };
	it("the teacher has read_source only with the sources context; the prober never", () => {
		assert.equal("read_source" in createTeacherTools(base), false);
		assert.equal("read_source" in createTeacherTools({ ...base, sources: ctx }), true);
		assert.equal("read_source" in createProberTools({ ...base, deliver: () => {}, graphStore: g }), false);
	});
	it("the teacher's prompt carries the Citing sources section; the prober's does not", () => {
		const teacher = composeInstructions("teacher");
		assert.match(teacher, /## Citing sources\n\nWhen you teach from an imported source \(a regulation, guideline or paper\), cite the paragraph each point comes from\./);
		assert.match(teacher, /Cite only text you have read through these, never from memory/);
		assert.doesNotMatch(composeInstructions("prober"), /## Citing sources/);
	});
});

describe("Done when (faux): the teacher reads Art. 28(2) and cites it in the lesson", () => {
	it("the lesson text carries the citation link from read_source", async () => {
		const faux = createFauxCore({});
		let toolResult = "";
		const steps: FauxResponseStep[] = [
			() => fauxAssistantMessage([fauxToolCall("read_source", { address: "Art. 28(2)" } as unknown as ToolCall["arguments"], { id: "rs-1" })], { stopReason: "toolUse" }),
			(context) => {
				toolResult = JSON.stringify(context.messages.at(-1));
				const link = LINK_28_2.exec(toolResult.replace(/\\"/g, '"'))![0];
				return fauxAssistantMessage(`Under DORA, financial entities must adopt and regularly review a strategy on ICT third-party risk ${link}.`);
			},
		];
		faux.setResponses(steps);
		const engine: PiEngine = { model: faux.getModel(), streamFn: faux.streamSimple };
		const agent = createTeacherAgent(undefined, { engine, tools: sourceTools(ctx) });
		await agent.prompt("Teach me what DORA Article 28(2) requires.");
		const last = agent.state.messages.at(-1) as { role: string; content: Array<{ type: string; text?: string }> };
		assert.equal(last.role, "assistant");
		const text = last.content.filter((c) => c.type === "text").map((c) => c.text).join("");
		assert.match(text, LINK_28_2, "the lesson carries the link");
		const ref = parseSourceRef(/\((#src-[^)]+)\)/.exec(text)![1]);
		assert.ok(ref, "the link parses as a citation");
		const res = await GET(new Request(`http://localhost/api/graph/source-unit?ref=${ref!.versionId}-${ref!.label}`));
		assert.equal((await res.json()).label, "Regulation (EU) 2022/2554, Art. 28(2)", "and opens Art. 28(2)");
	});
});
