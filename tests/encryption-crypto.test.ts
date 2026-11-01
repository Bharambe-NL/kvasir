/** Sealing for encryption at rest (Kvasir P6-6, D114, D117). No network. */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { checkValue, isEnvelope, keyMatches, newDataKey, newRecoveryKey, normalizeRecoveryKey, openValue, openWithRecovery, sealValue, sealWithRecovery } from "../src/store/crypto.ts";

describe("sealValue and openValue (D117)", () => {
	const key = newDataKey();
	const value = { id: "n_a", statement: "Financial entities shall manage ICT third-party risk.", n: [1, 2] };
	it("round trips, and each seal is fresh", () => {
		const a = sealValue(key, "ledger:nodes", value);
		const b = sealValue(key, "ledger:nodes", value);
		assert.ok(isEnvelope(a));
		assert.deepEqual(Object.keys(a), ["kv", "iv", "ct", "tag"]);
		assert.notEqual(a.iv, b.iv);
		assert.notEqual(a.ct, b.ct);
		assert.deepEqual(openValue(key, "ledger:nodes", a), value);
		assert.doesNotMatch(JSON.stringify(a), /Financial entities/);
	});
	it("fails on a wrong key, a wrong place, or one flipped byte", () => {
		const e = sealValue(key, "record:chats:chat_a", value);
		assert.throws(() => openValue(newDataKey(), "record:chats:chat_a", e));
		assert.throws(() => openValue(key, "record:chats:chat_b", e), "a value moved to another id");
		const ct = Buffer.from(e.ct, "base64");
		ct[0]! ^= 1;
		assert.throws(() => openValue(key, "record:chats:chat_a", { ...e, ct: ct.toString("base64") }));
	});
	it("the check value proves a key", () => {
		const check = checkValue(key);
		assert.equal(keyMatches(key, check), true);
		assert.equal(keyMatches(newDataKey(), check), false);
	});
	it("isEnvelope accepts only the exact shape", () => {
		assert.equal(isEnvelope({ kv: 1, iv: "a", ct: "b", tag: "c" }), true);
		for (const v of [null, {}, { kv: 2, iv: "a", ct: "b", tag: "c" }, { kv: 1, iv: "a", ct: "b", tag: "c", id: "x" }, { id: "n_a" }]) assert.equal(isEnvelope(v), false, JSON.stringify(v));
	});
});

describe("the recovery key (D114)", () => {
	it("is 24 Crockford base32 characters in six groups of four", () => {
		const r = newRecoveryKey();
		assert.match(r, /^([0-9A-HJKMNP-TV-Z]{4}-){5}[0-9A-HJKMNP-TV-Z]{4}$/);
		assert.notEqual(newRecoveryKey(), r);
	});
	it("reads what people type: case, spaces, hyphens, I, L and O", () => {
		assert.equal(normalizeRecoveryKey("abcd efgh-jkmn pqrs tvwx yz01"), "ABCDEFGHJKMNPQRSTVWXYZ01");
		assert.equal(normalizeRecoveryKey("ilo0-0000-0000-0000-0000-0000"), "11000000000000000000000000".slice(0, 24));
		assert.equal(normalizeRecoveryKey("too short"), null);
		assert.equal(normalizeRecoveryKey("UUUU-0000-0000-0000-0000-0000"), null, "U is not in the alphabet");
	});
	it("opens the data key; a wrong recovery key opens nothing", () => {
		const key = newDataKey();
		const r = newRecoveryKey();
		const seal = sealWithRecovery(key, r);
		assert.deepEqual(openWithRecovery(seal, r.toLowerCase().replace(/-/g, " ")), key);
		assert.equal(openWithRecovery(seal, newRecoveryKey()), null);
		assert.equal(openWithRecovery(seal, "not a key"), null);
	});
});
