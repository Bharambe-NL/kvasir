/**
 * PDF text as positioned lines for the sources door (Kvasir P2-2). The
 * pdf-reader's pdfExtract joins text runs with no line breaks, which loses
 * the numbering a guideline is addressed by; this keeps the lines. The
 * structure itself is read by core/source-parse/pdf.ts (pure).
 */

import { standardFontsDir } from "../agent/subagents/pdf-ops.ts";
import type { PdfPage } from "../core/source-parse/pdf.ts";

interface TextItem {
	str: string;
	transform: number[];
	width: number;
	hasEOL?: boolean;
}

const isTextItem = (it: unknown): it is TextItem =>
	typeof it === "object" && it !== null && typeof (it as TextItem).str === "string" && Array.isArray((it as TextItem).transform);

/** Every page's lines, top to bottom. A new line starts when the baseline
 *  moves or pdfjs marks an end of line; runs on one line are joined with a
 *  space when there is a visible gap between them. */
export async function pdfLines(bytes: Uint8Array): Promise<{ metadataTitle?: string; pages: PdfPage[] }> {
	const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
	const task = pdfjs.getDocument({ data: bytes.slice(), standardFontDataUrl: standardFontsDir(), verbosity: 0 });
	const doc = await task.promise;
	try {
		const pages: PdfPage[] = [];
		for (let n = 1; n <= doc.numPages; n++) {
			const page = await doc.getPage(n);
			const content = await page.getTextContent();
			const lines: string[] = [];
			let line = "";
			let lastY: number | null = null;
			let lastEnd = 0;
			for (const it of content.items) {
				if (!isTextItem(it)) continue;
				const x = it.transform[4]!;
				const y = it.transform[5]!;
				if (lastY !== null && Math.abs(y - lastY) > 2 && line.trim()) {
					lines.push(line.trim());
					line = "";
				}
				if (line && !/\s$/.test(line) && !/^\s/.test(it.str) && x - lastEnd > 1) line += " ";
				line += it.str;
				lastY = y;
				lastEnd = x + it.width;
				if (it.hasEOL && line.trim()) {
					lines.push(line.trim());
					line = "";
					lastY = null;
				}
			}
			if (line.trim()) lines.push(line.trim());
			pages.push({ page: n, lines: lines.map((l) => l.replace(/\s+/g, " ")) });
		}
		const info = (await doc.getMetadata().catch(() => null))?.info as { Title?: unknown } | undefined;
		const metadataTitle = typeof info?.Title === "string" && info.Title.trim() ? info.Title.trim() : undefined;
		return { ...(metadataTitle ? { metadataTitle } : {}), pages };
	} finally {
		await task.destroy();
	}
}
