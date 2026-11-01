/**
 * Encryption at rest on files (Kvasir P6-6, D112 to D117), on a temp copy of
 * the golden data with a test API key: turning on leaves no readable
 * proposition, chat or key anywhere in the data folder; while locked every
 * store call and API route refuses and nothing is written; a wrong key, a
 * moved value and a wrong recovery key fail; a crash part way finishes on
 * unlock; turning off restores readable files. The main process's part is
 * played by tests/encryption-helpers.ts. No network.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { after, describe, it } from "node:test";

const GOLDEN = fileURLToPath(new URL("./fixtures/golden-data", import.meta.url));
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "kv-encryption-"));
const DATA = path.join(TMP, "data");
const AUTH = path.join(TMP, "auth.json");
fs.cpSync(GOLDEN, DATA, { recursive: true });
fs.writeFileSync(AUTH, JSON.stringify({ OPENROUTER_API_KEY: "sk-or-test-SECRET-41f9" }, null, "\t"));
process.env.KV_DATA_DIR = DATA;
process.env.KV_AUTH_FILE = AUTH;
after(() => fs.rmSync(TMP, { recursive: true, force: true }));

const { stores, storageBackend } = await import("../src/server/stores.ts");
const { handleEncryptionMessage, sealAll, unlockWithKey, unsealAll, encryptionState } = await import("../src/server/encryption.ts");
const { clearDataKey, DataLockedError, readEncryptionFile, setDataKey, WrongKeyError } = await import("../src/store/data-key.ts");
const { newDataKey, openWithRecovery, isEnvelope } = await import("../src/store/crypto.ts");
const { authStore } = await import("../src/store/auth.ts");
const { proxy } = await import("../proxy.ts");
const { NextRequest } = await import("next/server");
const { mainRetiresEncryptionFile, mainWritesEncryptionFile, filesContaining, readAll } = await import("./encryption-helpers.ts");
const { migrateToSqlite } = await import("../src/store/migrate.ts");

const before = readAll(stores);
const firstNode = before.nodes[0]!;
const chat = before.chats.find((c) => c!.messages.length > 0)!;
const chatText = JSON.stringify(chat.messages).match(/"text":"([^"\\]{30,60})/)![1]!;
/** Strings that must not be readable anywhere once encrypted. */
const SECRETS = [firstNode.statement.slice(0, 40), chat.title, chatText, "sk-or-test-SECRET-41f9"];
const key = newDataKey();
let recovery = "";

const changed = (a: Record<string, string>, b: Record<string, string>) => [...new Set([...Object.keys(a), ...Object.keys(b)])].filter((k) => a[k] !== b[k]).sort();
const snapshot = () => {
	const out: Record<string, string> = {};
	const walk = (d: string) => {
		for (const e of fs.readdirSync(d, { withFileTypes: true })) {
			const p = path.join(d, e.name);
			if (e.isDirectory()) walk(p);
			else out[path.relative(TMP, p)] = fs.readFileSync(p, "base64");
		}
	};
	walk(TMP);
	return out;
};

