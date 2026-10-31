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
import type { SourceImportInput } from "../agent/subagents/extraction.ts";
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
		sourceId = fileSourceId(input.fileName);
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
