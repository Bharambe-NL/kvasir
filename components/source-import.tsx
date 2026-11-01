"use client";
/**
 * The sources door in the import button (Kvasir P2-3, D071, D074, D075).
 * Files are sorted by type:
 * - .xhtml, .html: EUR-Lex, straight to POST /api/sources/import.
 * - .pdf: a source; the dialog asks for its version label first.
 * - .md, .markdown: notes by default; the dialog asks for a label and has a
 *   "Cite as source" toggle that sends it through the sources door instead.
 * - anything else: notes, as before.
 */
import { createPortal } from "react-dom";
import { MenuSelect, Toggle } from "@/components/settings/controls";

/** What the import buttons accept (notes plus the sources door). */
export const IMPORT_ACCEPT = ".md,.markdown,.txt,.pdf,.xhtml,.html";

export type ImportKind = "notes" | "eurlex" | "pdf" | "markdown";

export function importKindOf(name: string): ImportKind {
	const ext = name.toLowerCase().split(".").pop() ?? "";
	if (ext === "xhtml" || ext === "html" || ext === "htm") return "eurlex";
	if (ext === "pdf") return "pdf";
	if (ext === "md" || ext === "markdown") return "markdown";
	return "notes";
}

/** One file waiting in the dialog. */
export interface PendingSourceFile {
	file: File;
	kind: "pdf" | "markdown";
	label: string;
	/** Markdown only: send it through the sources door (D075). */
	asSource: boolean;
	/** Kvasir P2-5 (D082): the document this file is a new version of; "" for
	 *  a new document. */
	versionOf: string;
}

/** An imported document, as GET /api/sources/documents lists it. */
export interface ImportedDocument {
	id: string;
	title: string;
	format: "eurlex-html" | "pdf" | "markdown";
	label: string;
	fileNames: string[];
}

/** A selection split for the two routes, once the dialog (if any) is done. */
export interface ImportPlan {
	notes: File[];
	sources: { file: File; label?: string; versionOf?: string }[];
}

/** Split a selection: what goes straight through, and what the dialog asks
 *  about (D074: labels prefilled with the file name). */
export function planImport(files: readonly File[]): { ready: ImportPlan; pending: PendingSourceFile[] } {
	const ready: ImportPlan = { notes: [], sources: [] };
	const pending: PendingSourceFile[] = [];
	for (const file of files) {
		const kind = importKindOf(file.name);
		if (kind === "notes") ready.notes.push(file);
		else if (kind === "eurlex") ready.sources.push({ file });
		else pending.push({ file, kind, label: file.name, asSource: kind === "pdf", versionOf: "" });
	}
	return { ready, pending };
}

/** The documents a pending file may be a new version of (same format), and
 *  the preselection: a document whose earlier file names include this one
 *  (D082). */
export function versionChoices(p: Pick<PendingSourceFile, "file" | "kind">, docs: readonly ImportedDocument[]): ImportedDocument[] {
	return docs.filter((d) => d.format === p.kind);
}
export function preselectVersions(pending: readonly PendingSourceFile[], docs: readonly ImportedDocument[]): PendingSourceFile[] {
	return pending.map((p) => {
		const match = versionChoices(p, docs).find((d) => d.fileNames.includes(p.file.name));
		return match ? { ...p, versionOf: match.id } : p;
	});
}

/** The dialog's answers folded into the plan. */
export function resolvePending(ready: ImportPlan, pending: readonly PendingSourceFile[]): ImportPlan {
	const plan: ImportPlan = { notes: [...ready.notes], sources: [...ready.sources] };
	for (const p of pending) {
		if (p.kind === "markdown" && !p.asSource) plan.notes.push(p.file);
		else plan.sources.push({ file: p.file, label: p.label.trim() || p.file.name, ...(p.versionOf ? { versionOf: p.versionOf } : {}) });
	}
	return plan;
}

