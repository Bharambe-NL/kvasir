/**
 * The EUR-Lex parser (Kvasir P2-2): Official Journal XHTML (as EUR-Lex and
 * the EU Publications Office's Cellar service serve it) into addressable
 * units. Deterministic, no model.
 *
 * Addresses come from the markup's ids, not from heading text:
 *   tis_II → "Title II", cpt_V → "Chapter V", sct_I → "Section I",
 *   prt_1 → "Part 1", art_28 → "Article 28", rct_12 → "Recital 12",
 *   anx_I → "Annex I".
 * Paths are the full hierarchy (D064). Recitals, articles and annexes are
 * citable (D065). Inside an article, a paragraph starting "2." is
 * "paragraph 2"; a two- or three-column table row whose label cell reads
 * "(a)", "(i)", "(1)" or "1." is a point ("point (a)", "point 1"), and its
 * nested tables are its sub-points. Footnote references (the link around
 * "(¹)") and footnotes are dropped.
 */

import { parseHTML } from "linkedom";
import type { ParsedSource, SourceUnit } from "../contracts/sources.ts";

const CONTAINER: Record<string, string> = { tis: "Title", prt: "Part", cpt: "Chapter", sct: "Section" };
const LABEL = /^(?:\((?:[a-z]{1,3}|\d{1,3}[a-z]?)\)|\d{1,3}[a-z]?\.|[—–-])$/;

type El = Element;

export function parseEurlex(xhtml: string): ParsedSource {
	const { document } = parseHTML(xhtml);
	// Footnote references are links around a superscript number, "(¹)";
	// the whole link goes, then any stray superscript and the footnotes.
	for (const el of [...document.querySelectorAll('a[href^="#ntr"]')]) el.remove();
	for (const el of [...document.querySelectorAll(".oj-super, .oj-note, .oj-note-tag")]) el.remove();

	const title = docTitle(document);
	const units: SourceUnit[] = [];
	const body = document.querySelector("body") ?? document.documentElement;
	walk(body, [], units);
	return { format: "eurlex-html", title, ...(celexOf(title) ? { celex: celexOf(title)! } : {}), units };
}

/** The act's title: its doc-title lines up to "(Text with EEA relevance)"
 *  or the first annex heading. */
function docTitle(document: Document): string {
	const lines: string[] = [];
	for (const p of document.querySelectorAll("p.oj-doc-ti")) {
		const t = norm(p.textContent ?? "");
		if (/^\(Text with EEA relevance\)$/i.test(t) || /^ANNEX\b/i.test(t)) break;
		lines.push(t);
	}
	return lines.join(" ");
}

/** CELEX from a modern act title: "REGULATION (EU) 2022/2554" → 32022R2554. */
export function celexOf(title: string): string | null {
	const m = /\b(REGULATION|DIRECTIVE|DECISION)\b[^/]*?\((?:EU|EC|EU, Euratom)\)\s*(?:No\s*)?(\d{4})\/(\d{1,4})\b/i.exec(title);
	if (!m) return null;
	const type = { REGULATION: "R", DIRECTIVE: "L", DECISION: "D" }[m[1]!.toUpperCase() as "REGULATION"];
	return `3${m[2]}${type}${m[3]!.padStart(4, "0")}`;
}

/** The last segment of an element id, split into kind and number:
 *  "cpt_V.sct_I" → ["sct", "I"]. */
function idPart(el: El): [string, string] | null {
	const id = el.getAttribute("id");
	if (!id || id.includes(".tit")) return null;
	const last = id.split(".").pop()!;
	const m = /^([a-z]{3})_([0-9A-Za-z]+)$/.exec(last);
	return m ? [m[1]!, m[2]!] : null;
}

function walk(el: El, path: string[], units: SourceUnit[]): void {
	for (const child of [...el.children]) {
		const part = idPart(child);
		if (part && CONTAINER[part[0]]) {
			const p = [...path, `${CONTAINER[part[0]]} ${part[1]}`];
			units.push({ path: p, heading: subtitle(child), text: "" });
			walk(child, p, units);
		} else if (part?.[0] === "art") {
			parseBody(child, [...path, `Article ${part[1]}`], units, { heading: subtitle(child), article: true });
		} else if (part?.[0] === "anx") {
			parseBody(child, [`Annex ${part[1]}`], units, { heading: annexHeading(child), article: false });
		} else if (part?.[0] === "rct") {
			units.push({ path: [`Recital ${part[1]}`], text: recitalText(child) });
		} else {
			walk(child, path, units);
		}
	}
}

/** A container's or article's subject line (its ".tit_1" child). */
function subtitle(el: El): string | undefined {
	const t = [...el.children].find((c) => (c.getAttribute("id") ?? "").endsWith(".tit_1"));
	const text = t ? norm(t.textContent ?? "") : "";
	return text || undefined;
}

function annexHeading(el: El): string | undefined {
	const lines = [...el.querySelectorAll("p.oj-ti-grseq-1")].map((p) => norm(p.textContent ?? "")).filter(Boolean);
	return lines.length ? lines.join(" ") : undefined;
}

function recitalText(el: El): string {
	const cells = [...el.querySelectorAll("td")];
	if (cells.length >= 2) return norm(cells.slice(1).map((c) => c.textContent ?? "").join(" "));
	return norm(el.textContent ?? "");
}

