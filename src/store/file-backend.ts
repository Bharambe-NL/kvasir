/**
 * The file backend (Kvasir P6-1): the data folder layout the app has always
 * used, behind StoreBackend.
 *   ledgers  data/graph/*.jsonl, data/learner/*.jsonl: one JSON line per
 *            record; corrupt lines are skipped on read
 *   records  data/chats/<id>.json and data/jobs/<id>.json (tab-indented),
 *            data/graph/document-units/<versionId>.json (temp and rename)
 *   singles  data/graph/sources.json (tab-indented) and
 *            data/graph/positions.json (tab-indented, temp and rename)
 * Paths come from config.ts, so KV_DATA_DIR moves all of it.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { DOCUMENT_UNITS_DIR, LEARNER_FILES, LEDGER_FILES, PATHS, POSITIONS_FILE, SOURCES_FILE } from "../../config.ts";
import { assertRecordId, type LedgerName, type RecordKind, type SingleName, type StoreBackend } from "./backend.ts";

export const LEDGER_PATHS: Record<LedgerName, string> = {
	nodes: LEDGER_FILES.nodes,
	chains: LEDGER_FILES.chains,
	sessions: LEDGER_FILES.sessions,
	coverage: LEDGER_FILES.coverage,
	documents: LEDGER_FILES.documents,
	citations: LEDGER_FILES.citations,
	reviews: LEARNER_FILES.reviews,
	questions: LEARNER_FILES.questions,
	exclusions: LEARNER_FILES.exclusions,
};

export const RECORD_DIRS: Record<RecordKind, string> = {
	chats: PATHS.chats,
	jobs: path.join(PATHS.data, "jobs"),
	units: DOCUMENT_UNITS_DIR,
};

export const SINGLE_PATHS: Record<SingleName, string> = {
	sources: SOURCES_FILE,
	positions: POSITIONS_FILE,
};

function recordFile(kind: RecordKind, id: string): string {
	assertRecordId(kind, id);
	return path.join(RECORD_DIRS[kind], `${id}.json`);
}

/** Write to a uniquely named temp file beside the target, then rename over
 *  it: a crash mid-write leaves the old file, never a torn one. */
function writeAtomic(file: string, body: string): void {
	fs.mkdirSync(path.dirname(file), { recursive: true });
	const tmp = `${file}.tmp-${crypto.randomUUID().slice(0, 8)}`;
	try {
		fs.writeFileSync(tmp, body, "utf-8");
		fs.renameSync(tmp, file);
	} catch (err) {
		try {
			fs.unlinkSync(tmp);
		} catch {
			/* the rename either already happened or the tmp never existed */
		}
		throw err;
	}
}

function readJson(file: string): unknown | null {
	try {
		return JSON.parse(fs.readFileSync(file, "utf-8"));
	} catch {
		return null;
	}
}

export const fileBackend: StoreBackend = {
	kind: "files",
	appendLine(ledger, record) {
		const file = LEDGER_PATHS[ledger];
		fs.mkdirSync(path.dirname(file), { recursive: true });
		fs.appendFileSync(file, `${JSON.stringify(record)}\n`, "utf-8");
	},
	readLines(ledger) {
		let raw: string;
		try {
			raw = fs.readFileSync(LEDGER_PATHS[ledger], "utf-8");
		} catch {
			return []; // no ledger yet: nothing has been written
		}
		const out: unknown[] = [];
		for (const line of raw.split("\n")) {
			const trimmed = line.trim();
			if (trimmed.length === 0) continue;
			try {
				out.push(JSON.parse(trimmed));
			} catch {
				// Corrupt line: skip it, so a torn append never hides the rest.
			}
		}
		return out;
	},
	replaceLedgers(next) {
		for (const [ledger, records] of Object.entries(next) as [LedgerName, readonly unknown[]][]) {
			// JSONL: one record per line, trailing newline, exactly what
			// appendLine would have written.
			writeAtomic(LEDGER_PATHS[ledger], records.map((r) => JSON.stringify(r)).join("\n") + (records.length > 0 ? "\n" : ""));
		}
	},
	getRecord(kind, id) {
		let file: string;
		try {
			file = recordFile(kind, id);
		} catch {
			return null;
		}
		return readJson(file);
	},
	putRecord(kind, id, value) {
		const file = recordFile(kind, id);
		if (kind === "units") {
			writeAtomic(file, JSON.stringify(value));
			return;
		}
		fs.mkdirSync(RECORD_DIRS[kind], { recursive: true });
		fs.writeFileSync(file, JSON.stringify(value, null, "\t"), "utf-8");
	},
	deleteRecord(kind, id) {
		try {
			fs.unlinkSync(recordFile(kind, id));
			return true;
		} catch {
			return false; // never existed, already deleted, or unreadable: same answer
		}
	},
	recordIds(kind) {
		try {
			return fs
				.readdirSync(RECORD_DIRS[kind])
				.filter((f) => f.endsWith(".json"))
				.map((f) => f.slice(0, -5));
		} catch {
			return [];
		}
	},
	readSingle(name) {
		return readJson(SINGLE_PATHS[name]);
	},
	writeSingle(name, value) {
		const file = SINGLE_PATHS[name];
		if (name === "positions") {
			writeAtomic(file, JSON.stringify(value, null, "\t"));
			return;
		}
		fs.mkdirSync(path.dirname(file), { recursive: true });
		fs.writeFileSync(file, JSON.stringify(value, null, "\t"), "utf-8");
	},
};

// One-way purges at load: dead ledgers are exactly the confusion the
// cleanup removes (owner doctrine: nothing reads them, nothing writes them,
// a stale file lying around is a lie).
{
	const graphDir = path.dirname(LEDGER_FILES.nodes);
	for (const legacy of ["edges.jsonl", "events.jsonl"]) {
		const file = path.join(graphDir, legacy);
		try {
			if (fs.existsSync(file)) {
				fs.rmSync(file);
				console.info(`[graph-store] purged legacy ledger: ${file}`);
			}
		} catch (err) {
			console.warn(`[graph-store] could not purge legacy ledger ${file}:`, err);
		}
	}
}