export interface SourceImportResult {
	requestIndex: number;
	filePath: string;
	ok: boolean;
	outcome: "completed" | "failed" | "partial" | "aborted" | "busy" | "duplicate" | "unsupported";
	error?: string;
	code?: string;
	missing?: string[];
	provider?: string;
	slots?: string[];
}

export async function postSourcesImport(sources: readonly { file: File; label?: string; versionOf?: string }[]): Promise<SourceImportResult[]> {
	const form = new FormData();
	for (const s of sources) {
		form.append("files", s.file);
		form.append("labels", s.label ?? "");
		form.append("versionOf", s.versionOf ?? "");
	}
	const response = await fetch("/api/sources/import", { method: "POST", body: form });
	let body: unknown;
	try {
		body = await response.json();
	} catch {
		throw new Error("Invalid import response. Please retry the file.");
	}
	if (!response.ok || !body || typeof body !== "object" || !("results" in body) || !Array.isArray(body.results) || body.results.length !== sources.length) {
		const detail = body && typeof body === "object" && "error" in body && typeof body.error === "string" ? `: ${body.error}` : "";
		throw new Error(`Import request failed (HTTP ${response.status})${detail}. Please retry the file.`);
	}
	return body.results as SourceImportResult[];
}

export function SourceImportDialog({
	pending,
	documents = [],
	onChange,
	onImport,
	onCancel,
}: {
	pending: readonly PendingSourceFile[];
	/** Imported documents, for the "Version of" choice (D082). */
	documents?: readonly ImportedDocument[];
	onChange: (index: number, next: PendingSourceFile) => void;
	onImport: () => void;
	onCancel: () => void;
}) {
	if (pending.length === 0 || typeof document === "undefined") return null;
	return createPortal(
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80" onKeyDown={(e) => e.key === "Escape" && onCancel()}>
			<div role="dialog" aria-modal="true" data-testid="source-import-dialog" className="settings-dialog-pop w-[32rem] max-w-[calc(100vw-2rem)] rounded-xl border bg-card p-6 shadow-xl">
				{pending.map((p, i) => (
					<div key={`${p.file.name}-${i}`} data-testid="source-import-row" className={i > 0 ? "mt-4 border-t border-border/60 pt-4" : ""}>
						<code className="font-mono text-sm text-foreground">{p.file.name}</code>
						<label className="mt-3 block text-sm text-muted-foreground">
							Version label
							<input
								data-testid="source-import-label"
								value={p.label}
								onChange={(e) => onChange(i, { ...p, label: e.target.value })}
								className="mt-1.5 block h-8 w-full rounded-md border border-border bg-background px-2.5 text-control text-foreground outline-none focus:border-muted-foreground/50"
							/>
						</label>
						{(p.kind === "pdf" || p.asSource) && (
							<div className="mt-3 text-sm text-muted-foreground">
								<span className="mb-1.5 block">Version of</span>
								<MenuSelect<string>
									wide
									value={p.versionOf}
									ariaLabel="Version of"
									testid={`source-import-version-of-${i}`}
									onChange={(v) => onChange(i, { ...p, versionOf: v })}
									options={[{ value: "", label: "A new document" }, ...versionChoices(p, documents).map((d) => ({ value: d.id, label: d.label }))]}
								/>
							</div>
						)}
						{p.kind === "markdown" && (
							<div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
								<span>Cite as source</span>
								<Toggle checked={p.asSource} label="Cite as source" onChange={(on) => onChange(i, { ...p, asSource: on })} />
							</div>
						)}
					</div>
				))}
				<div className="mt-6 flex justify-end gap-2">
					<button type="button" data-testid="source-import-cancel" onClick={onCancel} className="h-8 rounded-md px-3 text-control text-muted-foreground transition-colors hover:text-foreground">
						Cancel
					</button>
					<button type="button" data-testid="source-import-confirm" onClick={onImport} className="h-8 rounded-md border border-border bg-background px-3 text-control text-foreground transition-colors hover:bg-accent">
						Import
					</button>
				</div>
			</div>
		</div>,
		document.body,
	);
}
