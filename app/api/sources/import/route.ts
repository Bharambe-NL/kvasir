/**
 * POST /api/sources/import: the sources door's transport (Kvasir P2-3,
 * D071). Multipart form data: "files" (EUR-Lex HTML, PDF, or Markdown sent
 * as a source) and, per file in the same order, an optional "labels" entry
 * (the version label for PDF and Markdown, D074). Each file is identified,
 * parsed, and extracted with a citation on every proposition; one result
 * per file, in the notes route's shape. A 3-wide worker pool, as there.
 */
import { extraction, importSourceFile, SourceImportError, UnsupportedSourceError } from "@/src/server";
import {
	ModelsNotConfiguredError,
	PROVIDER_KEY_MISSING_CODE,
	ProviderKeyMissingError,
	type EmissionStats,
} from "@/src/core";

export const dynamic = "force-dynamic";

interface SourceImportResult {
	requestIndex: number;
	outcome: "completed" | "failed" | "partial" | "aborted" | "busy" | "duplicate" | "unsupported";
	filePath: string;
	ok: boolean;
	stats?: EmissionStats;
	error?: string;
	code?: "models_not_configured" | (typeof PROVIDER_KEY_MISSING_CODE);
	missing?: string[];
	provider?: string;
	slots?: string[];
}

export async function POST(request: Request) {
	const form = await request.formData();
	const files = form.getAll("files").filter((f): f is File => f instanceof File);
	if (files.length === 0) {
		return Response.json({ results: [] as SourceImportResult[], error: "no files" }, { status: 400 });
	}
	const labels = form.getAll("labels").map((l) => (typeof l === "string" ? l : ""));

	const results: SourceImportResult[] = [];
	const queue = files.map((file, requestIndex) => ({ file, requestIndex }));
	const workers = Array.from({ length: Math.min(3, files.length) }, async () => {
		for (;;) {
			const next = queue.shift();
			if (!next) return;
			const { file, requestIndex } = next;
			try {
				const bytes = new Uint8Array(await file.arrayBuffer());
				const label = labels[requestIndex]?.trim() || undefined;
				const stats = await importSourceFile({ fileName: file.name, bytes, ...(label ? { label } : {}) }, (input) => extraction.importSource(input));
				results.push({ filePath: file.name, requestIndex, outcome: "completed", ok: true, stats });
			} catch (err) {
				if (err instanceof ModelsNotConfiguredError) {
					results.push({ filePath: file.name, requestIndex, ok: false, outcome: "failed", error: err.envelope.error, code: "models_not_configured", missing: err.envelope.missing });
					continue;
				}
				if (err instanceof ProviderKeyMissingError) {
					results.push({
						filePath: file.name, requestIndex, ok: false, outcome: "failed",
						error: err.envelope.error, code: PROVIDER_KEY_MISSING_CODE, provider: err.envelope.provider, slots: err.envelope.slots,
					});
					continue;
				}
				if (err instanceof UnsupportedSourceError) {
					results.push({ filePath: file.name, requestIndex, ok: false, outcome: "unsupported", error: err.message });
					continue;
				}
				results.push({
					filePath: file.name, requestIndex, ok: false,
					outcome: err instanceof SourceImportError ? err.outcome : "failed",
					...(err instanceof SourceImportError ? { stats: err.partialStats } : {}),
					error: err instanceof Error ? err.message : String(err),
				});
			}
		}
	});
	await Promise.all(workers);
	return Response.json({ results });
}
