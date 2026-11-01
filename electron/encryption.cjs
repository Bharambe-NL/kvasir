"use strict";

// Encryption at rest, the main-process side (Kvasir P6-6, D113 to D116).
//
// Main owns the keychain (Electron safeStorage) and is the one writer of
// data/encryption.json:
//   { version: 1, state: "on" | "sealing" | "unsealing",
//     check, sealedByKeychain, sealedByRecovery }
// It never holds the data key in a file or an environment variable. The
// key goes to the server child over the private IPC channel
// ("lh:encryption"), where src/server/encryption.ts converts and serves.
// The sealing formats match src/store/crypto.ts; tests/electron-
// encryption.test.ts checks the two against each other.

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const CHECK_AAD = "kvasir:check";
const CHECK_TEXT = "kvasir data key check";
const RECOVERY_AAD = "kvasir:recovery";
const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

function sealBytes(key, aad, plain) {
	const iv = crypto.randomBytes(12);
	const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
	cipher.setAAD(Buffer.from(aad, "utf8"));
	const ct = Buffer.concat([cipher.update(plain), cipher.final()]);
	return { iv: iv.toString("base64"), ct: ct.toString("base64"), tag: cipher.getAuthTag().toString("base64") };
}

function openBytes(key, aad, sealed) {
	const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(sealed.iv, "base64"));
	decipher.setAAD(Buffer.from(aad, "utf8"));
	decipher.setAuthTag(Buffer.from(sealed.tag, "base64"));
	return Buffer.concat([decipher.update(Buffer.from(sealed.ct, "base64")), decipher.final()]);
}

function newRecoveryKey() {
	const bytes = crypto.randomBytes(15);
	let bits = 0;
	let value = 0;
	let out = "";
	for (const byte of bytes) {
		value = (value << 8) | byte;
		bits += 8;
		while (bits >= 5) {
			out += CROCKFORD[(value >>> (bits - 5)) & 31];
			bits -= 5;
		}
	}
	return out.match(/.{4}/g).join("-");
}

function normalizeRecoveryKey(input) {
	if (typeof input !== "string") return null;
	const s = input.toUpperCase().replace(/[\s-]/g, "").replace(/[IL]/g, "1").replace(/O/g, "0");
	return s.length === 24 && [...s].every((c) => CROCKFORD.includes(c)) ? s : null;
}

const wrapKey = (canonical, salt) => crypto.scryptSync(canonical, salt, 32, { N: 1 << 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });

function sealWithRecovery(dataKey, recoveryKey) {
	const salt = crypto.randomBytes(16);
	return { salt: salt.toString("base64"), ...sealBytes(wrapKey(normalizeRecoveryKey(recoveryKey), salt), RECOVERY_AAD, dataKey) };
}

function openWithRecovery(seal, recoveryKey) {
	const canonical = normalizeRecoveryKey(recoveryKey);
	if (!canonical) return null;
	try {
		return openBytes(wrapKey(canonical, Buffer.from(seal.salt, "base64")), RECOVERY_AAD, seal);
	} catch {
		return null;
	}
}

const checkValue = (key) => ({ kv: 1, ...sealBytes(key, CHECK_AAD, Buffer.from(JSON.stringify(CHECK_TEXT), "utf8")) });

function keyMatches(key, check) {
	try {
		return JSON.parse(openBytes(key, CHECK_AAD, check).toString("utf8")) === CHECK_TEXT;
	} catch {
		return false;
	}
}

const pad = (n) => String(n).padStart(2, "0");
const stamp = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;

/**
 * @param {object} deps
 * @param {string | (() => string)} deps.dataDir  the data folder (a function is read on each use)
 * @param {{ isEncryptionAvailable(): boolean, encryptString(s: string): Buffer, decryptString(b: Buffer): string }} deps.safeStorage
 * @param {(msg: object) => Promise<{ ok: boolean, value?: any, error?: string }>} deps.request  a message to the server, awaiting its reply
 * @param {(msg: object) => void} deps.notify  a message to the server without a reply
 * @param {() => Date} [deps.now]
 * @param {(line: string) => void} [deps.log]
 */
