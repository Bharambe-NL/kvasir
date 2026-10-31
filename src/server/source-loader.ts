/**
 * The file SourceLoader (Kvasir P2, D062): reads a file Sagar picked,
 * detects its format (D058) and hashes its bytes. Detection:
 * - .pdf, or bytes starting "%PDF-": pdf
 * - .md or .markdown: markdown
 * - .html, .htm or .xhtml whose markup carries EUR-Lex's "oj-" classes:
 *   eurlex-html
 * Anything else is refused with UnsupportedSourceError.
 */

import { promises as fs } from "node:fs";
import * as path from "node:path";
import type { LoadedSource, SourceFormat } from "../core/contracts.ts";
import type { SourceLoader } from "../core/ports.ts";
import { contentHashOf } from "../core/source-ids.ts";

export class UnsupportedSourceError extends Error {
	constructor(filePath: string, reason: string) {
		super(`Unsupported source ${path.basename(filePath)}: ${reason}`);
		this.name = "UnsupportedSourceError";
	}
}

export function detectSourceFormat(filePath: string, bytes: Uint8Array): SourceFormat {
	const ext = path.extname(filePath).toLowerCase();
	const head = new TextDecoder().decode(bytes.subarray(0, 5));
	if (ext === ".pdf" || head === "%PDF-") return "pdf";
	if (ext === ".md" || ext === ".markdown") return "markdown";
	if (ext === ".html" || ext === ".htm" || ext === ".xhtml") {
		const text = new TextDecoder().decode(bytes);
		if (/class="oj-/.test(text)) return "eurlex-html";
		throw new UnsupportedSourceError(filePath, "only EUR-Lex HTML is supported, and this page has no EUR-Lex markup");
	}
	throw new UnsupportedSourceError(filePath, "supported formats are EUR-Lex HTML, PDF and Markdown");
}

export const fileSourceLoader: SourceLoader = {
	async load(filePath: string): Promise<LoadedSource> {
		const bytes = new Uint8Array(await fs.readFile(filePath));
		const format = detectSourceFormat(filePath, bytes);
		return { filePath, format, bytes, contentHash: contentHashOf(bytes) };
	},
};
