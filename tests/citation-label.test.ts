/**
 * Citation chip labels (Kvasir P2-4, D077): the legal short form for
 * EUR-Lex, label-based forms for PDF and Markdown, and the "+N" chip text.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { chipText, citationLabel, citationLabels, documentShortName, shortPath } from "../src/core/sources.ts";
import type { Citation, DocumentVersion } from "../src/core/contracts.ts";

const DORA = { format: "eurlex-html" as const, title: "REGULATION (EU) 2022/2554 OF THE EUROPEAN PARLIAMENT AND OF THE COUNCIL of 14 December 2022 on digital operational resilience" };
const PSD2 = { format: "eurlex-html" as const, title: "DIRECTIVE (EU) 2015/2366 OF THE EUROPEAN PARLIAMENT AND OF THE COUNCIL of 25 November 2015 on payment services" };

describe("short names", () => {
	it("reads the act's type and number from a EUR-Lex title", () => {
		assert.equal(documentShortName(DORA), "Regulation (EU) 2022/2554");
		assert.equal(documentShortName(PSD2), "Directive (EU) 2015/2366");
		assert.equal(documentShortName({ format: "eurlex-html", title: "COMMISSION DELEGATED REGULATION (EU) 2024/1772 of 13 March 2024 supplementing" }), "Commission Delegated Regulation (EU) 2024/1772");
		assert.equal(documentShortName({ format: "eurlex-html", title: "A very long title that has no act number in it at all, so it is cut" }), "A very long title that has no act number…");
	});
	it("uses the label, without a file extension, for PDF and Markdown", () => {
		assert.equal(documentShortName({ format: "pdf", title: "FINAL REPORT", label: "EBA/GL/2019/04" }), "EBA/GL/2019/04");
		assert.equal(documentShortName({ format: "pdf", title: "FINAL REPORT", label: "eba-gl-2019-04.pdf" }), "eba-gl-2019-04");
		assert.equal(documentShortName({ format: "markdown", title: "Policy", label: "policy.md" }), "policy");
	});
});

describe("short paths (D077)", () => {
	it("EUR-Lex: articles, paragraphs, points, recitals and annexes", () => {
		assert.equal(shortPath("eurlex-html", ["Chapter V", "Section I", "Article 28", "paragraph 2", "point (a)"]), "Art. 28(2)(a)");
		assert.equal(shortPath("eurlex-html", ["Chapter V", "Section I", "Article 28"]), "Art. 28");
		assert.equal(shortPath("eurlex-html", ["Title I", "Article 4", "point (1)", "point (a)"]), "Art. 4(1)(a)");
		assert.equal(shortPath("eurlex-html", ["Recital 12"]), "Recital 12");
		assert.equal(shortPath("eurlex-html", ["Annex I", "point 3", "point (a)"]), "Annex I, point 3(a)");
		assert.equal(shortPath("eurlex-html", ["Annex II"]), "Annex II");
	});
	it("PDF and Markdown", () => {
		assert.equal(shortPath("pdf", ["Section 3.3.3", "paragraph 17"]), "3.3.3 para 17");
		assert.equal(shortPath("pdf", ["page 1", "paragraph 2"]), "p. 1 para 2");
		assert.equal(shortPath("markdown", ["Risk policy", "Risk appetite", "paragraph 3"]), "Risk appetite para 3");
		assert.equal(shortPath("markdown", ["paragraph 1"]), "para 1");
	});
	it("labels and chip text", () => {
		assert.equal(citationLabel(DORA, ["Chapter V", "Section I", "Article 28", "paragraph 2", "point (a)"]), "Regulation (EU) 2022/2554, Art. 28(2)(a)");
		assert.equal(citationLabel({ format: "pdf", title: "x", label: "EBA/GL/2019/04" }, ["Section 3.3.3", "paragraph 17"]), "EBA/GL/2019/04, 3.3.3 para 17");
		assert.equal(chipText([]), "");
		assert.equal(chipText(["A"]), "A");
		assert.equal(chipText(["A", "B", "C"]), "A +2");
	});
	it("groups labels by node in citation order, skipping unknown versions and repeats", () => {
		const v = { sourceId: "doc_1", versionId: "ver_1", ...DORA } as DocumentVersion;
		const c = (id: string, nodeId: string, path: string[], version = "ver_1") => ({ id, nodeId, sourceId: "doc_1", version, path, quote: "q q q q", createdAt: "t" }) as Citation;
		assert.deepEqual(
			citationLabels([c("c1", "n1", ["Recital 2"]), c("c2", "n1", ["Article 1"]), c("c1", "n1", ["Recital 2"]), c("c3", "n2", ["Recital 3"], "ver_gone")], [v]),
			{ n1: ["Regulation (EU) 2022/2554, Recital 2", "Regulation (EU) 2022/2554, Art. 1"] },
		);
	});
});
