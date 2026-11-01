/**
 * The storage backend under the store adapters (Kvasir P6-1, D106 to D110).
 * The stores (graph.ts, chats.ts, jobs.ts, learner.ts) hold the logic:
 * shape guards, version stamps, merge rules, events. A backend only keeps
 * raw JSON values, in one of three forms:
 *   - ledgers: append-only lists of records, read back in append order
 *   - records: JSON documents keyed by id (chats, jobs, document units)
 *   - singles: one JSON document each (sources map, positions)
 * Two backends implement it: files (file-backend.ts, the layout the app
 * has always used) and SQLite (sqlite/backend.ts, data/kvasir.db). Values
 * go in and come out as the same JSON, so a store behaves the same on both.
 */

export const LEDGERS = ["nodes", "chains", "sessions", "coverage", "documents", "citations", "reviews", "questions", "exclusions"] as const;
export type LedgerName = (typeof LEDGERS)[number];

export const RECORD_KINDS = ["chats", "jobs", "units"] as const;
export type RecordKind = (typeof RECORD_KINDS)[number];

export const SINGLES = ["sources", "positions"] as const;
export type SingleName = (typeof SINGLES)[number];

export interface StoreBackend {
	/** "files" or "sqlite", for logs and the migration. */
	readonly kind: "files" | "sqlite";
	appendLine(ledger: LedgerName, record: unknown): void;
	/** Every parseable record, in append order. */
	readLines(ledger: LedgerName): unknown[];
	/** Replace the full contents of the given ledgers. Each ledger is
	 *  replaced atomically (files: temp and rename; SQLite: one transaction
	 *  for all of them). */
	replaceLedgers(next: Partial<Record<LedgerName, readonly unknown[]>>): void;
	/** The parsed record, or null when missing or unreadable. */
	getRecord(kind: RecordKind, id: string): unknown | null;
	putRecord(kind: RecordKind, id: string, value: unknown): void;
	/** False when there was nothing to delete. */
	deleteRecord(kind: RecordKind, id: string): boolean;
	recordIds(kind: RecordKind): string[];
	readSingle(name: SingleName): unknown | null;
	writeSingle(name: SingleName, value: unknown): void;
}

/** Ids become file names in the file backend, so both backends accept the
 *  same safe set (chats and jobs; units check their own form). */
export function assertRecordId(kind: RecordKind, id: string): void {
	const ok = kind === "units" ? /^ver_[0-9a-f]{12}$/.test(id) : /^[A-Za-z0-9_-]+$/.test(id);
	if (!ok) throw new Error(kind === "units" ? `invalid version id: ${id}` : `Invalid ${kind === "chats" ? "chat" : "job"} id: ${id}`);
}
