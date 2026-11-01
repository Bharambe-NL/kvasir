/**
 * Turning encryption on and off in place (Kvasir P6-6, D115, D117). Runs in
 * the server, synchronously, so no request interleaves. Main has already
 * written encryption.json with state "sealing" or "unsealing" and handed
 * over the key; this re-writes every value in the target form, then main
 * records the end state.
 *
 * It works on the raw backend below the encrypting layer and only changes
 * values not yet in the target form, so running it again after a crash
 * finishes the job. auth.json is converted with the stores.
 */

import { LEDGERS, RECORD_KINDS, SINGLES, type LedgerName, type StoreBackend } from "./backend.ts";
import { isEnvelope, openValue, sealValue } from "./crypto.ts";
import { AUTH_AAD, readAuthRaw, writeAuthRaw } from "./auth.ts";
import { ledgerAad, recordAad, singleAad } from "./encrypted-backend.ts";

export interface ConversionCounts {
	ledgerLines: number;
	records: number;
	singles: number;
	auth: boolean;
}

export function convertData(raw: StoreBackend, direction: "seal" | "unseal", key: Buffer): ConversionCounts {
	const to = (aad: string, v: unknown): { changed: boolean; value: unknown } => {
		if (direction === "seal") return isEnvelope(v) ? { changed: false, value: v } : { changed: true, value: sealValue(key, aad, v) };
		return isEnvelope(v) ? { changed: true, value: openValue(key, aad, v) } : { changed: false, value: v };
	};
	const counts: ConversionCounts = { ledgerLines: 0, records: 0, singles: 0, auth: false };
	for (const ledger of LEDGERS) {
		const lines = raw.readLines(ledger);
		const out = lines.map((v) => to(ledgerAad(ledger), v));
		const changed = out.filter((o) => o.changed).length;
		if (changed === 0) continue;
		raw.replaceLedgers({ [ledger]: out.map((o) => o.value) } as Partial<Record<LedgerName, unknown[]>>);
		counts.ledgerLines += changed;
	}
	for (const kind of RECORD_KINDS) {
		for (const id of raw.recordIds(kind)) {
			const v = raw.getRecord(kind, id);
			if (v === null) continue;
			const o = to(recordAad(kind, id), v);
			if (!o.changed) continue;
			raw.putRecord(kind, id, o.value);
			counts.records++;
		}
	}
	for (const name of SINGLES) {
		const v = raw.readSingle(name);
		if (v === null) continue;
		const o = to(singleAad(name), v);
		if (!o.changed) continue;
		raw.writeSingle(name, o.value);
		counts.singles++;
	}
	const auth = readAuthRaw();
	if (auth !== null) {
		const o = to(AUTH_AAD, auth);
		if (o.changed) {
			writeAuthRaw(o.value);
			counts.auth = true;
		}
	}
	return counts;
}
