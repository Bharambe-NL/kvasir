/**
 * The sources door's pure side (Kvasir P2-3): unit labels, chunking, the
 * view the extractor reads, and the citation check. No IO, no model.
 *
 * - Labels (D068): every unit with text gets "U1", "U2", … in document
 *   order, numbered across the whole document so they stay the same in
 *   every chunk. Containers (no text of their own) get no label: they are
 *   shown as context lines and cannot be cited.
 * - Chunks never split a unit. Units are grouped by their top citable unit
 *   (an article, recital or annex; a numbered section; a heading) and the
 *   groups fill a chunk greedily up to the token budget; a group larger than
 *   the budget is split between its units.
 * - The quote check (D070): a quote of at least 4 words must appear in its
 *   unit after folding whitespace, and treating curly and straight quotes,
 *   apostrophes, hyphens and dashes alike. locateQuote returns the
 *   document's own text for the match, which is what the merger stores.
 */

import type { ParsedSource, SourceUnit } from "./contracts/sources.ts";

export interface LabelledUnit {
	/** "U12"; absent for a container with no text of its own. */
	label?: string;
	unit: SourceUnit;
}

export interface SourceChunk {
	units: LabelledUnit[];
	/** The labels this chunk may cite, mapped to their units. */
	citable: Map<string, SourceUnit>;
}

export const MIN_QUOTE_WORDS = 4;

/** Label every unit with text, in document order (D068). */
export function labelUnits(units: readonly SourceUnit[]): LabelledUnit[] {
	let n = 0;
	return units.map((unit) => (unit.text.trim() ? { label: `U${++n}`, unit } : { unit }));
}

/** The group a unit is chunked with: its top citable unit. */
function groupKey(path: readonly string[]): string {
	const top = path.findIndex((p) => /^(Article|Recital|Annex) /.test(p));
	if (top >= 0) return path.slice(0, top + 1).join("\u0000");
	if (path.length > 1 && /^paragraph /.test(path.at(-1)!)) return path.slice(0, -1).join("\u0000");
	return path.join("\u0000");
}

/** Units into chunks under `budget` tokens (chars / 4, like every other
 *  estimate in the app). A chunk always holds at least one unit. */
export function chunkUnits(labelled: readonly LabelledUnit[], budget: number): SourceChunk[] {
	const groups: LabelledUnit[][] = [];
	for (const lu of labelled) {
		const key = groupKey(lu.unit.path);
		const last = groups.at(-1);
		if (last && groupKey(last[0]!.unit.path) === key) last.push(lu);
		else groups.push([lu]);
	}
	const chunks: LabelledUnit[][] = [];
	let current: LabelledUnit[] = [];
	let size = 0;
	// A chunk closes only once it holds something citable: context lines
	// alone (a chapter heading) carry forward into the next chunk.
	const flush = () => {
		if (!current.some((u) => u.label)) return;
		chunks.push(current);
		current = [];
		size = 0;
	};
	for (const group of groups) {
		const groupSize = group.reduce((s, u) => s + tokens(u), 0);
		if (size > 0 && size + groupSize > budget) flush();
		if (groupSize <= budget) {
			current.push(...group);
			size += groupSize;
			continue;
		}
		for (const u of group) {
			if (size > 0 && size + tokens(u) > budget) flush();
			current.push(u);
			size += tokens(u);
		}
	}
	flush();
	if (current.length) {
		// Trailing context with nothing to cite joins the last chunk.
		if (chunks.length) chunks.at(-1)!.push(...current);
		else chunks.push(current);
	}
	return chunks.map((units) => ({
		units,
		citable: new Map(units.filter((u) => u.label).map((u) => [u.label!, u.unit])),
	}));
}

function tokens(u: LabelledUnit): number {
	return Math.ceil((u.unit.path.join(" > ").length + u.unit.text.length + (u.unit.heading?.length ?? 0) + 12) / 4);
}