describe("encryption at rest on files (D112 to D117)", () => {
	it("starts plain and readable", () => {
		assert.deepEqual(encryptionState(), { state: "plain", converting: false, available: false });
		for (const s of SECRETS) assert.ok(filesContaining(DATA, s, [AUTH]).length > 0, s);
	});

	it("turning on seals everything: no proposition, chat or key is readable in the folder", () => {
		recovery = mainWritesEncryptionFile(key, "sealing");
		const counts = sealAll(key);
		mainWritesEncryptionFile(key, "on");
		assert.ok(counts.ledgerLines > before.nodes.length && counts.records > 0 && counts.singles > 0 && counts.auth);
		for (const s of SECRETS) assert.deepEqual(filesContaining(DATA, s, [AUTH]), [], s);
		assert.ok(isEnvelope(JSON.parse(fs.readFileSync(AUTH, "utf8"))), "auth.json is one envelope");
		assert.equal(JSON.stringify(readEncryptionFile()).includes(key.toString("base64")), false, "encryption.json never holds the key");
	});

	it("unlocked, every port reads exactly what it read before; keys still work", () => {
		assert.deepEqual(readAll(stores), before);
		assert.equal(authStore.authVars().OPENROUTER_API_KEY, "sk-or-test-SECRET-41f9");
		authStore.setAuthVar("OPENAI_API_KEY", "sk-test-other");
		assert.ok(isEnvelope(JSON.parse(fs.readFileSync(AUTH, "utf8"))));
		assert.deepEqual(encryptionState(), { state: "unlocked", converting: false, available: false });
	});

	it("locked: every store call refuses, the API answers 423, and nothing is written", async () => {
		clearDataKey();
		const was = snapshot();
		assert.equal(encryptionState().state, "locked");
		assert.equal(encryptionState().lockReason, "waiting");
		for (const call of [
			() => stores.graphStore.readNodes(),
			() => stores.chatStore.listChats(),
			() => stores.chatStore.createChat("x"),
			() => stores.graphStore.appendNode({ ...firstNode, id: "n_new" }),
			() => stores.learnerStore.appendReview({ id: "rv_x", nodeId: firstNode.id, rating: 3, reviewedAt: "2026-11-01T09:00:00.000Z" }),
			() => stores.jobStore.deleteJobsForChat(chat.id),
			() => authStore.setAuthVar("OPENAI_API_KEY", "sk-overwrite"),
		]) {
			assert.throws(call, DataLockedError);
		}
		assert.deepEqual(authStore.authVars(), {}, "ordinary key reads see no keys while locked");
		const res = proxy(new NextRequest("http://localhost/api/chats"));
		assert.equal(res.status, 423);
		assert.equal((await res.json()).locked, true);
		assert.equal(proxy(new NextRequest("http://localhost/api/encryption")).status, 200, "the status route answers");
		assert.deepEqual(changed(snapshot(), was), []);
	});

	it("a wrong key is refused by the check value and changes nothing", () => {
		const was = snapshot();
		assert.throws(() => setDataKey(newDataKey()), WrongKeyError);
		const reply = handleEncryptionMessage({ channel: "lh:encryption", id: "1", op: "unlock", key: newDataKey().toString("base64") });
		assert.deepEqual(reply, { channel: "lh:encryption", id: "1", ok: false, error: "wrong-key" });
		assert.equal(encryptionState().state, "locked");
		assert.deepEqual(changed(snapshot(), was), []);
	});

	it("keychain failure is reported as the Locked screen's reason", () => {
		handleEncryptionMessage({ channel: "lh:encryption", op: "locked" });
		assert.equal(encryptionState().lockReason, "keychain");
	});

	it("the recovery key opens the data key; a wrong one opens nothing", () => {
		const file = readEncryptionFile()!;
		assert.deepEqual(openWithRecovery(file.sealedByRecovery, recovery), key);
		assert.equal(openWithRecovery(file.sealedByRecovery, "0000-0000-0000-0000-0000-0000"), null);
		const reply = handleEncryptionMessage({ channel: "lh:encryption", id: "2", op: "unlock", key: key.toString("base64") });
		assert.deepEqual(reply, { channel: "lh:encryption", id: "2", ok: true, value: { finished: null } });
		assert.equal(encryptionState().state, "unlocked");
	});

	it("a sealed value moved to another record fails to open", () => {
		const other = "chat_moved_copy";
		fs.copyFileSync(path.join(DATA, "chats", `${chat.id}.json`), path.join(DATA, "chats", `${other}.json`));
		try {
			assert.throws(() => stores.chatStore.getChat(other));
		} finally {
			fs.rmSync(path.join(DATA, "chats", `${other}.json`));
		}
	});

	it("a crash part way through turning off finishes on the next unlock", () => {
		mainWritesEncryptionFile(key, "unsealing");
		const raw = storageBackend.getRecord("chats", chat.id);
		assert.ok(isEnvelope(raw));
		// Half done: one chat already plain when the crash came.
		storageBackend.putRecord("chats", chat.id, readAll(stores).chats.find((c) => c!.id === chat.id));
		clearDataKey();
		const result = unlockWithKey(key);
		assert.equal(result.finished, "unsealing");
		mainRetiresEncryptionFile();
		assert.equal(encryptionState().state, "plain");
		for (const s of SECRETS) assert.ok(filesContaining(DATA, s, [AUTH]).length > 0, `${s} readable again`);
		const now = readAll(stores);
		assert.deepEqual(now, before);
		assert.equal(authStore.authVars().OPENAI_API_KEY, "sk-test-other");
	});

	it("turning on and off again round trips; unseal needs the unsealing state", () => {
		mainWritesEncryptionFile(key, "sealing");
		sealAll(key);
		mainWritesEncryptionFile(key, "on");
		assert.throws(() => unsealAll(), /not in the unsealing state/);
		mainWritesEncryptionFile(key, "unsealing");
		unsealAll();
		mainRetiresEncryptionFile();
		assert.deepEqual(readAll(stores), before);
	});

	it("the SQLite migration refuses an encrypted folder", () => {
		mainWritesEncryptionFile(key, "sealing");
		sealAll(key);
		mainWritesEncryptionFile(key, "on");
		assert.throws(() => migrateToSqlite(), /encrypted/);
	});
});
