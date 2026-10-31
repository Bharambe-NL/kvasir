/**
 * The PDF structure parser (Kvasir P2-2): positioned lines (from
 * server/source-pdf.ts) into addressable units, following the document's
 * own numbering (D066). Deterministic, no model.
 *
 * - Running headers and footers go: a line that opens or closes most pages,
 *   and bare page numbers.
 * - A contents page (most lines are numbered entries ending in a page
 *   number) is skipped.
 * - Footnotes: a lone number followed by ". In accordance" is an inline
 *   marker (dropped, the text rejoined); a lone number followed by capital
 *   text starts the footnote body at the page foot (dropped to the page
 *   end).
 * - "3.3.3. Classification and risk assessment" is "Section 3.3.3". A
 *   single number is a section heading only when the title is short and
 *   has no closing punctuation ("3. Guidelines"); otherwise "17. Financial
 *   institutions should…" is "paragraph 17" of the current section.
 *   A paragraph number must rise within its section, so a numbered row in
 *   a later table never collides with a real paragraph.
 * - Paths are the deepest section, then the paragraph:
 *   ["Section 3.3.3", "paragraph 17"]. Text before the first numbered
 *   heading falls back to ["page N", "paragraph k"].
 * - A paragraph runs across lines and pages until the next number.
 *
 * The title is the PDF's metadata title when it reads as a title (not a
 * file name such as "draft.docx"), else the running header, else the file
 * name.
 */

import type { ParsedSource, SourceUnit } from "../contracts/sources.ts";

export interface PdfPage {
	page: number;
	lines: string[];
}

const SECTION = /^(\d{1,2}(?:\.\d{1,2}){1,4})\.?\s+(\S.{0,150})$/;
const SINGLE = /^(\d{1,3})\.\s+(\S.*)$/;
const LONE_NUMBER = /^\d{1,3}$/;

export function parsePdfLines(pages: readonly PdfPage[], names: { metadataTitle?: string; fileName: string }): ParsedSource {
	const units: SourceUnit[] = [];
	const byPath = new Map<string, SourceUnit>();
	const key = (p: string[]) => p.join("\u0000");
	let section: SourceUnit | null = null;
	let current: SourceUnit | null = null;
	const lastParagraph = new Map<string, number>();
	let fallbackPage = 0;
	let fallbackCount = 0;

	const open = (path: string[], page: number, heading?: string): SourceUnit => {
		const existing = byPath.get(key(path));
		if (existing) return existing;
		const unit: SourceUnit = { path, ...(heading ? { heading } : {}), text: "", page };
		units.push(unit);
		byPath.set(key(path), unit);
		return unit;
	};

	for (const { page, lines } of cleanPages(pages)) {
		for (let i = 0; i < lines.length; i++) {
			const line = lines[i]!;
			const next = lines[i + 1] ?? "";
			const sec = SECTION.exec(line);
			const single = SINGLE.exec(line);
			if (sec && /^[A-Z]/.test(sec[2]!) && !/[.;:,]$/.test(sec[2]!)) {
				section = open([`Section ${sec[1]}`], page, sec[2]);
				current = section;
				continue;
			}
			if (single && isSingleHeading(single[2]!, next)) {
				section = open([`Section ${single[1]}`], page, single[2]);
				current = section;
				continue;
			}
			if (single && section) {
				const n = Number(single[1]);
				const last = lastParagraph.get(section.path[0]!) ?? 0;
				if (n > last) {
					lastParagraph.set(section.path[0]!, n);
					current = open([...section.path, `paragraph ${n}`], page);
					append(current, single[2]!);
					continue;
				}
			}
			if (!section) {
				// Before any numbering: page and paragraph (D066). A new
				// paragraph starts after a line ending a sentence.
				if (page !== fallbackPage) {
					fallbackPage = page;
					fallbackCount = 0;
					current = null;
				}
				if (!current || /[.:]$/.test(current.text)) {
					fallbackCount += 1;
					current = open([`page ${page}`, `paragraph ${fallbackCount}`], page);
				}
			}
			append(current!, line);
		}
	}
	return { format: "pdf", title: pdfTitle(pages, names), units };
}

