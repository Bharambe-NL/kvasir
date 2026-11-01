/**
 * The two adapters every store contract suite runs against (Kvasir P6-1,
 * D111): the file backend over a temp KV_DATA_DIR, and SQLite over a fresh
 * temp database per test. `fresh()` empties the data folder and returns new
 * store instances, so no test sees another's records.
 *
 * Import this module before any app module: it sets KV_DATA_DIR.
 */
import fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { after } from "node:test";

export const DATA = fs.mkdtempSync(path.join(os.tmpdir(), "kv-store-contract-"));
process.env.KV_DATA_DIR = DATA;
const DBS = fs.mkdtempSync(path.join(os.tmpdir(), "kv-store-contract-db-"));
after(() => {
	fs.rmSync(DATA, { recursive: true, force: true });
	fs.rmSync(DBS, { recursive: true, force: true });
});

const { fileBackend } = await import("../../src/store/file-backend.ts");
const { sqliteBackend } = await import("../../src/store/sqlite/backend.ts");
const { openDatabase } = await import("../../src/store/sqlite/db.ts");
const { createGraphStore } = await import("../../src/store/graph.ts");
const { createChatStore } = await import("../../src/store/chats.ts");
const { createJobStore } = await import("../../src/store/jobs.ts");
const { createLearnerStore } = await import("../../src/store/learner.ts");
type StoreBackend = import("../../src/store/backend.ts").StoreBackend;

export interface Adapter {
	name: "files" | "sqlite";
	fresh(): {
		backend: StoreBackend;
		graph: ReturnType<typeof createGraphStore>;
		chats: ReturnType<typeof createChatStore>;
		jobs: ReturnType<typeof createJobStore>;
		learner: ReturnType<typeof createLearnerStore>;
	};
}

/** Empty the data folder (both adapters keep graph/format.json there). */
function clearData(): void {
	for (const entry of fs.readdirSync(DATA)) fs.rmSync(path.join(DATA, entry), { recursive: true, force: true });
}

const stores = (backend: StoreBackend) => ({
	backend,
	graph: createGraphStore(backend),
	chats: createChatStore(backend),
	jobs: createJobStore(backend),
	learner: createLearnerStore(backend),
});

let n = 0;
export const ADAPTERS: Adapter[] = [
	{
		name: "files",
		fresh() {
			clearData();
			return stores(fileBackend);
		},
	},
	{
		name: "sqlite",
		fresh() {
			clearData();
			return stores(sqliteBackend(openDatabase(path.join(DBS, `t${++n}.db`))));
		},
	},
];
