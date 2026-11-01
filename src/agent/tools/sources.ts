import { Type } from "typebox";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import { serverExecute } from "../tool-execute.ts";
import type { DocumentVersion, SourceUnit } from "../../core/contracts/sources.ts";
import { labelUnits } from "../../core/source-extract.ts";
import { sourceLink } from "../../core/source-cite.ts";
import { citationLabel, documentShortName, shortPath, sourceDocuments, versionLabel } from "../../core/sources.ts";

/**
 * THE SOURCE TOOL (Kvasir P2-6, D085 to D087): read_source lets the teacher
 * read an imported source document's text by address or by words, each
 * paragraph with its citation link to copy into the lesson (D084).
 *
 * Read only by construction: the context carries read functions only, so
 * the agent holds no write path. Registered for the teacher alone, and only
 * when the graph tools are on (graphToolsEnabled). It reads the newest
 * version of each document, the current text.
 */

export interface SourceToolContext {
	readDocumentVersions: () => DocumentVersion[];
	readDocumentUnits: (versionId: string) => SourceUnit[] | null;
}

export const READ_SOURCE_LIMIT = 12;

const readSourceInput = Type.Object({
	document: Type.Optional(Type.String({ description: "Which document: words from its title or short name, or its CELEX number. Omit to search every imported document." })),
	address: Type.Optional(Type.String({ description: 'Where in it: for example "Art. 28", "Art. 28(2)", "Recital 12" or "3.3.3 para 17". Returns that unit and everything under it.' })),
	words: Type.Optional(Type.String({ description: "Words the paragraph must contain, all of them, in any case." })),
});

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

export function readSource(ctx: SourceToolContext, input: { document?: string; address?: string; words?: string }): string {
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

export function sourceTools(ctx: SourceToolContext): Record<string, AgentTool<any>> {
	return {
		read_source: {
			name: "read_source",
			label: "read_source",
			description:
				"Read the text of an imported source document (a regulation, guideline or paper) by address, such as " +
				"Art. 28(2), Recital 12 or 3.3.3 para 17, or by words it contains. Each paragraph comes with its citation " +
				"link; copy the link exactly into your lesson right after the point it supports.",
			parameters: readSourceInput,
			execute: serverExecute("read_source", readSourceInput, async (input): Promise<string> => readSource(ctx, input)),
		},
	};
}
