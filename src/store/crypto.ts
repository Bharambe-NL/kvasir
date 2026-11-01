/**
 * Sealing for encryption at rest (Kvasir P6-6, D114, D117): AES-256-GCM
 * per value with Node's crypto, the recovery key, and the check value that
 * proves a key opens this data folder. electron/encryption.cjs writes the
 * same formats from the main process; tests/electron-encryption.test.ts
 * keeps the two in step.
 */

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

/** One sealed value, stored where the JSON was. */
export interface Envelope {
	kv: 1;
	iv: string;
	ct: string;
	tag: string;
}

/** A data key sealed by a recovery key (scrypt-derived). */
export interface RecoverySeal {
	salt: string;
	iv: string;
	ct: string;
	tag: string;
}

export const CHECK_AAD = "kvasir:check";
export const CHECK_TEXT = "kvasir data key check";
export const RECOVERY_AAD = "kvasir:recovery";

export function isEnvelope(v: unknown): v is Envelope {
	if (typeof v !== "object" || v === null) return false;
	const e = v as Record<string, unknown>;
	return e.kv === 1 && typeof e.iv === "string" && typeof e.ct === "string" && typeof e.tag === "string" && Object.keys(e).length === 4;
}

function sealBytes(key: Buffer, aad: string, plain: Buffer): { iv: string; ct: string; tag: string } {
	const iv = randomBytes(12);
	const cipher = createCipheriv("aes-256-gcm", key, iv);
	cipher.setAAD(Buffer.from(aad, "utf8"));
	const ct = Buffer.concat([cipher.update(plain), cipher.final()]);
	return { iv: iv.toString("base64"), ct: ct.toString("base64"), tag: cipher.getAuthTag().toString("base64") };
}

/** Throws when the key, the associated data or any byte is wrong. */
function openBytes(key: Buffer, aad: string, sealed: { iv: string; ct: string; tag: string }): Buffer {
	const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(sealed.iv, "base64"));
	decipher.setAAD(Buffer.from(aad, "utf8"));
	decipher.setAuthTag(Buffer.from(sealed.tag, "base64"));
	return Buffer.concat([decipher.update(Buffer.from(sealed.ct, "base64")), decipher.final()]);
}

export function sealValue(key: Buffer, aad: string, value: unknown): Envelope {
	return { kv: 1, ...sealBytes(key, aad, Buffer.from(JSON.stringify(value), "utf8")) };
}

export function openValue(key: Buffer, aad: string, envelope: Envelope): unknown {
	return JSON.parse(openBytes(key, aad, envelope).toString("utf8"));
}

export function newDataKey(): Buffer {
	return randomBytes(32);
}

export function checkValue(key: Buffer): Envelope {
	return sealValue(key, CHECK_AAD, CHECK_TEXT);
}

/** True when `key` opens this check value. */
export function keyMatches(key: Buffer, check: Envelope): boolean {
	try {
		return openValue(key, CHECK_AAD, check) === CHECK_TEXT;
	} catch {
		return false;
	}
}

// ─── the recovery key (D114) ────────────────────────────────────────────────

const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/** 24 Crockford base32 characters (120 bits) in six groups of four. */
export function newRecoveryKey(): string {
	const bytes = randomBytes(15);
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
	return out.match(/.{4}/g)!.join("-");
}

/** What a person typed, as the canonical 24 characters (or null): case,
 *  spaces and hyphens ignored; I and L read as 1, O as 0. */
export function normalizeRecoveryKey(input: string): string | null {
	const s = input.toUpperCase().replace(/[\s-]/g, "").replace(/[IL]/g, "1").replace(/O/g, "0");
	return s.length === 24 && [...s].every((c) => CROCKFORD.includes(c)) ? s : null;
}

function recoveryWrapKey(recovery: string, salt: Buffer): Buffer {
	return scryptSync(recovery, salt, 32, { N: 1 << 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
}

export function sealWithRecovery(dataKey: Buffer, recoveryKey: string): RecoverySeal {
	const canonical = normalizeRecoveryKey(recoveryKey);
	if (!canonical) throw new Error("Not a recovery key.");
	const salt = randomBytes(16);
	return { salt: salt.toString("base64"), ...sealBytes(recoveryWrapKey(canonical, salt), RECOVERY_AAD, dataKey) };
}

/** The data key, or null when the recovery key does not open the seal. */
export function openWithRecovery(seal: RecoverySeal, recoveryKey: string): Buffer | null {
	const canonical = normalizeRecoveryKey(recoveryKey);
	if (!canonical) return null;
	try {
		return openBytes(recoveryWrapKey(canonical, Buffer.from(seal.salt, "base64")), RECOVERY_AAD, seal);
	} catch {
		return null;
	}
}
