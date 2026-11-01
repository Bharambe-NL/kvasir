/**
 * GraphStore — the fs JSONL adapter: the append-only ledgers at
 * config.LEDGER_FILES (contracts.ts "v1 emission").
 *   nodes.jsonl     GraphNode        — one line per node write: the FIRST
 *                                      line for an id defines it; a later
 *                                      line with a REPEATED id is a
 *                                      link-append (session phrasings join
 *                                      aliases, provenance unions); reads
 *                                      merge by id (core/graph.ts getGraph)
 *   chains.jsonl    GraphChain       — one line per chain ASSERTION (a second
 *                                      session asserting the same
 *                                      (premises, conclusion) appends
 *                                      another line; readers merge)
 *   sessions.jsonl  SessionCheckpoint— emission checkpoints (foldedAt)
 *   coverage.jsonl  CoverageEntry    — per-message extraction coverage
 *
 * CHAINS-PRIMARY (owner, 2026-09-30): there is NO edges ledger — the edge
 * view (implication nodes + untyped arrows) is derived in core/graph.ts on
 * every read and never persisted. A stale edges.jsonl left by a pre-chains
 * build is deleted once, here, at adapter load (same doctrine as the
 * events-ledger purge below).
 *
 * Plus config.SOURCES_FILE (sources.json): the imported-notes bookkeeping
 * (NOT a ledger) — one JSON map, src-id → NotesSource, read-modify-write
 * like a chat file. The format-agnostic front door (2026-09-13).
 *
 * Implements core/ports.ts GraphStore. data/graph/* is exclusively this
 * adapter's. Reads are strict against the contracts.ts shapes (the 2026-09-02
 * graph redesign): corrupt lines are skipped, never guessed at — the ledgers
 * are the source of truth and everything else is derived (core/graph.ts,
 * which takes this port as a parameter). Same idioms as src/store/chats.ts:
 * sync, no framework.
 *
 * Kvasir P6-1: the logic here runs over a StoreBackend (backend.ts), so the
 * same store works on the files above (file-backend.ts, the `graphStore`
 * export) and on SQLite (createGraphStore(sqliteBackend(...))).
 */

import { assertGraphFormat, ensureGraphFormat } from "./graph-format.ts";
import type {
	GraphChain,
	GraphNode,
	ExtractionRunUsage,
	NotesSource,
	Position,
	ProvenancePoint,
	CoverageEntry,
	SessionCheckpoint,
	Citation,
	DocumentVersion,
	SourceUnit,
} from "../core/contracts.ts";
import { isCitation, isDocumentVersion } from "../core/contracts.ts";
import type { GraphStore } from "../core/ports.ts";
import { assertRecordId, type LedgerName, type StoreBackend } from "./backend.ts";
import { fileBackend } from "./file-backend.ts";
import { assertUnlocked } from "./data-key.ts";
import { encryptionLayer } from "./encrypted-backend.ts";

function isRecord(v: unknown): v is Record<string, unknown> {
	return typeof v === "object" && v !== null;
}

const isString = (v: unknown): v is string => typeof v === "string";

/** Provenance points are (chatId, messageId) pairs — message-granular. */
const isProvenancePoint = (v: unknown): v is ProvenancePoint =>
	isRecord(v) && isString(v.chatId) && isString(v.messageId);


const isGraphNode = (v: unknown): v is GraphNode =>
	isRecord(v) &&
	isString(v.id) &&
	isString(v.name) &&
	isString(v.statement) &&
	Array.isArray(v.aliases) &&
	v.aliases.every(isString) &&
	isString(v.createdAt) &&
	Array.isArray(v.provenance) &&
	v.provenance.every(isProvenancePoint);

/** A chain line: premises ≥ 1 (a chain IS an argument — bare propositions
 *  ride the node ledger alone), every member a string, conclusion a string.
 *  Endpoint EXISTENCE is the derivation's concern (it drops dangling
 *  chains); the store only shapes. */
