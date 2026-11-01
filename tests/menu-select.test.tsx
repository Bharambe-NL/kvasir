/**
 * The settings menu select (Kvasir P7-5): Mode and Theme open the same
 * menu the Reading font uses. The menu lists every option, marks the
 * current one, picks on click, and closes on Esc without closing the
 * settings dialog behind it.
 */
import React, { act } from "react";
(globalThis as Record<string, unknown>).React = React;
import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { createRoot, type Root } from "react-dom/client";
import { parseHTML } from "linkedom";
import { MenuSelect } from "../components/settings/controls.tsx";

const dom = parseHTML("<html><body></body></html>");
Object.assign(globalThis, { window: dom.window, document: dom.document, Element: dom.window.Element, HTMLElement: dom.window.HTMLElement,
	Node: dom.window.Node, CustomEvent: dom.window.CustomEvent, IS_REACT_ACT_ENVIRONMENT: true });
Object.assign(globalThis, {
	requestAnimationFrame: (cb: () => void) => setTimeout(cb, 0) as unknown as number,
	cancelAnimationFrame: (id: number) => clearTimeout(id),
});
let root: Root | undefined, host: HTMLDivElement | undefined;
afterEach(async () => {
	await act(async () => root?.unmount()); host?.remove(); root = undefined; host = undefined;
});

const OPTIONS = [{ value: "dark", label: "Dark" }, { value: "light", label: "Light" }, { value: "system", label: "System" }] as const;

async function mount(onChange: (v: string) => void) {
	host = document.createElement("div"); document.body.append(host); root = createRoot(host);
	await act(async () => root!.render(<MenuSelect value="light" options={OPTIONS} onChange={onChange} ariaLabel="mode" testid="select-mode" />));
}
const trigger = () => document.querySelector<HTMLButtonElement>('[data-testid="select-mode"]')!;
const options = () => [...document.querySelectorAll<HTMLButtonElement>('[role="option"]')];

test("opens to every option with the current one selected, and picks on click", async () => {
	const picked: string[] = [];
	await mount((v) => picked.push(v));
	assert.equal(options().length, 0, "closed at first");
	await act(async () => trigger().click());
	assert.deepEqual(options().map((o) => o.textContent), ["Dark", "Light", "System"]);
	assert.deepEqual(options().map((o) => o.getAttribute("aria-selected")), ["false", "true", "false"]);
	await act(async () => options()[2]!.click());
	assert.deepEqual(picked, ["system"]);
	assert.equal(options().length, 0, "a pick closes the menu");
});

test("picking the current option changes nothing; Esc closes and is claimed", async () => {
	const picked: string[] = [];
	await mount((v) => picked.push(v));
	await act(async () => trigger().click());
	await act(async () => options()[1]!.click());
	assert.deepEqual(picked, []);
	await act(async () => trigger().click());
	const esc = new dom.window.Event("keydown", { bubbles: true, cancelable: true });
	Object.assign(esc, { key: "Escape" });
	let reachedDialog = false;
	document.body.addEventListener("keydown", () => (reachedDialog = true));
	await act(async () => void document.dispatchEvent(esc));
	assert.equal(options().length, 0);
	assert.equal(reachedDialog, false);
});
