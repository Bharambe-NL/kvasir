/**
 * Reading a source document's text (Kvasir P2-6, moved to core in P6-2):
 * by address ("Art. 28(2)", "Recital 12", "3.3.3 para 17") or by words,
 * from the newest version of each imported document, each paragraph with
 * its citation link. Shared by the teacher's read_source tool and the MCP
 * server. Pure; the context carries read functions only.
 */

import type { DocumentVersion, SourceUnit } from "./contracts/sources.ts";
import { labelUnits } from "./source-extract.ts";
import { sourceLink } from "./source-cite.ts";
import { citationLabel, documentShortName, shortPath, sourceDocuments, versionLabel } from "./sources.ts";

export interface SourceReadContext {
	readDocumentVersions: () => DocumentVersion[];
	readDocumentUnits: (versionId: string) => SourceUnit[] | null;
}

export const READ_SOURCE_LIMIT = 12;



const squash = (s: string) =>
	s.toLowerCase().replace(/\barticle\s*/g, "art.").replace(/\bparagraph\s*/g, "para").replace(/\s+/g, "");

/** True when `short` is the address or a unit under it ("art.2" never
 *  matches "art.28"). */
function under(short: string, address: string): boolean {
	const a = squash(address);
	const s = squash(short);
	if (!a || !s.startsWith(a)) return false;
	const next = s.charAt(a.length);
	return next === "" || !/[0-9a-z.]/.test(next);
}

export function readSource(ctx: SourceReadContext, input: { document?: string; address?: string; words?: string }): string {
	const docs = sourceDocuments(ctx.readDocumentVersions());
	if (docs.length === 0) return "No source document is imported yet.";
	const noMatch = "No paragraph matched. Try an article number such as Art. 28, or fewer words.";
	const docQuery = input.document?.trim().toLowerCase();
	const address = input.address?.trim();
	const words = (input.words ?? "").toLowerCase().split(/\s+/).filter((w) => w.length > 1);
	if (!address && words.length === 0) return noMatch;
	const blocks: string[] = [];
	let left = READ_SOURCE_LIMIT;
	for (const doc of docs) {
		if (left === 0) break;
		const version = doc.versions.at(-1)!;
		const name = documentShortName(version);
		if (docQuery && ![name, doc.title, doc.celex ?? ""].some((s) => s.toLowerCase().includes(docQuery))) continue;
		const units = ctx.readDocumentUnits(version.versionId);
		if (!units) continue;
		const labelled = labelUnits(units);
		const headingOf = (u: SourceUnit) =>
			u.heading ?? labelled.map((l) => l.unit).filter((p) => p.heading && p.path.length < u.path.length && p.path.every((s, i) => u.path[i] === s)).at(-1)?.heading;
		const hits = labelled.filter((l) => {
			if (!l.label) return false;
			if (address && !under(shortPath(version.format, l.unit.path), address)) return false;
			const text = l.unit.text.toLowerCase();
			return words.every((w) => text.includes(w));
		});
		if (hits.length === 0) continue;
		const shown = hits.slice(0, left);
		left -= shown.length;
		const lines = [`${shown.length} paragraph${shown.length === 1 ? "" : "s"} from ${name} (version ${versionLabel(version)}):`];
		for (const { label, unit } of shown) {
			const heading = headingOf(unit);
			lines.push(`${sourceLink(citationLabel(version, unit.path), version.versionId, label!)}${heading ? ` ${heading}` : ""}`, unit.text);
		}
		blocks.push(lines.join("\n"));
	}
	return blocks.length ? blocks.join("\n\n") : noMatch;
}