const isGraphChain = (v: unknown): v is GraphChain =>
	isRecord(v) &&
	isString(v.id) &&
	Array.isArray(v.premises) &&
	v.premises.length > 0 &&
	v.premises.every(isString) &&
	isString(v.conclusion) &&
	Array.isArray(v.provenance) &&
	v.provenance.every(isProvenancePoint) &&
	isString(v.createdAt);

const isCheckpoint = (v: unknown): v is SessionCheckpoint =>
	isRecord(v) && isString(v.chatId) && isString(v.foldedAt);

const isCoverageEntry = (v: unknown): v is CoverageEntry =>
	isRecord(v) && isString(v.chatId) && isString(v.fp) && typeof v.tokens === "number" && isString(v.foldedAt);

const isSourceUnit = (v: unknown): v is SourceUnit =>
	isRecord(v) &&
	Array.isArray(v.path) &&
	v.path.length > 0 &&
	v.path.every(isString) &&
	isString(v.text) &&
	(v.heading === undefined || isString(v.heading)) &&
	(v.page === undefined || typeof v.page === "number");

const isPosition = (v: unknown): v is Position =>
	isRecord(v) && typeof v.x === "number" && Number.isFinite(v.x) && typeof v.y === "number" && Number.isFinite(v.y);

const isNotesSource = (v: unknown): v is NotesSource =>
	isRecord(v) && isString(v.id) && isString(v.filePath) && isString(v.importedAt);

// ─── the port implementation ────────────────────────────────────────────────

