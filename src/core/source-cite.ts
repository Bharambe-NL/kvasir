/**
 * Citation links in lessons (Kvasir P2-6, D084): the teacher writes
 * `[Regulation (EU) 2022/2554, Art. 28(2)](#src-ver_dfa4295bb03c-U412)`,
 * and the chat renders it as the citation chip that opens the source panel
 * on that unit. The target names a version and a unit label (labels number
 * a version's units in order, core/source-extract.ts labelUnits). A
 * same-page "#" target passes the markdown sanitiser. Browser-safe.
 */

const SOURCE_REF = /^#src-(ver_[0-9a-f]{12})-(U\d+)$/;

export interface SourceRef {
	versionId: string;
	label: string;
}

/** The link target for one unit. */
export function sourceHref(versionId: string, label: string): string {
	return `#src-${versionId}-${label}`;
}

/** A citation link in markdown: the chip label as text, the unit as target. */
export function sourceLink(text: string, versionId: string, label: string): string {
	return `[${text.replace(/[[\]]/g, "")}](${sourceHref(versionId, label)})`;
}

/** The unit a link points at, or null when it is not a citation link. */
export function parseSourceRef(href: string | undefined | null): SourceRef | null {
	const m = SOURCE_REF.exec((href ?? "").trim());
	return m ? { versionId: m[1]!, label: m[2]! } : null;
}

/** One unit as the panel shows it for a lesson link (no quote: the link
 *  names a paragraph). */
export interface SourceUnitView {
	label: string;
	documentTitle: string;
	versionLabel: string;
	path: string[];
	heading?: string;
	unitText: string;
	outdated?: { versionLabel: string; kind: "removed" | "changed"; text?: string };
}
