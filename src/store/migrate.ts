/**
 * Moving the data folder between the file and SQLite backends (Kvasir P6-1,
 * D109). Run with the app closed, through scripts/migrate-store.ts.
 *
 *   toSqlite: copy every ledger line, record and single from the files into
 *     a new database (written as kvasir.db.partial, renamed when checked),
 *     check both sides read the same, then move the migrated files into
 *     data/pre-sqlite-<stamp>/.
 *   toFiles: the reverse. Write the files, check, then move kvasir.db and
 *     its -wal and -shm files into data/pre-files-<stamp>/.
 *
 * Values are copied as raw JSON, below the stores, so nothing is
 * reinterpreted on the way. Nothing is deleted: the old side is moved
 * aside. Settings, auth.json, prompt overrides, render settings and the
 * graph format stamp are never touched.
 */

import fs from "node:fs";
import * as path from "node:path";
import { PATHS } from "../../config.ts";
import { LEDGERS, RECORD_KINDS, SINGLES, type StoreBackend } from "./backend.ts";
import { DB_FILE } from "./active.ts";
import { fileBackend, LEDGER_PATHS, RECORD_DIRS, SINGLE_PATHS } from "./file-backend.ts";
import { sqliteBackend } from "./sqlite/backend.ts";
import { openDatabase } from "./sqlite/db.ts";

export interface MigrationReport {
	direction: "sqlite" | "files";
	/** Where the old side was moved. */
	movedTo: string;
	/** Ledger name to records copied; record kind to records copied. */
	ledgers: Record<string, number>;
	records: Record<string, number>;
	singles: string[];
	/** Ledger lines that were not JSON and were left behind in the moved files. */
	skippedLines: Record<string, number>;
}

