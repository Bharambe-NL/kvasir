/**
 * Source documents and citations (Kvasir P2, regulation grounding).
 *
 * A source document is a regulation, guideline or paper imported through
 * the sources front door. Each import of a document is one VERSION line in
 * data/graph/documents.jsonl; the document itself is derived by grouping
 * lines by sourceId (core/sources.ts sourceDocuments). Every proposition
 * taken from a source carries a CITATION line in data/graph/citations.jsonl
 * that points to the exact unit and version it came from (D059).
 *
 * Both ledgers are append-only and live in the graph store (D063): they are
 * part of the objective world model, never learner state. Only the merger
 * side writes them. Nodes from a source carry provenance { chatId: "doc_…" },
 * so a document is a birth session like a chat or a notes import ("src_…").
 */

/** The formats the sources door reads in P2 (D058). */
export type SourceFormat = "eurlex-html" | "pdf" | "markdown";

export const SOURCE_FORMATS: readonly SourceFormat[] = ["eurlex-html", "pdf", "markdown"];

/** One imported version of a source document, as stored: one line of
 *  data/graph/documents.jsonl. */
export interface DocumentVersion {
	/** "doc_" + a hash of the CELEX number (EUR-Lex), or of the file path at
	 *  first import (other files). A later version reuses its document's id. */
	sourceId: string;
	/** "ver_" + a hash of sourceId and contentHash: the same content
	 *  re-imported is the same version. */
	versionId: string;
	format: SourceFormat;
	/** The document's title as read from the file. */
	title: string;
	/** EUR-Lex only (D060): the CELEX number, for example "32022R2554". */
	celex?: string;
	/** EUR-Lex only (D060): the consolidation date, YYYY-MM-DD. */
	consolidatedAt?: string;
	/** Other files only (D060): the label Sagar gives at import. */
	label?: string;
	/** sha256 of the imported file's bytes, hex. */
	contentHash: string;
	/** Where the file was imported from (shown, never re-read). */
	filePath: string;
	/** ISO timestamp of the import. */
	importedAt: string;
}

/** A source document: its versions, grouped and ordered (derived, never
 *  stored). */
export interface SourceDocument {
	id: string;
	format: SourceFormat;
	/** The latest version's title. */
	title: string;
	celex?: string;
	/** Oldest first: by consolidation date for EUR-Lex, otherwise by import
	 *  time. */
	versions: DocumentVersion[];
}

/** One citation, as stored: one line of data/graph/citations.jsonl (D059).
 *  The quote appears verbatim in the unit `path` addresses, in that
 *  version. */
export interface Citation {
	/** "cit_" + nanoid-like. */
	id: string;
	/** The proposition (graph node) the citation supports. */
	nodeId: string;
	sourceId: string;
	/** The versionId the quote was taken from. */
	version: string;
	/** The unit address, outermost first, for example
	 *  ["Article 28", "paragraph 2", "point (a)"]. */
	path: string[];
	quote: string;
	/** ISO timestamp of the merge that wrote it. */
	createdAt: string;
}

const nonEmpty = (x: unknown): x is string => typeof x === "string" && x.trim().length > 0;
const isIso = (x: unknown): x is string => typeof x === "string" && !Number.isNaN(Date.parse(x));
const isDay = (x: unknown): x is string => typeof x === "string" && /^\d{4}-\d{2}-\d{2}$/.test(x) && !Number.isNaN(Date.parse(x));

/** Strict shape guard for one stored document version line. A EUR-Lex
 *  version needs its CELEX number and consolidation date; any other version
 *  needs its label (D060). */
export function isDocumentVersion(value: unknown): value is DocumentVersion {
	if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
	const v = value as Record<string, unknown>;
	if (!(nonEmpty(v.sourceId) && v.sourceId.startsWith("doc_"))) return false;
	if (!(nonEmpty(v.versionId) && v.versionId.startsWith("ver_"))) return false;
	if (typeof v.format !== "string" || !(SOURCE_FORMATS as readonly string[]).includes(v.format)) return false;
	if (!nonEmpty(v.title) || !nonEmpty(v.filePath) || !isIso(v.importedAt)) return false;
	if (typeof v.contentHash !== "string" || !/^[0-9a-f]{64}$/.test(v.contentHash)) return false;
	if (v.format === "eurlex-html") return nonEmpty(v.celex) && isDay(v.consolidatedAt);
	return nonEmpty(v.label);
}

/** Strict shape guard for one stored citation line. */
export function isCitation(value: unknown): value is Citation {
	if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
	const v = value as Record<string, unknown>;
	return (
		nonEmpty(v.id) &&
		nonEmpty(v.nodeId) &&
		nonEmpty(v.sourceId) &&
		nonEmpty(v.version) &&
		Array.isArray(v.path) &&
		v.path.length > 0 &&
		v.path.every(nonEmpty) &&
		nonEmpty(v.quote) &&
		isIso(v.createdAt)
	);
}
