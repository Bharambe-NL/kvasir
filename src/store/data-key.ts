/**
 * The data key and the encryption state of this process (Kvasir P6-6,
 * D112, D113, D116).
 *
 * data/encryption.json says whether the folder is encrypted. Its one writer
 * is the Electron main process (electron/encryption.cjs); the server only
 * reads it. The key itself arrives from main over IPC (src/server/
 * encryption.ts) and lives in memory only. State is kept on globalThis so
 * proxy.ts and the route handlers, which Next bundles apart, share it.
 *
 *   plain       no encryption.json: values are stored as plain JSON
 *   locked      encrypted, no key yet: every store call throws DataLockedError
 *   unlocked    encrypted, key checked against the file's check value
 * `converting` is true while a turn-on or turn-off is part way (a crash
 * leaves it set; the next unlock finishes the job).
 *
 * The file is read once and cached; main tells the server to re-read it
 * after each write (refreshEncryptionFile).
 */

import fs from "node:fs";
import * as path from "node:path";
import { PATHS } from "../../config.ts";
import { isEnvelope, keyMatches, type Envelope, type RecoverySeal } from "./crypto.ts";

export const ENCRYPTION_FILE = path.join(PATHS.data, "encryption.json");

export interface EncryptionFile {
	version: 1;
	/** "on" when every value is sealed; "sealing" or "unsealing" part way. */
	state: "on" | "sealing" | "unsealing";
	check: Envelope;
	sealedByKeychain: string;
	sealedByRecovery: RecoverySeal;
}

export class DataLockedError extends Error {
	constructor() {
		super("Kvasir data is encrypted and not unlocked yet.");
		this.name = "DataLockedError";
	}
}

export class WrongKeyError extends Error {
	constructor() {
		super("That key does not open this data.");
		this.name = "WrongKeyError";
	}
}

interface Slot {
	key: Buffer | null;
	/** Why it is locked: still waiting for main, or the keychain failed. */
	lockReason: "waiting" | "keychain";
	/** undefined until first read. */
	file: EncryptionFile | null | undefined;
}
const slotKey = Symbol.for("kvasir.dataKey");
const slot = (): Slot => ((globalThis as Record<symbol, Slot>)[slotKey] ??= { key: null, lockReason: "waiting", file: undefined });

/** The cached encryption.json (null when the folder is plain). */
export function encryptionFile(): EncryptionFile | null {
	const s = slot();
	if (s.file === undefined) s.file = readEncryptionFile();
	return s.file;
}

/** Re-read encryption.json after main changed it. A folder that became
 *  plain drops the key. */
export function refreshEncryptionFile(): EncryptionFile | null {
	slot().file = readEncryptionFile();
	if (!slot().file) clearDataKey();
	return slot().file ?? null;
}

export function readEncryptionFile(): EncryptionFile | null {
	let parsed: unknown;
	try {
		parsed = JSON.parse(fs.readFileSync(ENCRYPTION_FILE, "utf8"));
	} catch (err) {
		if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
		throw new Error(`${ENCRYPTION_FILE} is unreadable: Kvasir will not guess whether the data is encrypted.`);
	}
	const f = parsed as Partial<EncryptionFile>;
	if (f.version !== 1 || !["on", "sealing", "unsealing"].includes(f.state as string) || !isEnvelope(f.check)) {
		throw new Error(`${ENCRYPTION_FILE} is not a Kvasir encryption file this build understands.`);
	}
	return f as EncryptionFile;
}

export type EncryptionState = "plain" | "locked" | "unlocked";

export interface EncryptionStatus {
	state: EncryptionState;
	converting: boolean;
	/** While locked: "waiting" for the key from main, or "keychain" when
	 *  main could not unseal it (the Locked screen, D116). */
	lockReason?: "waiting" | "keychain";
}

export function encryptionStatus(): EncryptionStatus {
	const file = encryptionFile();
	if (!file) return { state: "plain", converting: false };
	if (slot().key) return { state: "unlocked", converting: file.state !== "on" };
	return { state: "locked", converting: file.state !== "on", lockReason: slot().lockReason };
}

/** Main could not unseal the key with the keychain. */
export function markKeychainFailed(): void {
	slot().lockReason = "keychain";
}

/** For proxy.ts, which must not read files: true only when the folder is
 *  known to be encrypted and no key is held. */
export function knownLocked(): boolean {
	const s = slot();
	return !!s.file && !s.key;
}

/** Accept the key from main after checking it against the file. */
export function setDataKey(key: Buffer): void {
	const file = encryptionFile();
	if (!file || !keyMatches(key, file.check)) throw new WrongKeyError();
	slot().key = Buffer.from(key);
}

export function clearDataKey(): void {
	slot().key?.fill(0);
	slot().key = null;
}

/** Throws DataLockedError when encrypted and locked; for writes that touch
 *  a plain file before the store (the graph format stamp). */
export function assertUnlocked(): void {
	if (encryptionFile() && !slot().key) throw new DataLockedError();
}

/** The key for sealing and opening; throws while locked. */
export function currentKey(): Buffer {
	const key = slot().key;
	if (!key) throw new DataLockedError();
	return key;
}

