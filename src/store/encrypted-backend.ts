/**
 * The encrypting layer (Kvasir P6-6, D112, D117): wraps any StoreBackend
 * (files or SQLite). On a plain folder it passes every call through. On an
 * encrypted one each ledger line, record and single is sealed on the way in
 * and opened on the way out, with its place as associated data so a sealed
 * value cannot be moved to another ledger, id or single. While locked every
 * call throws DataLockedError.
 *
 * Part way through a turn-on ("sealing") or turn-off ("unsealing"), reads
 * accept both forms and writes take the target form.
 */

import type { LedgerName, RecordKind, SingleName, StoreBackend } from "./backend.ts";
import { isEnvelope, openValue, sealValue } from "./crypto.ts";
import { currentKey, encryptionFile } from "./data-key.ts";

export const ledgerAad = (ledger: LedgerName) => `ledger:${ledger}`;
export const recordAad = (kind: RecordKind, id: string) => `record:${kind}:${id}`;
export const singleAad = (name: SingleName) => `single:${name}`;

type Mode = { sealed: false } | { sealed: true; key: Buffer; writeSealed: boolean; plainAllowed: boolean };

function mode(): Mode {
	const file = encryptionFile();
	if (!file) return { sealed: false };
	return { sealed: true, key: currentKey(), writeSealed: file.state !== "unsealing", plainAllowed: file.state !== "on" };
}

function open(m: Mode, aad: string, stored: unknown): unknown {
	if (!m.sealed || stored === null) return stored;
	if (isEnvelope(stored)) return openValue(m.key, aad, stored);
	if (m.plainAllowed) return stored;
	throw new Error(`Unsealed value found in encrypted data (${aad}).`);
}

const seal = (m: Mode, aad: string, value: unknown): unknown => (m.sealed && m.writeSealed ? sealValue(m.key, aad, value) : value);

export function encryptionLayer(inner: StoreBackend): StoreBackend {
	return {
		kind: inner.kind,
		appendLine(ledger, record) {
			inner.appendLine(ledger, seal(mode(), ledgerAad(ledger), record));
		},
		readLines(ledger) {
			const m = mode();
			return inner.readLines(ledger).map((v) => open(m, ledgerAad(ledger), v));
		},
		replaceLedgers(next) {
			const m = mode();
			const out: Partial<Record<LedgerName, unknown[]>> = {};
			for (const [ledger, records] of Object.entries(next) as [LedgerName, readonly unknown[]][]) out[ledger] = records.map((r) => seal(m, ledgerAad(ledger), r));
			inner.replaceLedgers(out);
		},
		getRecord(kind, id) {
			return open(mode(), recordAad(kind, id), inner.getRecord(kind, id));
		},
		putRecord(kind, id, value) {
			inner.putRecord(kind, id, seal(mode(), recordAad(kind, id), value));
		},
		deleteRecord(kind, id) {
			mode(); // locked data is not changed, deletes included
			return inner.deleteRecord(kind, id);
		},
		recordIds(kind) {
			mode();
			return inner.recordIds(kind);
		},
		readSingle(name) {
			return open(mode(), singleAad(name), inner.readSingle(name));
		},
		writeSingle(name, value) {
			inner.writeSingle(name, seal(mode(), singleAad(name), value));
		},
		compact() {
			inner.compact?.();
		},
	};
}
