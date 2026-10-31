/**
 * The sources door's parse step (Kvasir P2-2): a loaded source into
 * addressable units, by format (D058). The entry point extraction uses in
 * P2-3. Reads only; nothing is written.
 */

import * as path from "node:path";
import type { LoadedSource, ParsedSource } from "../core/contracts.ts";
import { parseEurlex } from "../core/source-parse/eurlex.ts";
import { parseMarkdown } from "../core/source-parse/markdown.ts";
import { parsePdfLines } from "../core/source-parse/pdf.ts";
import { pdfLines } from "./source-pdf.ts";

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