const pad = (n: number) => String(n).padStart(2, "0");
export function migrationStamp(now: Date): string {
	return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

/** Every path the file backend owns, which the migration moves as a set. */
function filePaths(): string[] {
	return [...Object.values(LEDGER_PATHS), ...Object.values(RECORD_DIRS), ...Object.values(SINGLE_PATHS)];
}

function nonEmptyLines(file: string): number {
	try {
		return fs.readFileSync(file, "utf8").split("\n").filter((l) => l.trim().length > 0).length;
	} catch {
		return 0;
	}
}

/** Copy every value from one backend to the other and return the counts. */
function copyAll(from: StoreBackend, to: StoreBackend, opts: { skipEmptyLedgers: boolean }): Pick<MigrationReport, "ledgers" | "records" | "singles"> {
	const ledgers: Record<string, number> = {};
	const records: Record<string, number> = {};
	const singles: string[] = [];
	for (const ledger of LEDGERS) {
		const lines = from.readLines(ledger);
		ledgers[ledger] = lines.length;
		if (lines.length > 0 || !opts.skipEmptyLedgers) to.replaceLedgers({ [ledger]: lines });
	}
	for (const kind of RECORD_KINDS) {
		let n = 0;
		for (const id of from.recordIds(kind)) {
			const value = from.getRecord(kind, id);
			if (value === null) continue;
			to.putRecord(kind, id, value);
			n++;
		}
		records[kind] = n;
	}
	for (const name of SINGLES) {
		const value = from.readSingle(name);
		if (value === null) continue;
		to.writeSingle(name, value);
		singles.push(name);
	}
	return { ledgers, records, singles };
}

/** Both backends read the same values, in the same order. */
function assertSame(a: StoreBackend, b: StoreBackend): void {
	const same = (x: unknown, y: unknown, what: string) => {
		if (JSON.stringify(x) !== JSON.stringify(y)) throw new Error(`Migration check failed: ${what} differs between ${a.kind} and ${b.kind}. Nothing was moved.`);
	};
	for (const ledger of LEDGERS) same(a.readLines(ledger), b.readLines(ledger), `ledger ${ledger}`);
	for (const kind of RECORD_KINDS) {
		const ids = a.recordIds(kind).filter((id) => a.getRecord(kind, id) !== null).sort();
		same(ids, [...b.recordIds(kind)].sort(), `${kind} ids`);
		for (const id of ids) same(a.getRecord(kind, id), b.getRecord(kind, id), `${kind} ${id}`);
	}
	for (const name of SINGLES) same(a.readSingle(name), b.readSingle(name), name);
}

/** Move each existing path into `dir`, keeping its place under data/. */
function moveAside(paths: readonly string[], dir: string): void {
	for (const p of paths) {
		if (!fs.existsSync(p)) continue;
		const target = path.join(dir, path.relative(PATHS.data, p));
		fs.mkdirSync(path.dirname(target), { recursive: true });
		fs.renameSync(p, target);
	}
}

export function migrateToSqlite(now: Date = new Date()): MigrationReport {
	if (fs.existsSync(DB_FILE)) throw new Error(`${DB_FILE} already exists: this data folder is already on SQLite.`);
	const partial = `${DB_FILE}.partial`;
	for (const f of [partial, `${partial}-wal`, `${partial}-shm`]) fs.rmSync(f, { force: true }); // a crashed earlier attempt
	const db = openDatabase(partial);
	const sqlite = sqliteBackend(db);
	let counts: ReturnType<typeof copyAll>;
	try {
		db.exec("BEGIN IMMEDIATE");
		counts = copyAll(fileBackend, sqlite, { skipEmptyLedgers: false });
		db.exec("COMMIT");
		assertSame(fileBackend, sqlite);
	} catch (err) {
		if (db.isTransaction) db.exec("ROLLBACK");
		db.close();
		for (const f of [partial, `${partial}-wal`, `${partial}-shm`]) fs.rmSync(f, { force: true });
		throw err;
	}
	db.exec("PRAGMA wal_checkpoint(TRUNCATE);");
	db.close();
	const skippedLines: Record<string, number> = {};
	for (const ledger of LEDGERS) {
		const skipped = nonEmptyLines(LEDGER_PATHS[ledger]) - counts.ledgers[ledger]!;
		if (skipped > 0) skippedLines[ledger] = skipped;
	}
	fs.renameSync(partial, DB_FILE);
	for (const f of ["-wal", "-shm"]) if (fs.existsSync(partial + f)) fs.renameSync(partial + f, DB_FILE + f);
	const movedTo = path.join(PATHS.data, `pre-sqlite-${migrationStamp(now)}`);
	moveAside(filePaths(), movedTo);
	return { direction: "sqlite", movedTo, ...counts, skippedLines };
}

export function migrateToFiles(now: Date = new Date()): MigrationReport {
	if (!fs.existsSync(DB_FILE)) throw new Error(`${DB_FILE} does not exist: this data folder is already on files.`);
	const present = filePaths().filter((p) => fs.existsSync(p));
	if (present.length > 0) throw new Error(`Files already exist where the migration would write them: ${present.map((p) => path.relative(PATHS.data, p)).join(", ")}. Move them away first.`);
	const db = openDatabase(DB_FILE);
	const sqlite = sqliteBackend(db);
	let counts: ReturnType<typeof copyAll>;
	try {
		counts = copyAll(sqlite, fileBackend, { skipEmptyLedgers: true });
		assertSame(sqlite, fileBackend);
	} catch (err) {
		db.close();
		moveAside(filePaths(), path.join(PATHS.data, `failed-files-${migrationStamp(now)}`));
		throw err;
	}
	db.exec("PRAGMA wal_checkpoint(TRUNCATE);");
	db.close();
	const movedTo = path.join(PATHS.data, `pre-files-${migrationStamp(now)}`);
	moveAside([DB_FILE, `${DB_FILE}-wal`, `${DB_FILE}-shm`], movedTo);
	return { direction: "files", movedTo, ...counts, skippedLines: {} };
}