interface BodyState {
	units: SourceUnit[];
	own: SourceUnit;
	paragraph: SourceUnit | null;
	article: boolean;
}

/** An article's or annex's body: its own text, numbered paragraphs, and
 *  points from tables. */
function parseBody(el: El, path: string[], units: SourceUnit[], opts: { heading?: string; article: boolean }): void {
	const own: SourceUnit = { path, ...(opts.heading ? { heading: opts.heading } : {}), text: "" };
	units.push(own);
	const state: BodyState = { units, own, paragraph: null, article: opts.article };
	bodyChildren(el, state);
}

function bodyChildren(el: El, state: BodyState): void {
	for (const child of [...el.children]) {
		const cls = child.getAttribute("class") ?? "";
		const id = child.getAttribute("id") ?? "";
		if (id.endsWith(".tit_1") || /\boj-(ti-art|sti-art|doc-ti|ti-grseq-1)\b/.test(cls)) continue;
		const tag = child.tagName.toLowerCase();
		if (tag === "table" && /\boj-table\b/.test(cls)) {
			// A data table (a correlation table, a schedule): each row is a
			// line of its parent's text, cells joined by " | ".
			for (const row of rowsOf(child)) append(state.paragraph ?? state.own, norm([...row.children].map((c) => norm(c.textContent ?? "")).join(" | ")));
		} else if (tag === "table") {
			for (const row of rowsOf(child)) point(row, state.paragraph ?? state.own, state);
		} else if (tag === "p" || tag === "span") {
			text(norm(child.textContent ?? ""), state);
		} else {
			bodyChildren(child, state);
		}
	}
}

/** A text block inside an article body: "2. …" opens paragraph 2 (articles
 *  only); anything else continues the current paragraph, or the article's
 *  own text before the first paragraph. */
function text(t: string, state: BodyState): void {
	if (!t) return;
	const m = state.article ? /^(\d{1,3}[a-z]?)\.\s+(.*)$/s.exec(t) : null;
	if (m) {
		state.paragraph = { path: [...state.own.path, `paragraph ${m[1]}`], text: m[2]! };
		state.units.push(state.paragraph);
		return;
	}
	append(state.paragraph ?? state.own, t);
}

/** The direct rows of a table (never a nested table's rows). */
function rowsOf(table: El): El[] {
	const out: El[] = [];
	for (const section of [...table.children]) {
		const rows = section.tagName.toLowerCase() === "tr" ? [section] : [...section.children].filter((r) => r.tagName.toLowerCase() === "tr");
		out.push(...rows);
	}
	return out;
}

/** One table row as a point under `parent`: its label cell names it, the
 *  rest is its own text, and nested tables are its sub-points. A row with
 *  no label cell is continuation text of the parent. */
function point(row: El, parent: SourceUnit, state: BodyState): void {
	const cells = [...row.children].filter((c) => c.tagName.toLowerCase() === "td");
	// The label is the first non-empty cell, and something must follow it.
	const firstFull = cells.findIndex((c) => norm(c.textContent ?? "") !== "");
	const labelAt =
		firstFull >= 0 &&
		LABEL.test(norm(cells[firstFull]!.textContent ?? "")) &&
		cells.slice(firstFull + 1).some((c) => norm(c.textContent ?? "") !== "" || c.querySelector("table"))
			? firstFull
			: -1;
	if (labelAt < 0) {
		append(parent, norm(cells.map((c) => c.textContent ?? "").join(" ")));
		return;
	}
	const label = norm(cells[labelAt]!.textContent ?? "");
	const name = /^[—–-]$/.test(label)
		? `indent ${state.units.filter((u) => u.path.length === parent.path.length + 1 && u.path.slice(0, -1).join("\u0000") === parent.path.join("\u0000") && u.path.at(-1)!.startsWith("indent ")).length + 1}`
		: `point ${label.replace(/\.$/, "")}`;
	const unit: SourceUnit = { path: [...parent.path, name], text: "" };
	state.units.push(unit);
	for (const cell of cells.slice(labelAt + 1)) cellContent(cell, unit, state);
}

/** A content cell: its text blocks belong to the point; nested tables are
 *  sub-points. */
function cellContent(cell: El, unit: SourceUnit, state: BodyState): void {
	const textNodes: string[] = [];
	for (const node of [...cell.childNodes]) {
		if (node.nodeType === 1 && (node as El).tagName.toLowerCase() === "table") {
			if (textNodes.length) append(unit, norm(textNodes.splice(0).join(" ")));
			for (const row of rowsOf(node as El)) point(row, unit, state);
		} else if (node.nodeType === 1 && (node as El).querySelector("table")) {
			if (textNodes.length) append(unit, norm(textNodes.splice(0).join(" ")));
			cellContent(node as El, unit, state);
		} else {
			textNodes.push(node.textContent ?? "");
		}
	}
	if (textNodes.length) append(unit, norm(textNodes.join(" ")));
}

function append(unit: SourceUnit, t: string): void {
	if (!t) return;
	unit.text = unit.text ? `${unit.text} ${t}` : t;
}

function norm(s: string): string {
	return s.replace(/\s+/g, " ").trim();
}