export function createGraphStore(backend: StoreBackend): GraphStore {
	const append = (ledger: LedgerName, record: unknown) => {
		assertUnlocked(); // never stamp a locked folder (P6-6)
		ensureGraphFormat(); // the lazy format stamp (graph-format.ts)
		backend.appendLine(ledger, record);
	};
	/** Strict shape guards — anything not matching a W4 ledger shape is skipped. */
	const readValid = <T>(ledger: LedgerName, isValid: (v: unknown) => v is T): T[] => {
		assertGraphFormat(); // honest refusal on a newer-stamped data dir
		return backend.readLines(ledger).filter(isValid);
	};
	const unitsCache = new Map<string, SourceUnit[]>();

	/** sources.json — { id: NotesSource }. Read-modify-write, NOT append-only:
	 *  the usage log lives inside the record (like a chat's JSON file). */
	const readSourceMap = (): Record<string, NotesSource> => {
		assertGraphFormat(); // honest refusal on a newer-stamped data dir
		const parsed = backend.readSingle("sources");
		if (!isRecord(parsed)) return {};
		const out: Record<string, NotesSource> = {};
		for (const [id, value] of Object.entries(parsed)) {
			if (isNotesSource(value)) out[id] = value;
		}
		return out;
	};
	const writeSourceMap = (map: Record<string, NotesSource>) => {
		assertUnlocked(); // never stamp a locked folder (P6-6)
		ensureGraphFormat(); // the lazy format stamp (graph-format.ts)
		backend.writeSingle("sources", map);
	};

	return {
		appendNode(node: GraphNode): void {
			append("nodes", node);
		},
		/** Raw node lines in append order. A node id may appear on more than
		 *  one line (a later session's LINK-append: phrasings + provenance); the
		 *  derivation (core/graph.ts getGraph) merges lines by id. */
		readNodes(): GraphNode[] {
			return readValid("nodes", isGraphNode);
		},

		/** Append one chain ASSERTION; readers merge lines by (premises,
		 *  conclusion). */
		appendChain(assertion: GraphChain): void {
			append("chains", assertion);
		},
		readChains(): GraphChain[] {
			return readValid("chains", isGraphChain);
		},

		appendCheckpoint(checkpoint: SessionCheckpoint): void {
			append("sessions", checkpoint);
		},
		readCheckpoints(): SessionCheckpoint[] {
			return readValid("sessions", isCheckpoint);
		},

		appendCoverage(entry: CoverageEntry): void {
			append("coverage", entry);
		},
		readCoverage(): CoverageEntry[] {
			return readValid("coverage", isCoverageEntry);
		},

		appendDocumentVersion(version: DocumentVersion): void {
			append("documents", version);
		},
		readDocumentVersions(): DocumentVersion[] {
			return readValid("documents", isDocumentVersion);
		},
		appendCitation(citation: Citation): void {
			append("citations", citation);
		},
		readCitations(): Citation[] {
			return readValid("citations", isCitation);
		},
		writeDocumentUnits(versionId: string, units: SourceUnit[]): void {
			assertRecordId("units", versionId); // a version id is "ver_" + 12 hex
			if (backend.getRecord("units", versionId) !== null) return; // written once, never changed (D076)
			assertUnlocked();
			ensureGraphFormat();
			backend.putRecord("units", versionId, { versionId, units });
		},
		readDocumentUnits(versionId: string): SourceUnit[] | null {
			assertGraphFormat();
			// The units never change once written (D076), so a read is cached;
			// a missing one is not cached (it may be written later).
			const cached = unitsCache.get(versionId);
			if (cached) return cached;
			const parsed = backend.getRecord("units", versionId);
			if (!isRecord(parsed) || !Array.isArray(parsed.units)) return null;
			const units = parsed.units.filter(isSourceUnit);
			unitsCache.set(versionId, units);
			return units;
		},

		// ── imported-notes bookkeeping (config.SOURCES_FILE — a JSON map) ──

		/** Upsert: keeps the existing record's usage log when re-importing. */
		upsertSource(source: NotesSource): void {
			const all = readSourceMap();
			const prev = all[source.id];
			all[source.id] = prev ? { ...source, extractions: prev.extractions } : source;
			writeSourceMap(all);
		},
		readSources(): NotesSource[] {
			return Object.values(readSourceMap());
		},
		/** Idempotent per startedAt — same discipline as chats.appendExtractionUsage. */
		appendSourceUsage(id: string, entry: ExtractionRunUsage): void {
			const all = readSourceMap();
			const source = all[id];
			if (!source) return; // no such source — nothing to bill against
			source.extractions = source.extractions?.some((r) => r.startedAt === entry.startedAt)
				? source.extractions
				: [...(source.extractions ?? []), entry];
			writeSourceMap(all);
		},

		// ── the layout ledger (config.POSITIONS_FILE): { positions, updatedAt }.
		// Read-modify-write, NOT append-only: the settle is a full-graph
		// computation, so it replaces the whole map. The updatedAt stamp exists
		// for future live-physics conflict handling; reads just return the map.
		readPositions(): Record<string, Position> {
			const parsed = backend.readSingle("positions");
			if (!isRecord(parsed) || !isRecord(parsed.positions)) return {};
			const out: Record<string, Position> = {};
			for (const [id, value] of Object.entries(parsed.positions)) {
				if (isPosition(value)) out[id] = { x: value.x, y: value.y };
			}
			return out;
		},
		writePositions(positions: Record<string, Position>): void {
			backend.writeSingle("positions", { positions, updatedAt: new Date().toISOString() });
		},

		/** THE DESTRUCTIVE SEAM (wave 6 session deletion): atomic full-content
		 *  replacement per provided ledger (files: temp file renamed over the
		 *  ledger; SQLite: one transaction). Empty arrays leave an empty
		 *  ledger — a purged ledger reads as "nothing yet", same as
		 *  never-emitted. */
		rewriteLedgers(next: {
			nodes?: GraphNode[];
			chains?: GraphChain[];
			coverage?: CoverageEntry[];
			checkpoints?: SessionCheckpoint[];
		}): void {
			const { checkpoints, ...rest } = next;
			backend.replaceLedgers({ ...rest, ...(checkpoints ? { sessions: checkpoints } : {}) });
		},
	};
}

/** The file-backed store (data/graph/), as wired before P6-1. */
export const graphStore: GraphStore = createGraphStore(encryptionLayer(fileBackend));
