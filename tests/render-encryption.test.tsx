/**
 * The Security section and the Locked screen (Kvasir P6-6, D114 to D116),
 * rendered to static markup: every state and its text.
 */
import React from "react";
(globalThis as Record<string, unknown>).React = React;

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { SecurityView, type SecurityState } from "../components/settings/security-section.tsx";
import { LockedView } from "../components/locked-screen.tsx";

const noop = () => {};
const security = (state: SecurityState, error?: string) =>
	renderToStaticMarkup(<SecurityView state={state} error={error} onTurnOn={noop} onCopy={noop} onSavedChange={noop} onDone={noop} onTurnOff={noop} onConfirmOff={noop} onCancelOff={noop} />);
const text = (h: string) => h.replace(/<[^>]+>/g, " ").replace(/&#x27;|&apos;/g, "'").replace(/\s+/g, " ").trim();

describe("the Security section", () => {
	it("outside the desktop app", () => {
		assert.equal(text(security({ kind: "unavailable" })), "Encryption needs the Kvasir desktop app.");
	});
	it("off", () => {
		assert.equal(text(security({ kind: "off", busy: false })), "Encrypt data on this Mac Sessions, your knowledge graph, review history and API keys are stored encrypted. The key is kept in this Mac's keychain. Turn on encryption");
		assert.match(security({ kind: "off", busy: true }), /disabled=""/);
	});
	it("the recovery key, shown once; Done waits for the checkbox", () => {
		const s = { kind: "recovery", recoveryKey: "ABCD-EFGH-JKMN-PQRS-TVWX-YZ01", saved: false, copied: false } as const;
		assert.equal(text(security(s)), "Save your recovery key If this Mac's keychain is lost, this key is the only way to open your data. Kvasir shows it once. ABCD-EFGH-JKMN-PQRS-TVWX-YZ01 Copy I have saved my recovery key Done");
		assert.match(security(s), /disabled=""[^>]*>Done/);
		assert.doesNotMatch(security({ ...s, saved: true }), /disabled=""[^>]*>Done/);
	});
	it("on, and the confirm to turn off", () => {
		assert.equal(text(security({ kind: "on", busy: false, confirming: false })), "Encryption is on. Turn off encryption");
		assert.equal(text(security({ kind: "on", busy: false, confirming: true })), "Store your data unencrypted on this Mac? Turn off Cancel");
	});
	it("an error under the controls", () => {
		assert.match(text(security({ kind: "off", busy: false }, "This Mac's keychain is not available.")), /Turn on encryption This Mac's keychain is not available\.$/);
	});
});

describe("the Locked screen", () => {
	const locked = (wrong: boolean, value = "") => renderToStaticMarkup(<LockedView value={value} wrong={wrong} busy={false} onChange={noop} onUnlock={noop} />);
	it("asks for the recovery key; Unlock waits for input", () => {
		assert.equal(text(locked(false)), "Kvasir could not unlock your data on this Mac Enter your recovery key to open it. Kvasir stores the key in this Mac's keychain again. Recovery key Unlock");
		assert.match(locked(false), /disabled=""[^>]*>Unlock/);
		assert.doesNotMatch(locked(false, "abcd"), /disabled=""[^>]*>Unlock/);
	});
	it("says when the key is wrong", () => {
		assert.match(text(locked(true, "x")), /That recovery key does not open this data\. Unlock$/);
	});
});
