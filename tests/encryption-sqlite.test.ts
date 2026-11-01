/**
 * Encryption at rest on SQLite (Kvasir P6-6, D112, D117): the golden data is
 * migrated to data/kvasir.db, then sealed in place. Afterwards no
 * proposition, chat title or message text is readable in kvasir.db or its
 * WAL, every port reads the same, and a locked store refuses. No network.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { after, describe, it } from "node:test";

const GOLDEN = fileURLToPath(new URL("./fixtures/golden-data", import.meta.url));
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "kv-encryption-sqlite-"));
const DATA = path.join(TMP, "data");
fs.cpSync(GOLDEN, DATA, { recursive: true });
process.env.KV_DATA_DIR = DATA;
process.env.KV_AUTH_FILE = path.join(TMP, "auth.json");
after(() => fs.rmSync(TMP, { recursive: true, force: true }));

const { migrateToSqlite } = await import("../src/store/migrate.ts");
migrateToSqlite();
const { stores } = await import("../src/server/stores.ts");
const { sealAll } = await import("../src/server/encryption.ts");
const { clearDataKey, DataLockedError } = await import("../src/store/data-key.ts");
const { newDataKey } = await import("../src/store/crypto.ts");
const { mainWritesEncryptionFile, filesContaining, readAll } = await import("./encryption-helpers.ts");

const before = readAll(stores);
const chat = before.chats.find((c) => c!.messages.length > 0)!;
const SECRETS = [before.nodes[0]!.statement.slice(0, 40), chat.title, JSON.stringify(chat.messages).match(/"text":"([^"\\]{30,60})/)![1]!];
const dbFiles = () => fs.readdirSync(DATA).filter((f) => f.startsWith("kvasir.db"));

describe("encryption at rest on SQLite", () => {
	it("the database starts readable", () => {
		assert.ok(dbFiles().includes("kvasir.db"));
		for (const s of SECRETS) assert.ok(filesContaining(DATA, s).some((f) => path.basename(f).startsWith("kvasir.db")), s);
	});
	it("after sealing, nothing is readable in the database or its WAL, and reads are the same", () => {
		const key = newDataKey();
		mainWritesEncryptionFile(key, "sealing");
		sealAll(key);
		mainWritesEncryptionFile(key, "on");
		for (const s of SECRETS) assert.deepEqual(filesContaining(DATA, s).filter((f) => !f.includes("pre-sqlite-")), [], s);
		assert.deepEqual(readAll(stores), before);
		clearDataKey();
		assert.throws(() => stores.chatStore.listChats(), DataLockedError);
		assert.throws(() => stores.graphStore.readNodes(), DataLockedError);
	});
});