/** The text the extractor reads for one chunk. */
export function sourceView(doc: Pick<ParsedSource, "title">, versionLabel: string, chunk: SourceChunk, part?: { i: number; n: number }): string {
	const head = `SOURCE (a document): ${doc.title}, version ${versionLabel}${part && part.n > 1 ? ` (part ${part.i}/${part.n})` : ""}`;
	const lines: string[] = [head, ""];
	for (const { label, unit } of chunk.units) {
		const address = unit.path.join(" > ");
		if (!label) {
			lines.push(`${address}${unit.heading ? `: ${unit.heading}` : ""}`);
			continue;
		}
		lines.push(`[${label}] ${address}${unit.heading ? `: ${unit.heading}` : ""}`);
		lines.push(unit.text);
	}
	return lines.join("\n");
}

const FOLD: Record<string, string> = {
	"‘": "'", "’": "'", "‚": "'", "‛": "'", "′": "'",
	"“": '"', "”": '"', "„": '"', "‟": '"', "″": '"',
	"‐": "-", "‑": "-", "‒": "-", "–": "-", "—": "-", "―": "-", "−": "-",
	" ": " ",
};

/** The folded form of `s` and, for each folded character, the index of the
 *  original character it came from. */
function fold(s: string): { text: string; at: number[] } {
	let text = "";
	const at: number[] = [];
	let space = false;
	for (let i = 0; i < s.length; i++) {
		const c = FOLD[s[i]!] ?? s[i]!;
		if (/\s/.test(c)) {
			if (!space && text.length > 0) {
				text += " ";
				at.push(i);
			}
			space = true;
			continue;
		}
		space = false;
		text += c;
		at.push(i);
	}
	if (text.endsWith(" ")) {
		text = text.slice(0, -1);
		at.pop();
	}
	return { text, at };
}

/** The document's own text for `quote` inside `unitText` (D070), or null
 *  when it is not there. */
export function locateQuote(unitText: string, quote: string): string | null {
	const q = fold(quote).text;
	if (!q) return null;
	const u = fold(unitText);
	const start = u.text.indexOf(q);
	if (start < 0) return null;
	const from = u.at[start]!;
	const to = u.at[start + q.length - 1]!;
	return unitText.slice(from, to + 1).replace(/\s+/g, " ");
}

export function wordCount(s: string): number {
	return s.trim().split(/\s+/).filter(Boolean).length;
}

export interface CitedProposition {
	id: string;
	citations?: { unit: string; quote: string }[];
}

/** The citation law at the submit step (D069, D070): every proposition has
 *  at least one citation, each naming a unit of THIS chunk, with a quote of
 *  at least 4 words found in that unit. Returns one message listing every
 *  problem (sent back to the model), or null to accept. */
export function validateCitations(propositions: readonly CitedProposition[], citable: ReadonlyMap<string, SourceUnit>): string | null {
	const problems: string[] = [];
	for (const p of propositions) {
		const cites = p.citations ?? [];
		if (cites.length === 0) {
			problems.push(`${p.id}: no citation. Give at least one unit label and a quote from it.`);
			continue;
		}
		for (const c of cites) {
			const unit = citable.get(c.unit.trim());
			if (!unit) {
				problems.push(`${p.id}: "${c.unit}" is not a unit label in this stretch. Copy a label such as [U12] exactly, without the brackets.`);
			} else if (wordCount(c.quote) < MIN_QUOTE_WORDS) {
				problems.push(`${p.id}: the quote from ${c.unit} has fewer than ${MIN_QUOTE_WORDS} words: "${c.quote}"`);
			} else if (locateQuote(unit.text, c.quote) === null) {
				problems.push(`${p.id}: quote not found in ${c.unit}: "${c.quote}". Copy the words exactly from that unit's text.`);
			}
		}
	}
	return problems.length ? `citations:\n${problems.join("\n")}` : null;
}

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

/** An Official Journal act's date from its title (D072): "… of 14 December
 *  2022 on …" gives "2022-12-14"; null when the title has none. */
export function actDateOf(title: string): string | null {
	const m = /\bof (\d{1,2}) (January|February|March|April|May|June|July|August|September|October|November|December) (\d{4})\b/i.exec(title);
	if (!m) return null;
	const month = MONTHS.indexOf(m[2]!.toLowerCase()) + 1;
	return `${m[3]}-${String(month).padStart(2, "0")}-${m[1]!.padStart(2, "0")}`;
}
