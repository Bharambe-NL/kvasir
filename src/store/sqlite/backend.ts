/**
 * The SQLite backend (Kvasir P6-1, D106 to D110): StoreBackend over
 * data/kvasir.db. Values are stored as JSON text and parsed on read, so a
 * store gets back exactly what the file backend would give it.
 */

import type { DatabaseSync } from "node:sqlite";
import { assertRecordId, type LedgerName, type RecordKind, type StoreBackend } from "../backend.ts";
import { LEDGER_TABLES } from "./db.ts";

const RECORD_TABLES: Record<RecordKind, { table: string; id: string }> = {
	chats: { table: "chats", id: "id" },
	jobs: { table: "jobs", id: "id" },
	units: { table: "document_units", id: "version_id" },
};

const parse = (json: string): unknown | null => {
	try {
		return JSON.parse(json);
	} catch {
		return null;
	}
};

const field = (value: unknown, key: string): string | null => {
	const v = typeof value === "object" && value !== null ? (value as Record<string, unknown>)[key] : undefined;
	return typeof v === "string" ? v : null;
};

/** Run `fn` in one transaction; roll back on any throw. */
function inTransaction(db: DatabaseSync, fn: () => void): void {
	db.exec("BEGIN IMMEDIATE");
	try {
		fn();
		db.exec("COMMIT");
	} catch (err) {
		db.exec("ROLLBACK");
		throw err;
	}
}

export function sqliteBackend(db: DatabaseSync): StoreBackend {
	const insertLine = (ledger: LedgerName, record: unknown) => {
		const { table, column, field: key } = LEDGER_TABLES[ledger];
		db.prepare(`INSERT INTO ${table} (${column}, json) VALUES (?, ?)`).run(field(record, key), JSON.stringify(record));
	};
	return {
		kind: "sqlite",
		appendLine(ledger, record) {
			insertLine(ledger, record);
		},
		readLines(ledger) {
			const { table } = LEDGER_TABLES[ledger];
			const rows = db.prepare(`SELECT json FROM ${table} ORDER BY seq`).all() as { json: string }[];
			return rows.map((r) => parse(r.json)).filter((v) => v !== null);
		},
		replaceLedgers(next) {
			inTransaction(db, () => {
				for (const [ledger, records] of Object.entries(next) as [LedgerName, readonly unknown[]][]) {
					db.exec(`DELETE FROM ${LEDGER_TABLES[ledger].table}`);
					for (const record of records) insertLine(ledger, record);
				}
			});
		},
		getRecord(kind, id) {
			try {
				assertRecordId(kind, id);
			} catch {
				return null;
			}
			const { table, id: col } = RECORD_TABLES[kind];
			const row = db.prepare(`SELECT json FROM ${table} WHERE ${col} = ?`).get(id) as { json: string } | undefined;
			return row ? parse(row.json) : null;
		},
		putRecord(kind, id, value) {
			assertRecordId(kind, id);
			const json = JSON.stringify(value);
			if (kind === "chats") {
				db.prepare("INSERT INTO chats (id, updated_at, json) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET updated_at = excluded.updated_at, json = excluded.json").run(id, field(value, "updatedAt"), json);
			} else if (kind === "jobs") {
				db.prepare("INSERT INTO jobs (id, chat_id, tool_call_id, json) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET chat_id = excluded.chat_id, tool_call_id = excluded.tool_call_id, json = excluded.json").run(id, field(value, "chatId"), field(value, "toolCallId"), json);
			} else {
				db.prepare("INSERT INTO document_units (version_id, json) VALUES (?, ?) ON CONFLICT(version_id) DO UPDATE SET json = excluded.json").run(id, json);
			}
		},
		deleteRecord(kind, id) {
			try {
				assertRecordId(kind, id);
			} catch {
				return false;
			}
			const { table, id: col } = RECORD_TABLES[kind];
			return Number(db.prepare(`DELETE FROM ${table} WHERE ${col} = ?`).run(id).changes) > 0;
		},
		recordIds(kind) {
			const { table, id: col } = RECORD_TABLES[kind];
			return (db.prepare(`SELECT ${col} AS id FROM ${table} ORDER BY ${col}`).all() as { id: string }[]).map((r) => r.id);
		},
		readSingle(name) {
			const row = db.prepare("SELECT json FROM singles WHERE name = ?").get(name) as { json: string } | undefined;
			return row ? parse(row.json) : null;
		},
		writeSingle(name, value) {
			db.prepare("INSERT INTO singles (name, json) VALUES (?, ?) ON CONFLICT(name) DO UPDATE SET json = excluded.json").run(name, JSON.stringify(value));
		},
	};
}