function createEncryption({ dataDir, safeStorage, request, notify, now = () => new Date(), log = () => {} }) {
	const dir = () => (typeof dataDir === "function" ? dataDir() : dataDir);
	const fileOf = () => path.join(dir(), "encryption.json");

	const read = () => {
		try {
			return JSON.parse(fs.readFileSync(fileOf(), "utf8"));
		} catch (err) {
			if (err.code === "ENOENT") return null;
			throw new Error("encryption.json is unreadable.");
		}
	};
	const write = (value) => {
		fs.mkdirSync(dir(), { recursive: true });
		const tmp = `${fileOf()}.tmp-${crypto.randomUUID().slice(0, 8)}`;
		fs.writeFileSync(tmp, JSON.stringify(value, null, "\t"), { mode: 0o600 });
		fs.renameSync(tmp, fileOf());
	};
	const keychainAvailable = () => {
		try {
			return safeStorage.isEncryptionAvailable();
		} catch {
			return false;
		}
	};
	const keyFromKeychain = (enc) => {
		if (!keychainAvailable()) return null;
		try {
			const key = Buffer.from(safeStorage.decryptString(Buffer.from(enc.sealedByKeychain, "base64")), "base64");
			return key.length === 32 && keyMatches(key, enc.check) ? key : null;
		} catch {
			return null;
		}
	};

	/** Finish a conversion the server reports done (or a crash left). */
	const finish = (enc, finished) => {
		if (finished === "sealing") write({ ...enc, state: "on" });
		else if (finished === "unsealing") retire();
		else return;
		notify({ op: "refresh" });
	};
	/** Turning off: keep encryption.json beside the data, out of the way. */
	const retire = () => {
		const aside = path.join(dir(), `pre-decrypt-${stamp(now())}`);
		fs.mkdirSync(aside, { recursive: true });
		fs.renameSync(fileOf(), path.join(aside, "encryption.json"));
	};

	const unlock = async (enc, key) => {
		const reply = await request({ op: "unlock", key: key.toString("base64") });
		if (!reply.ok) throw new Error(reply.error || "The server refused the key.");
		finish(read(), reply.value && reply.value.finished);
	};

	return {
		/** The server asked for the key at start. */
		async onServerHello() {
			const enc = read();
			if (!enc) return;
			const key = keyFromKeychain(enc);
			if (!key) {
				log("encryption: the keychain could not unseal the data key; showing the Locked screen");
				notify({ op: "locked" });
				return;
			}
			await unlock(enc, key);
			log("encryption: unlocked");
		},

		/** Turn on (D114, D115): returns the recovery key, shown once. */
		async enable() {
			if (read()) throw new Error("Encryption is already on.");
			if (!keychainAvailable()) throw new Error("This Mac's keychain is not available, so Kvasir cannot keep an encryption key.");
			const key = crypto.randomBytes(32);
			const recoveryKey = newRecoveryKey();
			const enc = {
				version: 1,
				state: "sealing",
				check: checkValue(key),
				sealedByKeychain: safeStorage.encryptString(key.toString("base64")).toString("base64"),
				sealedByRecovery: sealWithRecovery(key, recoveryKey),
			};
			write(enc);
			const reply = await request({ op: "seal", key: key.toString("base64") });
			if (!reply.ok) throw new Error(reply.error || "The server could not seal the data.");
			finish(enc, "sealing");
			key.fill(0);
			log("encryption: turned on");
			return { recoveryKey };
		},

		/** Turn off (D115): decrypt in place, then retire encryption.json. */
		async disable() {
			const enc = read();
			if (!enc) throw new Error("Encryption is not on.");
			write({ ...enc, state: "unsealing" });
			const reply = await request({ op: "unseal" });
			if (!reply.ok) throw new Error(reply.error || "The server could not decrypt the data.");
			finish(read(), "unsealing");
			log("encryption: turned off");
		},

		/** The Locked screen (D116): open the data key with the recovery key,
		 *  seal it to this keychain again, and unlock. A wrong key changes
		 *  nothing. */
		async recover(recoveryKey) {
			const enc = read();
			if (!enc) return { ok: false, error: "not-encrypted" };
			const key = openWithRecovery(enc.sealedByRecovery, recoveryKey);
			if (!key || !keyMatches(key, enc.check)) return { ok: false, error: "wrong-recovery-key" };
			if (!keychainAvailable()) return { ok: false, error: "no-keychain" };
			const next = { ...enc, sealedByKeychain: safeStorage.encryptString(key.toString("base64")).toString("base64") };
			write(next);
			await unlock(next, key);
			key.fill(0);
			log("encryption: recovered with the recovery key");
			return { ok: true };
		},
	};
}

module.exports = { createEncryption, newRecoveryKey, normalizeRecoveryKey, sealWithRecovery, openWithRecovery, checkValue, keyMatches };
