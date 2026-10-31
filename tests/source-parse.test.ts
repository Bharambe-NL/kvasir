/**
 * The structure parsers (Kvasir P2-2, D064 to D067) over real documents:
 * DORA and PSD2 as Official Journal XHTML, EBA/GL/2019/04 as PDF
 * (tests/fixtures/sources/, README there). "Done when": DORA, PSD2 and one
 * EBA guideline parse with correct article numbering. No network, no model.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { parseEurlex, celexOf } from "../src/core/source-parse/eurlex.ts";
import { parseMarkdown } from "../src/core/source-parse/markdown.ts";
import { cleanPages, parsePdfLines } from "../src/core/source-parse/pdf.ts";
import { parseSource } from "../src/server/sources.ts";
import { pdfLines } from "../src/server/source-pdf.ts";
import { detectSourceFormat, fileSourceLoader, UnsupportedSourceError } from "../src/server/source-loader.ts";
import { contentHashOf } from "../src/core/source-ids.ts";
import type { ParsedSource, SourceUnit } from "../src/core/contracts.ts";

const FIX = fileURLToPath(new URL("./fixtures/sources/", import.meta.url));
const read = (f: string) => fs.readFileSync(path.join(FIX, f), "utf8");
const DORA = parseEurlex(read("dora.xhtml"));
const PSD2 = parseEurlex(read("psd2.xhtml"));
const EBA = await parseSource(await fileSourceLoader.load(path.join(FIX, "eba-gl-2019-04.pdf")));
const EBA_PAGES = await pdfLines(new Uint8Array(fs.readFileSync(path.join(FIX, "eba-gl-2019-04.pdf"))));

const at = (doc: ParsedSource, ...p: string[]): SourceUnit => {
	const u = doc.units.find((x) => x.path.join("\u0000") === p.join("\u0000"));
	assert.ok(u, `no unit at ${p.join(" > ")}`);
	return u;
};
const articles = (doc: ParsedSource) => doc.units.filter((u) => /^Article \d+$/.test(u.path.at(-1)!));
const norm = (s: string) => s.replace(/\s+/g, " ");
/** The document's visible text with tags stripped, for verbatim checks. */
const plainOf = (xhtml: string) =>
	norm(xhtml.replace(/<a [^>]*href="#ntr[^"]*"[^>]*>.*?<\/a>/g, "").replace(/<span class="oj-super[^"]*"[^>]*>[^<]*<\/span>/g, "").replace(/<\/?(?:span|a|em|i|b|strong|sub|sup)\b[^>]*>/g, "").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&"));

function sharedChecks(doc: ParsedSource) {
	const keys = doc.units.map((u) => u.path.join("\u0000"));
	assert.equal(new Set(keys).size, keys.length, "paths are unique");
	for (const u of doc.units) {
		assert.ok(u.path.length > 0 && u.path.every((p) => p.trim().length > 0), `path ${u.path.join(" > ")}`);
		assert.ok(u.text.trim().length > 0 || u.heading || isContainer(doc, u), `${u.path.join(" > ")} has text, a heading, or children`);
	}
}
const isContainer = (doc: ParsedSource, u: SourceUnit) => doc.units.some((c) => c.path.length > u.path.length && u.path.every((p, i) => c.path[i] === p));

describe("EUR-Lex: DORA, Regulation (EU) 2022/2554", () => {
	it("reads the title and the CELEX number", () => {
		assert.match(DORA.title, /^REGULATION \(EU\) 2022\/2554 OF THE EUROPEAN PARLIAMENT AND OF THE COUNCIL of 14 December 2022 on digital operational resilience/);
		assert.equal(DORA.celex, "32022R2554");
		assert.equal(DORA.format, "eurlex-html");
	});

	it("numbers 64 articles in order, each under its chapter and section (D064)", () => {
		const arts = articles(DORA);
		assert.deepEqual(arts.map((a) => a.path.at(-1)), Array.from({ length: 64 }, (_, i) => `Article ${i + 1}`));
		assert.deepEqual(at(DORA, "Chapter V", "Section I", "Article 28").heading, "General principles");
		assert.deepEqual(arts[0]!.path, ["Chapter I", "Article 1"]);
		assert.deepEqual(arts[4]!.path, ["Chapter II", "Section I", "Article 5"]);
		assert.deepEqual(arts[63]!.path, ["Chapter IX", "Section II", "Article 64"]);
		assert.equal(at(DORA, "Chapter V").heading, "Managing of ICT third-party risk");
	});

	it("splits Article 28 into paragraphs and nested points", () => {
		const a28 = ["Chapter V", "Section I", "Article 28"];
		assert.match(at(DORA, ...a28, "paragraph 1").text, /^Financial entities shall manage ICT third-party risk as an integral component of ICT risk/);
		assert.match(at(DORA, ...a28, "paragraph 1", "point (a)").text, /^financial entities that have in place contractual arrangements/);
		assert.match(at(DORA, ...a28, "paragraph 1", "point (b)", "point (i)").text, /^the nature, scale, complexity and importance of ICT-related dependencies,$/);
		assert.match(at(DORA, ...a28, "paragraph 2").text, /^As part of their ICT risk management framework, financial entities, other than entities referred to in Article 16\(1\)/);
		const paras = DORA.units.filter((u) => u.path.length === 4 && u.path.slice(0, 3).join() === a28.join() && u.path[3]!.startsWith("paragraph"));
		assert.deepEqual(paras.map((p) => p.path[3]), Array.from({ length: 10 }, (_, i) => `paragraph ${i + 1}`));
	});

	it("has 106 recitals in order, and no footnote references in any text (D065)", () => {
		assert.equal(DORA.units.some((u) => /\(\s*\)/.test(u.text)), false, "no empty \"()\" left by a footnote reference");
		const recitals = DORA.units.filter((u) => u.path[0]!.startsWith("Recital"));
		assert.deepEqual(recitals.map((r) => r.path[0]), Array.from({ length: 106 }, (_, i) => `Recital ${i + 1}`));
		assert.match(at(DORA, "Recital 12").text, /^This Regulation aims to consolidate and upgrade ICT risk requirements/);
	});

	it("keeps point text verbatim", () => {
		const plain = plainOf(read("dora.xhtml"));
		const points = DORA.units.filter((u) => u.path.at(-1)!.startsWith("point") && u.text);
		assert.ok(points.length > 300);
		for (const p of points.filter((u) => !DORA.units.some((c) => c.path.length > u.path.length && u.path.every((x, i) => c.path[i] === x)))) {
			assert.ok(plain.includes(p.text), `verbatim: ${p.path.join(" > ")}`);
		}
	});

	it("passes the shared checks", () => sharedChecks(DORA));
});

describe("EUR-Lex: PSD2, Directive (EU) 2015/2366", () => {
	it("reads the title and the CELEX number", () => {
		assert.match(PSD2.title, /^DIRECTIVE \(EU\) 2015\/2366 OF THE EUROPEAN PARLIAMENT AND OF THE COUNCIL of 25 November 2015 on payment services in the internal market/);
		assert.equal(PSD2.celex, "32015L2366");
	});

	it("numbers 117 articles in order under titles, chapters and sections (D064)", () => {
		const arts = articles(PSD2);
		assert.deepEqual(arts.map((a) => a.path.at(-1)), Array.from({ length: 117 }, (_, i) => `Article ${i + 1}`));
		assert.deepEqual(arts[3]!.path, ["Title I", "Article 4"]);
		assert.deepEqual(arts[27]!.path, ["Title II", "Chapter 1", "Section 3", "Article 28"]);
		assert.deepEqual(arts[96]!.path, ["Title IV", "Chapter 5", "Article 97"]);
		assert.equal(at(PSD2, "Title IV", "Chapter 5", "Article 97").heading, "Authentication");
	});

	it("reads definitions as points with sub-points", () => {
		assert.match(at(PSD2, "Title I", "Article 4", "point (1)").text, /^‘home Member State’ means either of the following:$/);
		assert.match(at(PSD2, "Title I", "Article 4", "point (1)", "point (a)").text, /^the Member State in which the registered office of the payment service provider is situated; or$/);
	});

	it("has 113 recitals and Annexes I and II (D065)", () => {
		const recitals = PSD2.units.filter((u) => u.path[0]!.startsWith("Recital"));
		assert.deepEqual(recitals.map((r) => r.path[0]), Array.from({ length: 113 }, (_, i) => `Recital ${i + 1}`));
		assert.equal(at(PSD2, "Annex I").heading, "PAYMENT SERVICES (as referred to in point (3) of Article 4)");
		assert.match(at(PSD2, "Annex I", "point 1").text, /^Services enabling cash to be placed on a payment account/);
		assert.match(at(PSD2, "Annex I", "point 3", "point (a)").text, /^execution of direct debits/);
		assert.match(at(PSD2, "Annex II").text, /^CORRELATION TABLE This Directive \| Directive 2007\/64\/EC Article 1\(1\) \| Article 1\(1\)/);
		assert.equal(PSD2.units.filter((u) => u.path[0] === "Annex II").length, 1, "a correlation table is text, not points");
	});

	it("passes the shared checks", () => sharedChecks(PSD2));
});

describe("CELEX from a title", () => {
	it("reads modern regulations, directives and decisions", () => {
		assert.equal(celexOf("REGULATION (EU) 2022/2554 OF THE EUROPEAN PARLIAMENT"), "32022R2554");
		assert.equal(celexOf("DIRECTIVE (EU) 2015/2366 OF THE EUROPEAN PARLIAMENT"), "32015L2366");
		assert.equal(celexOf("COMMISSION DECISION (EU) 2019/31 of 1 January"), "32019D0031");
		assert.equal(celexOf("Some guideline"), null);
	});
});

describe("PDF: EBA/GL/2019/04 (D066)", () => {
	it("takes the running header as the title (the metadata title is a Word file name)", () => {
		assert.equal(EBA.format, "pdf");
		assert.equal(EBA.title, "FINAL REPORT ON GUIDELINES ON ICT AND SECURITY RISK MANAGEMENT");
	});

	it("numbers the guideline's sections and paragraphs, 1 to 98 with no gaps from 3.1 on", () => {
		const sections = EBA.units.filter((u) => u.path.length === 1 && u.path[0]!.startsWith("Section 3.")).map((u) => u.path[0]);
		assert.deepEqual(sections.slice(0, 12), ["Section 3.1", "Section 3.2", "Section 3.2.1", "Section 3.2.2", "Section 3.2.3", "Section 3.3", "Section 3.3.1", "Section 3.3.2", "Section 3.3.3", "Section 3.3.4", "Section 3.3.5", "Section 3.3.6"]);
		const guideline = EBA.units.filter((u) => /^Section 3\.\d/.test(u.path[0]!) && u.path[1]?.startsWith("paragraph"));
		assert.deepEqual(guideline.map((u) => Number(u.path[1]!.split(" ")[1])), Array.from({ length: 98 }, (_, i) => i + 1));
		const preliminary = EBA.units.filter((u) => u.path[0] === "Section 3" && u.path[1]?.startsWith("paragraph"));
		assert.deepEqual(preliminary.map((u) => u.path[1]), Array.from({ length: 12 }, (_, i) => `paragraph ${i + 1}`));
	});

	it("reads Section 3.3.3 paragraph 17 exactly, with its heading and page", () => {
		assert.equal(at(EBA, "Section 3.3.3").heading, "Classification and risk assessment");
		assert.deepEqual(at(EBA, "Section 3.3.3", "paragraph 17"), {
			path: ["Section 3.3.3", "paragraph 17"],
			text: "Financial institutions should classify the identified business functions, supporting processes and information assets referred to in paragraphs 15 and 16 in terms of criticality.",
			page: 17,
		});
	});

	it("rejoins a footnote marker and drops the footnote", () => {
		const p1 = at(EBA, "Section 3", "paragraph 1").text;
		assert.equal(p1, "This document contains guidelines issued pursuant to Article 16 of Regulation (EU) No 1093/2010. In accordance with Article 16(3) of Regulation (EU) No 1093/2010, competent authorities and financial institutions must make every effort to comply with the guidelines.");
		assert.equal(EBA.units.some((u) => u.text.includes("establishing a European Supervisory Authority")), false, "the footnote body is gone");
	});

	it("leaves no running header in any unit, skips the contents page, and joins paragraphs across pages", () => {
		assert.equal(EBA.units.some((u) => u.text.includes("FINAL REPORT ON GUIDELINES ON ICT AND SECURITY RISK MANAGEMENT")), false);
		assert.equal(EBA.units.some((u) => u.page === 2), false, "page 2 is the contents page");
		// A page that opens mid-paragraph: its first line belongs to a
		// paragraph that started on an earlier page.
		const pages = cleanPages(EBA_PAGES.pages);
		const carried = pages.filter((pg) => pg.page > 14 && pg.page < 30 && pg.lines[0] && !/^\d/.test(pg.lines[0]));
		assert.ok(carried.length > 0, "the guideline has pages that open mid-paragraph");
		for (const pg of carried) {
			const unit = EBA.units.find((u) => u.text.includes(pg.lines[0]!));
			assert.ok(unit, `page ${pg.page}'s first line is in a unit`);
			assert.ok(unit.page! < pg.page, `it continues a unit from page ${unit.page}`);
		}
	});

	it("passes the shared checks", () => sharedChecks(EBA));
});

describe("PDF cleaning on synthetic pages", () => {
	const page = (n: number, body: string[]) => ({ page: n, lines: ["ACME REPORT", ...body, String(n)] });
	it("drops running headers and page numbers, rejoins markers, drops footnotes, and falls back to page paragraphs", () => {
		const pages = [
			page(1, ["Cover title", "An unnumbered line.", "Another one."]),
			page(2, ["1. Scope", "1. This applies to all firms", "3", ". It is binding.", "3", "A footnote body."]),
			page(3, ["2. A second paragraph that", "continues here."]),
			page(4, ["Plain text"]),
		];
		const cleaned = cleanPages(pages);
		assert.deepEqual(cleaned[1]!.lines, ["1. Scope", "1. This applies to all firms. It is binding."]);
		const doc = parsePdfLines(pages, { fileName: "acme.pdf" });
		assert.equal(doc.title, "ACME REPORT");
		assert.deepEqual(doc.units.map((u) => u.path.join(" > ")), ["page 1 > paragraph 1", "page 1 > paragraph 2", "Section 1", "Section 1 > paragraph 1", "Section 1 > paragraph 2"]);
		assert.equal(at(doc, "Section 1", "paragraph 2").text, "A second paragraph that continues here. Plain text");
		assert.equal(parsePdfLines(pages, { metadataTitle: "draft v3.docx", fileName: "acme.pdf" }).title, "ACME REPORT");
		assert.equal(parsePdfLines(pages, { metadataTitle: "Acme Guidelines", fileName: "acme.pdf" }).title, "Acme Guidelines");
	});
});

describe("Markdown (D066)", () => {
	it("addresses paragraphs by heading path, counts list items, and handles text before the first heading", () => {
		const md = ["Intro line.", "", "# Risk policy", "", "Opening **bold** text.", "", "## Risk appetite", "", "First.", "", "1. One", "2. Two", "", "Last.", "", "## Limits", "", "Only."].join("\n");
		const doc = parseMarkdown(md, "policy.md");
		assert.equal(doc.title, "Risk policy");
		assert.deepEqual(
			doc.units.map((u) => [u.path.join(" > "), u.text]),
			[
				["paragraph 1", "Intro line."],
				["Risk policy", ""],
				["Risk policy > paragraph 1", "Opening bold text."],
				["Risk policy > Risk appetite", ""],
				["Risk policy > Risk appetite > paragraph 1", "First."],
				["Risk policy > Risk appetite > paragraph 2", "One"],
				["Risk policy > Risk appetite > paragraph 3", "Two"],
				["Risk policy > Risk appetite > paragraph 4", "Last."],
				["Risk policy > Limits", ""],
				["Risk policy > Limits > paragraph 1", "Only."],
			],
		);
		assert.equal(parseMarkdown("Just text.", "notes.md").title, "notes");
		const twice = parseMarkdown("# A\n\nx\n\n# A\n\ny", "t.md");
		assert.deepEqual(twice.units.map((u) => u.path.join(" > ")), ["A", "A > paragraph 1", "A (2)", "A (2) > paragraph 1"], "a repeated heading and its paragraphs get their own path");
		sharedChecks(doc);
	});
});

describe("the file SourceLoader (D062)", () => {
	it("detects the three formats and hashes the bytes", async () => {
		const dora = await fileSourceLoader.load(path.join(FIX, "dora.xhtml"));
		assert.equal(dora.format, "eurlex-html");
		assert.equal(dora.contentHash, contentHashOf(fs.readFileSync(path.join(FIX, "dora.xhtml"))));
		assert.equal((await fileSourceLoader.load(path.join(FIX, "eba-gl-2019-04.pdf"))).format, "pdf");
		assert.equal(detectSourceFormat("notes.md", new TextEncoder().encode("# x")), "markdown");
		assert.equal(detectSourceFormat("renamed.bin", new TextEncoder().encode("%PDF-1.5")), "pdf");
	});

	it("refuses other formats, plain HTML and missing files", async () => {
		assert.throws(() => detectSourceFormat("a.docx", new Uint8Array([1, 2])), UnsupportedSourceError);
		assert.throws(() => detectSourceFormat("page.html", new TextEncoder().encode("<html><p>hi</p></html>")), /no EUR-Lex markup/);
		const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "kv-loader-"));
		try {
			await assert.rejects(fileSourceLoader.load(path.join(tmp, "missing.pdf")), /ENOENT/);
		} finally {
			fs.rmSync(tmp, { recursive: true, force: true });
		}
	});
});
