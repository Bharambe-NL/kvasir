/**
 * The adapters every store contract suite runs against (Kvasir P6-1, D111;
 * P6-6): the file backend over a temp KV_DATA_DIR, SQLite over a fresh
 * temp database per test, and the file backend with encryption on. `fresh()` empties the data folder and returns new
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
const { encryptionLayer } = await import("../../src/store/encrypted-backend.ts");
const { refreshEncryptionFile, setDataKey, ENCRYPTION_FILE } = await import("../../src/store/data-key.ts");
const { checkValue, newDataKey, newRecoveryKey, sealWithRecovery } = await import("../../src/store/crypto.ts");
type StoreBackend = import("../../src/store/backend.ts").StoreBackend;

export interface Adapter {
	name: "files" | "sqlite" | "files, encrypted";
	fresh(): {
		backend: StoreBackend;
		graph: ReturnType<typeof createGraphStore>;
		chats: ReturnType<typeof createChatStore>;
		jobs: ReturnType<typeof createJobStore>;
		learner: ReturnType<typeof createLearnerStore>;
	};
}

/** Empty the data folder (every adapter keeps graph/format.json there),
 *  which also makes it plain again. */
function clearData(): void {
	for (const entry of fs.readdirSync(DATA)) fs.rmSync(path.join(DATA, entry), { recursive: true, force: true });
	refreshEncryptionFile();
}

/** What electron/encryption.cjs writes when encryption is on (P6-6). */
export function writeEncryptionFile(key: Buffer, state: "on" | "sealing" | "unsealing" = "on"): void {
	fs.writeFileSync(ENCRYPTION_FILE, JSON.stringify({ version: 1, state, check: checkValue(key), sealedByKeychain: "fake-keychain-seal", sealedByRecovery: sealWithRecovery(key, newRecoveryKey()) }));
	refreshEncryptionFile();
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
	{
		name: "files, encrypted",
		fresh() {
			clearData();
			const key = newDataKey();
			writeEncryptionFile(key);
			setDataKey(key);
			return stores(encryptionLayer(fileBackend));
		},
	},
];