function pdfTitle(pages: readonly PdfPage[], names: { metadataTitle?: string; fileName: string }): string {
	const meta = names.metadataTitle?.trim();
	if (meta && !/\.(docx?|pdf|odt|rtf|txt)$/i.test(meta) && /[a-z]/i.test(meta)) return meta;
	const header = runningLines(pages).find((l) => /[a-z]{3}/i.test(l));
	if (header) return header;
	return names.fileName.replace(/\.[^.]+$/, "");
}

/** The running header and footer lines, as the first page shows them. */
function runningLines(pages: readonly PdfPage[]): string[] {
	const running = runningKeys(pages);
	return (pages[0]?.lines ?? []).filter((l) => running.has(l.replace(/\d+/g, "#")));
}

function runningKeys(pages: readonly PdfPage[]): Set<string> {
	const edge = new Map<string, number>();
	for (const p of pages) {
		for (const l of new Set([p.lines[0], p.lines.at(-1)].filter((x): x is string => !!x))) {
			const k = l.replace(/\d+/g, "#");
			edge.set(k, (edge.get(k) ?? 0) + 1);
		}
	}
	return new Set([...edge].filter(([, n]) => pages.length >= 4 && n >= pages.length / 2).map(([k]) => k));
}

/** "3. Guidelines" is a heading; "1. This document contains guidelines
 *  issued pursuant to…" is a paragraph. */
function isSingleHeading(rest: string, next: string): boolean {
	return rest.length <= 50 && /^[A-Z]/.test(rest) && !/[.;:,]$/.test(rest) && !/^[a-z(]/.test(next);
}

/** Pages with running headers, footers, page numbers, footnotes and the
 *  contents page removed, footnote markers rejoined. */
export function cleanPages(pages: readonly PdfPage[]): PdfPage[] {
	const running = runningKeys(pages);
	const out: PdfPage[] = [];
	for (const p of pages) {
		const lines = [...p.lines];
		while (lines.length && (running.has(lines[0]!.replace(/\d+/g, "#")) || LONE_NUMBER.test(lines[0]!))) lines.shift();
		while (lines.length && (running.has(lines.at(-1)!.replace(/\d+/g, "#")) || LONE_NUMBER.test(lines.at(-1)!))) lines.pop();
		if (isContentsPage(lines)) continue;
		const kept: string[] = [];
		for (let i = 0; i < lines.length; i++) {
			const l = lines[i]!;
			if (!LONE_NUMBER.test(l)) {
				kept.push(l);
				continue;
			}
			const next = lines[i + 1] ?? "";
			if (/^[.,;:)]/.test(next) || /^[a-z]/.test(next)) {
				// Inline footnote marker: rejoin the text around it.
				const prev = kept.pop() ?? "";
				kept.push(`${prev}${/^[.,;:)]/.test(next) ? "" : " "}${next}`.trim());
				i += 1;
				continue;
			}
			break; // the footnote body: the rest of the page
		}
		out.push({ page: p.page, lines: kept });
	}
	return out;
}

function isContentsPage(lines: readonly string[]): boolean {
	if (lines.length < 3) return false;
	const entries = lines.filter((l) => /^\d{1,2}(?:\.\d{1,2})*\.?\s+\S.*\s\d{1,4}$/.test(l)).length;
	return /^(contents|table of contents)$/i.test(lines[0] ?? "") || entries / lines.length >= 0.6;
}

function append(unit: SourceUnit, t: string): void {
	const text = t.replace(/\s+/g, " ").trim();
	if (!text) return;
	unit.text = unit.text ? `${unit.text} ${text}` : text;
}
