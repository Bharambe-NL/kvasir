/**
 * Version diff (Kvasir P2-5, D080, D081): compare two versions' units, and
 * work out whether a citation still holds in the newest version of its
 * source. Pure and browser-safe; everything is derived at read time from
 * the citations, the version list and the stored units (D076), so nothing
 * about "outdated" is ever stored.
 */

import type { Citation, DocumentVersion, SourceUnit } from "./contracts/sources.ts";
import { locateQuote } from "./source-extract.ts";
import { sourceDocuments, versionLabel } from "./sources.ts";

export interface UnitDiff {
	added: string[][];
	changed: string[][];
	removed: string[][];
	unchanged: string[][];
}

const key = (path: readonly string[]) => path.join("\u0000");
const norm = (s: string) => s.replace(/\s+/g, " ").trim();

/** Unit paths that are new, changed, gone or the same from `prev` to
 *  `next`, in each list's document order. Text is compared with whitespace
 *  collapsed; headings are not compared. */
export function diffUnits(prev: readonly SourceUnit[], next: readonly SourceUnit[]): UnitDiff {
	const before = new Map(prev.map((u) => [key(u.path), u]));
	const after = new Set(next.map((u) => key(u.path)));
	const diff: UnitDiff = { added: [], changed: [], removed: [], unchanged: [] };
	for (const u of next) {
		const old = before.get(key(u.path));
		if (!old) diff.added.push([...u.path]);
		else if (norm(old.text) !== norm(u.text)) diff.changed.push([...u.path]);
		else diff.unchanged.push([...u.path]);
	}
	for (const u of prev) if (!after.has(key(u.path))) diff.removed.push([...u.path]);
	return diff;
}

export interface OutdatedInfo {
	versionId: string;
	versionLabel: string;
	kind: "removed" | "changed";
	/** The unit's text in that version, when the unit still exists. */
	text?: string;
}

/** Whether a citation still holds (D080). Current when the newest version
 *  that has stored units still has the cited unit with the quote in it.
 *  Otherwise outdated, pointing at the first later version where the unit
 *  was missing or no longer held the quote. `versions` is the source's
 *  versions in document order (core/sources.ts sourceDocuments); a version
 *  without stored units is skipped. */
export function citationStatus(
	citation: Pick<Citation, "version" | "path" | "quote">,
	versions: readonly DocumentVersion[],
	unitsOf: (versionId: string) => readonly SourceUnit[] | null,
): OutdatedInfo | null {
	const at = versions.findIndex((v) => v.versionId === citation.version);
	if (at < 0) return null;
	const checks: { version: DocumentVersion; unit: SourceUnit | undefined; holds: boolean }[] = [];
	for (const version of versions.slice(at + 1)) {
		const units = unitsOf(version.versionId);
		if (!units) continue;
		const unit = units.find((u) => key(u.path) === key(citation.path));
		checks.push({ version, unit, holds: !!unit && locateQuote(unit.text, citation.quote) !== null });
	}
	const newest = checks.at(-1);
	if (!newest || newest.holds) return null;
	const first = checks.find((c) => !c.holds)!;
	return {
		versionId: first.version.versionId,
		versionLabel: versionLabel(first.version),
		kind: first.unit ? "changed" : "removed",
		...(first.unit ? { text: first.unit.text } : {}),
	};
}

/** The live nodes with at least one outdated citation (the snapshot's
 *  `outdated` list, sorted). */
export function outdatedNodes(
	citations: readonly Citation[],
	versions: readonly DocumentVersion[],
	unitsOf: (versionId: string) => readonly SourceUnit[] | null,
	live: ReadonlySet<string>,
): string[] {
	const ordered = new Map(sourceDocuments(versions).map((d) => [d.id, d.versions]));
	const out = new Set<string>();
	for (const c of citations) {
		if (!live.has(c.nodeId) || out.has(c.nodeId)) continue;
		if (citationStatus(c, ordered.get(c.sourceId) ?? [], unitsOf)) out.add(c.nodeId);
	}
	return [...out].sort();
}
