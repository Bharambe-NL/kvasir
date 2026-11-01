/**
 * The sources door's parse step (Kvasir P2-2): a loaded source into
 * addressable units, by format (D058). The entry point extraction uses in
 * P2-3, and importSourceFile, which identifies the version and hands the
 * parsed document to the extraction pipeline.
 */

import * as path from "node:path";
import type { LoadedSource, ParsedSource } from "../core/contracts.ts";
import { parseEurlex } from "../core/source-parse/eurlex.ts";
import { parseMarkdown } from "../core/source-parse/markdown.ts";
import { parsePdfLines } from "../core/source-parse/pdf.ts";
import { pdfLines } from "./source-pdf.ts";
import type { DocumentVersion } from "../core/contracts.ts";
import type { EmissionStats } from "../core/graph.ts";
import { actDateOf } from "../core/source-extract.ts";
import { contentHashOf, eurlexSourceId, fileSourceId, versionIdFor } from "../core/source-ids.ts";
import { SourceImportError, type SourceImportInput } from "../agent/subagents/extraction.ts";
import { sourceDocuments } from "../core/sources.ts";
import { stores } from "./stores.ts";
import { detectSourceFormat, UnsupportedSourceError } from "./source-loader.ts";

export async function parseSource(loaded: LoadedSource): Promise<ParsedSource> {
	const fileName = path.basename(loaded.filePath);
	switch (loaded.format) {
		case "eurlex-html":
			return parseEurlex(new TextDecoder().decode(loaded.bytes));
		case "markdown":
			return parseMarkdown(new TextDecoder().decode(loaded.bytes), fileName);
		case "pdf": {
			const { metadataTitle, pages } = await pdfLines(loaded.bytes);
			return parsePdfLines(pages, { ...(metadataTitle ? { metadataTitle } : {}), fileName });
		}
	}
}

/** One file sent to the sources door: its name, bytes, and the version
 *  label Sagar gave (PDF and Markdown, D074). */
export interface SourceFileInput {
	fileName: string;
	bytes: Uint8Array;
	label?: string;
	/** Kvasir P2-5 (D082): the id of an imported PDF or Markdown document this
	 *  file is a new version of. Ignored for EUR-Lex (the CELEX number decides). */
	versionOf?: string;
}

/** Detect, parse and identify one file, then run it through the sources
 *  door (Kvasir P2-3). EUR-Lex: the document id is the CELEX number and the
 *  version is the act's date (D060, D072). PDF and Markdown: the id is the
 *  file name and the version is the label, defaulting to the file name
 *  (D060, D074). Throws UnsupportedSourceError for a file that cannot be a
 *  source, and the pipeline's SourceImportError otherwise. */
export async function importSourceFile(
	input: SourceFileInput,
	importSource: (input: SourceImportInput) => Promise<EmissionStats>,
	now: () => string = () => new Date().toISOString(),
	existing: () => DocumentVersion[] = () => stores.graphStore.readDocumentVersions(),
): Promise<EmissionStats> {
	const format = detectSourceFormat(input.fileName, input.bytes);
	const loaded: LoadedSource = { filePath: input.fileName, format, bytes: input.bytes, contentHash: contentHashOf(input.bytes) };
	const parsed = await parseSource(loaded);
	if (!parsed.units.some((u) => u.text.trim())) throw new UnsupportedSourceError(input.fileName, "no text could be read from it");
	let sourceId: string;
	let versionFields: Pick<DocumentVersion, "celex" | "consolidatedAt" | "label">;
	if (format === "eurlex-html") {
		const date = actDateOf(parsed.title);
		if (!parsed.celex || !date) throw new UnsupportedSourceError(input.fileName, "its title has no act number and date to identify it");
		sourceId = eurlexSourceId(parsed.celex);
		versionFields = { celex: parsed.celex, consolidatedAt: date };
	} else {
		const target = input.versionOf?.trim();
		if (target) {
			// D082: a new version of an existing PDF or Markdown document.
			if (!existing().some((v) => v.sourceId === target && v.format === format)) {
				throw new SourceImportError("failed", { nodes: 0, chains: 0 }, "That document was not found.");
			}
			sourceId = target;
		} else {
			sourceId = fileSourceId(input.fileName);
		}
		versionFields = { label: input.label?.trim() || input.fileName };
	}
	const version: DocumentVersion = {
		sourceId,
		versionId: versionIdFor(sourceId, loaded.contentHash),
		format,
		title: parsed.title,
		...versionFields,
		contentHash: loaded.contentHash,
		filePath: input.fileName,
		importedAt: now(),
	};
	return importSource({ parsed, version });
}

/** One imported document as the import dialog lists it (D082). */
export interface SourceDocumentItem {
	id: string;
	title: string;
	format: DocumentVersion["format"];
	/** The latest version's label (PDF, Markdown) or consolidation date. */
	label: string;
	/** Every file name its versions were imported from. */
	fileNames: string[];
}

/** The imported documents, oldest first (GET /api/sources/documents). */
export function sourceDocumentList(): SourceDocumentItem[] {
	return sourceDocuments(stores.graphStore.readDocumentVersions()).map((d) => {
		const latest = d.versions.at(-1)!;
		return {
			id: d.id,
			title: d.title,
			format: d.format,
			label: latest.label ?? latest.consolidatedAt ?? latest.versionId,
			fileNames: [...new Set(d.versions.map((v) => v.filePath))],
		};
	});
}
