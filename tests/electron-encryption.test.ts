/**
 * Encryption at rest end to end (Kvasir P6-6, D113 to D116): the Electron
 * main logic (electron/encryption.cjs) with a fake keychain, talking to the
 * real server side (src/server/encryption.ts) in this process, over a temp
 * copy of the golden data. Turn on, restart, keychain failure and the
 * Locked screen's recovery, a crash part way, turn off. Also checks the
 * main and server sealing formats against each other. No network.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { after, describe, it } from "node:test";

const GOLDEN = fileURLToPath(new URL("./fixtures/golden-data", import.meta.url));
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "kv-electron-encryption-"));
const DATA = path.join(TMP, "data");
fs.cpSync(GOLDEN, DATA, { recursive: true });
process.env.KV_DATA_DIR = DATA;
process.env.KV_AUTH_FILE = path.join(TMP, "auth.json");
after(() => fs.rmSync(TMP, { recursive: true, force: true }));

const { stores } = await import("../src/server/stores.ts");
const { handleEncryptionMessage, encryptionState } = await import("../src/server/encryption.ts");
const { clearDataKey, DataLockedError, refreshEncryptionFile, ENCRYPTION_FILE } = await import("../src/store/data-key.ts");
const tsCrypto = await import("../src/store/crypto.ts");
const { filesContaining, readAll } = await import("./encryption-helpers.ts");
const main = createRequire(import.meta.url)("../electron/encryption.cjs");

/** A stand-in for Electron safeStorage: reversible, and breakable. */
const keychain = {
	broken: false,
	isEncryptionAvailable: () => true,
	encryptString: (s: string) => Buffer.from(`fake:${s}`, "utf8"),
	decryptString(b: Buffer) {
		if (keychain.broken) throw new Error("Keychain unavailable");
		return b.toString("utf8").slice(5);
	},
};
let failNextSeal = false;
let n = 0;
const enc = main.createEncryption({
	dataDir: () => DATA,
	safeStorage: keychain,
	now: () => new Date(2026, 10, 1, 12, 0, 0),
	notify: (msg: object) => void handleEncryptionMessage({ channel: "lh:encryption", ...msg }),
	request: async (msg: { op: string }) => {
		if (failNextSeal && msg.op === "seal") {
			failNextSeal = false;
			return { ok: false, error: "the server stopped" };
		}
		const reply = handleEncryptionMessage({ channel: "lh:encryption", id: String(++n), ...msg })!;
		return { ok: reply.ok, value: reply.value, error: reply.error };
	},
});
/** A restart: the server forgets the key and re-reads the file. */
const restart = () => {
	clearDataKey();
	refreshEncryptionFile();
};

const before = readAll(stores);
const statement = before.nodes[0]!.statement.slice(0, 40);
let recoveryKey = "";

describe("main and server formats agree", () => {
	it("check values and recovery seals open on the other side", () => {
		const key = tsCrypto.newDataKey();
		assert.equal(tsCrypto.keyMatches(key, main.checkValue(key)), true);
		assert.equal(main.keyMatches(key, tsCrypto.checkValue(key)), true);
		const r = main.newRecoveryKey();
		assert.deepEqual(tsCrypto.openWithRecovery(main.sealWithRecovery(key, r), r), key);
		assert.deepEqual(main.openWithRecovery(tsCrypto.sealWithRecovery(key, r), r), key);
	});
});

describe("encryption through the main process (D113 to D116)", () => {
	it("turning on shows the recovery key once and seals the folder; the file never holds the key", async () => {
		({ recoveryKey } = await enc.enable());
		assert.match(recoveryKey, /^([0-9A-HJKMNP-TV-Z]{4}-){5}[0-9A-HJKMNP-TV-Z]{4}$/);
		const file = JSON.parse(fs.readFileSync(ENCRYPTION_FILE, "utf8"));
		assert.equal(file.state, "on");
		assert.equal(JSON.stringify(file).includes(recoveryKey.replace(/-/g, "")), false);
		assert.equal(fs.statSync(ENCRYPTION_FILE).mode & 0o777, 0o600);
		assert.deepEqual(filesContaining(DATA, statement), []);
		assert.equal(encryptionState().state, "unlocked");
		assert.deepEqual(readAll(stores), before);
		await assert.rejects(enc.enable(), /already on/);
	});

	it("a restart unlocks through the keychain", async () => {
		restart();
		assert.equal(encryptionState().state, "locked");
		await enc.onServerHello();
		assert.equal(encryptionState().state, "unlocked");
		assert.deepEqual(readAll(stores), before);
	});

	it("when the keychain fails, the server is locked for the Locked screen and refuses every store call", async () => {
		restart();
		keychain.broken = true;
		await enc.onServerHello();
		assert.deepEqual({ ...encryptionState(), available: undefined }, { state: "locked", converting: false, lockReason: "keychain", available: undefined });
		assert.throws(() => stores.graphStore.readNodes(), DataLockedError);
		keychain.broken = false;
	});

	it("a wrong recovery key changes nothing; the right one re-seals to the keychain and unlocks", async () => {
		const was = fs.readFileSync(ENCRYPTION_FILE, "utf8");
		assert.deepEqual(await enc.recover("0000-0000-0000-0000-0000-0000"), { ok: false, error: "wrong-recovery-key" });
		assert.deepEqual(await enc.recover("not a key"), { ok: false, error: "wrong-recovery-key" });
		assert.equal(fs.readFileSync(ENCRYPTION_FILE, "utf8"), was);
		assert.equal(encryptionState().state, "locked");
		assert.deepEqual(await enc.recover(recoveryKey.toLowerCase()), { ok: true });
		assert.equal(encryptionState().state, "unlocked");
		assert.deepEqual(readAll(stores), before);
		restart();
		await enc.onServerHello();
		assert.equal(encryptionState().state, "unlocked", "the re-sealed key opens through the keychain at the next start");
	});

	it("turning off decrypts in place and moves encryption.json aside", async () => {
		await enc.disable();
		assert.equal(fs.existsSync(ENCRYPTION_FILE), false);
		assert.ok(fs.existsSync(path.join(DATA, "pre-decrypt-2026-11-01-120000", "encryption.json")));
		assert.equal(encryptionState().state, "plain");
		assert.ok(filesContaining(DATA, statement).length > 0);
		assert.deepEqual(readAll(stores), before);
		await assert.rejects(enc.disable(), /not on/);
	});

	it("a turn-on that stopped part way finishes at the next start", async () => {
		failNextSeal = true;
		await assert.rejects(enc.enable(), /the server stopped/);
		assert.equal(JSON.parse(fs.readFileSync(ENCRYPTION_FILE, "utf8")).state, "sealing");
		restart();
		await enc.onServerHello();
		assert.equal(JSON.parse(fs.readFileSync(ENCRYPTION_FILE, "utf8")).state, "on");
		assert.deepEqual(filesContaining(DATA, statement), []);
		assert.deepEqual(readAll(stores), before);
	});
});
