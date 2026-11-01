/**
 * The server side of encryption at rest (Kvasir P6-6, D113, D115, D116).
 * The Electron main process owns the keychain and data/encryption.json; it
 * sends the data key and commands here over the private IPC channel
 * ("lh:encryption"). This module never stores the key anywhere but memory.
 *
 *   unlock { key }   check the key, and finish a conversion a crash left
 *   seal { key }     turn on: seal every value (encryption.json "sealing")
 *   unseal           turn off: open every value (encryption.json "unsealing")
 *   refresh          main changed encryption.json: re-read it
 *   locked           main could not unseal the key: show the Locked screen
 * Each message with an id gets one reply { id, ok, value | error }.
 */

import { convertData, type ConversionCounts } from "../store/encryption-convert.ts";
import { currentKey, encryptionStatus, markKeychainFailed, refreshEncryptionFile, setDataKey, WrongKeyError, type EncryptionStatus } from "../store/data-key.ts";
import { storageBackend } from "./stores.ts";

export const ENCRYPTION_CHANNEL = "lh:encryption";

/** True when the Electron main process can be reached (packaged app). */
export function encryptionAvailable(): boolean {
	return process.env.KV_DESKTOP_SERVER === "1" && typeof process.send === "function" && process.connected === true;
}

export function encryptionState(): EncryptionStatus & { available: boolean } {
	return { ...encryptionStatus(), available: encryptionAvailable() };
}

/** Unlock with the key from main; a conversion left part way finishes. */
export function unlockWithKey(key: Buffer): { finished: "sealing" | "unsealing" | null; counts?: ConversionCounts } {
	const file = refreshEncryptionFile();
	if (!file) throw new Error("This data folder is not encrypted.");
	setDataKey(key);
	if (file.state === "sealing") return { finished: "sealing", counts: convertData(storageBackend, "seal", key) };
	if (file.state === "unsealing") return { finished: "unsealing", counts: convertData(storageBackend, "unseal", key) };
	return { finished: null };
}

/** Turn on: main has written encryption.json with state "sealing". */
export function sealAll(key: Buffer): ConversionCounts {
	const file = refreshEncryptionFile();
	if (file?.state !== "sealing") throw new Error("encryption.json is not in the sealing state.");
	setDataKey(key);
	return convertData(storageBackend, "seal", key);
}

/** Turn off: main has set encryption.json to "unsealing". */
export function unsealAll(): ConversionCounts {
	const file = refreshEncryptionFile();
	if (file?.state !== "unsealing") throw new Error("encryption.json is not in the unsealing state.");
	return convertData(storageBackend, "unseal", currentKey());
}

interface Message {
	channel?: string;
	id?: string;
	op?: string;
	key?: string;
}

/** Handle one message from main; returns the reply for messages with an id. */
export function handleEncryptionMessage(m: Message): { channel: string; id: string; ok: boolean; value?: unknown; error?: string } | null {
	if (m.channel !== ENCRYPTION_CHANNEL) return null;
	const key = () => {
		const k = typeof m.key === "string" ? Buffer.from(m.key, "base64") : null;
		if (!k || k.length !== 32) throw new Error("No data key in the message.");
		return k;
	};
	let value: unknown;
	try {
		if (m.op === "unlock") value = unlockWithKey(key());
		else if (m.op === "seal") value = sealAll(key());
		else if (m.op === "unseal") value = unsealAll();
		else if (m.op === "refresh") value = (refreshEncryptionFile(), encryptionStatus());
		else if (m.op === "locked") value = (markKeychainFailed(), encryptionStatus());
		else throw new Error(`Unknown encryption op: ${m.op}`);
	} catch (err) {
		return m.id ? { channel: ENCRYPTION_CHANNEL, id: m.id, ok: false, error: err instanceof WrongKeyError ? "wrong-key" : err instanceof Error ? err.message : String(err) } : null;
	}
	return m.id ? { channel: ENCRYPTION_CHANNEL, id: m.id, ok: true, value } : null;
}

/** Listen on the IPC channel and ask main for the key ("hello"). Called
 *  once at server boot; a no-op outside the desktop app. */
export function installEncryptionBridge(): void {
	const g = globalThis as Record<symbol, boolean>;
	const flag = Symbol.for("kvasir.encryptionBridge");
	if (g[flag] || !encryptionAvailable()) return;
	g[flag] = true;
	process.on("message", (raw: unknown) => {
		const reply = handleEncryptionMessage((raw ?? {}) as Message);
		if (reply && process.connected) process.send!(reply);
	});
	process.send!({ channel: ENCRYPTION_CHANNEL, op: "hello" });
}
