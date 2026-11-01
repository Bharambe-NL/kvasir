/**
 * The model control's empty state (Kvasir P7-5): "No model" only once the
 * settings read says there is none; blank while the read is in flight; the
 * thinking pill hides when there is no model to set a level for.
 */
import React, { act } from "react";
(globalThis as Record<string, unknown>).React = React;
import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { createRoot, type Root } from "react-dom/client";
import { parseHTML } from "linkedom";
import { ModelControl } from "../components/model-picker.tsx";

const dom = parseHTML("<html><body></body></html>");
Object.assign(globalThis, { window: dom.window, document: dom.document, Element: dom.window.Element, HTMLElement: dom.window.HTMLElement,
	CustomEvent: dom.window.CustomEvent, IS_REACT_ACT_ENVIRONMENT: true });
const originalFetch = globalThis.fetch;
let root: Root | undefined, host: HTMLDivElement | undefined;
const model = () => document.querySelector('[data-testid="stats-model"]')?.textContent?.replace("▾", "").trim();
const thinking = () => document.querySelector('[data-testid="stats-thinking"]');

function serve(models: unknown, hold?: Promise<void>) {
	globalThis.fetch = (async (url: string) => {
		if (url === "/api/settings") {
			await hold;
			return Response.json({ settings: models === undefined ? null : { version: 1, models } });
		}
		if (url === "/api/models") return Response.json({ models: [{ provider: "openai", id: "gpt-x", supportedLevels: ["low", "high"] }] });
		throw new Error(`unexpected fetch ${url}`);
	}) as typeof fetch;
}
async function mount() {
	host = document.createElement("div"); document.body.append(host); root = createRoot(host);
	await act(async () => root!.render(<ModelControl />));
}
afterEach(async () => {
	await act(async () => root?.unmount()); host?.remove(); root = undefined; host = undefined;
	globalThis.fetch = originalFetch;
});

test("blank while the settings read is in flight, then No model, and the thinking pill hides", async () => {
	let release!: () => void;
	serve(undefined, new Promise<void>((r) => (release = r)));
	await mount();
	assert.equal(model(), "");
	assert.ok(thinking(), "the thinking pill stays while loading, so nothing jumps");
	await act(async () => release());
	assert.equal(model(), "No model");
	assert.equal(thinking(), null);
});

test("a picked model shows its name and keeps the thinking pill", async () => {
	serve({ strong: { model: { provider: "openai", id: "gpt-x" }, thinkingLevel: "high" } });
	await mount();
	assert.notEqual(model(), "No model");
	assert.ok(model());
	assert.ok(thinking());
});
