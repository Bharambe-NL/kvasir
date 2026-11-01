/**
 * data/kvasir.db (Kvasir P6-1, D106, D107, D110): open the database with
 * Node's built-in node:sqlite and create its tables on first open.
 *
 * Every table keeps each record as JSON exactly as the file backend holds
 * it, plus indexed key columns for lookups. Ledger tables keep append order
 * in `seq`. PRAGMA user_version is the schema version.
 */

import { DatabaseSync } from "node:sqlite";
import type { LedgerName } from "../backend.ts";

export const DB_FILE_NAME = "kvasir.db";
export const SCHEMA_VERSION = 1;

/** Each ledger's table and the record field its key column holds. */
export const LEDGER_TABLES: Record<LedgerName, { table: string; column: string; field: string }> = {
	nodes: { table: "nodes", column: "node_id", field: "id" },
	chains: { table: "chains", column: "chain_id", field: "id" },
	sessions: { table: "checkpoints", column: "chat_id", field: "chatId" },
	coverage: { table: "coverage", column: "chat_id", field: "chatId" },
	documents: { table: "documents", column: "version_id", field: "versionId" },
	citations: { table: "citations", column: "node_id", field: "nodeId" },
	reviews: { table: "reviews", column: "node_id", field: "nodeId" },
	questions: { table: "questions", column: "node_id", field: "nodeId" },
	exclusions: { table: "exclusions", column: "session_id", field: "sessionId" },
};

function schema(): string {
	const ledgers = Object.values(LEDGER_TABLES).map(
		({ table, column }) =>
			`CREATE TABLE IF NOT EXISTS ${table} (seq INTEGER PRIMARY KEY, ${column} TEXT, json TEXT NOT NULL);
			CREATE INDEX IF NOT EXISTS ${table}_${column} ON ${table} (${column});`,
	);
	return [
		...ledgers,
		`CREATE TABLE IF NOT EXISTS chats (id TEXT PRIMARY KEY, updated_at TEXT, json TEXT NOT NULL);`,
		`CREATE TABLE IF NOT EXISTS jobs (id TEXT PRIMARY KEY, chat_id TEXT, tool_call_id TEXT, json TEXT NOT NULL);
		CREATE INDEX IF NOT EXISTS jobs_chat_id ON jobs (chat_id);`,
		`CREATE TABLE IF NOT EXISTS document_units (version_id TEXT PRIMARY KEY, json TEXT NOT NULL);`,
		`CREATE TABLE IF NOT EXISTS singles (name TEXT PRIMARY KEY, json TEXT NOT NULL);`,
	].join("\n");
}

/** Open (and, unless read-only, create) the database. WAL lets the MCP
 *  server read while the app writes; busy_timeout waits out a short lock. */
export function openDatabase(file: string, opts: { readOnly?: boolean } = {}): DatabaseSync {
	const db = new DatabaseSync(file, { readOnly: opts.readOnly ?? false });
	db.exec("PRAGMA busy_timeout = 5000;");
	if (opts.readOnly) return db;
	db.exec("PRAGMA journal_mode = WAL;");
	const version = (db.prepare("PRAGMA user_version").get() as { user_version: number }).user_version;
	if (version > SCHEMA_VERSION) {
		db.close();
		throw new Error(`${file} has schema version ${version}, but this build understands only ${SCHEMA_VERSION}. Upgrade the app before opening this data.`);
	}
	db.exec(schema());
	if (version < SCHEMA_VERSION) db.exec(`PRAGMA user_version = ${SCHEMA_VERSION};`);
	return db;
}
