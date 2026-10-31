/**
 * Home signals (P1-6): the retention overlay toggle ("Done when": the
 * overlay toggles), the remembered switch, the due chip and the sidebar
 * count. linkedom DOM, a faked /api/review/summary and a fake events source:
 * no server, network or model.
 */
import React, { act, useState } from "react";
(globalThis as Record<string, unknown>).React = React;
(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, it } from "node:test";
import { createRoot, type Root } from "react-dom/client";
import { parseHTML } from "linkedom";
import { DueChip, RetentionToggle } from "../components/review/retention-controls.tsx";
import { RETENTION_OVERLAY_KEY, useRetentionOverlay, useReviewSummary } from "../components/review/use-review-summary.ts";
import { ServerEventsProvider, type NotifySource } from "../components/server-events.tsx";

const dom = parseHTML("<html><body></body></html>");
const store = new Map<string, string>();
const localStorageFake = {
	getItem: (k: string) => store.get(k) ?? null,
	setItem: (k: string, v: string) => void store.set(k, v),
	removeItem: (k: string) => void store.delete(k),
	clear: () => store.clear(),
};
Object.assign(globalThis, { window: dom.window, document: dom.document, CustomEvent: dom.window.CustomEvent, localStorage: localStorageFake });
const originalFetch = globalThis.fetch;

let mounted: { root: Root; host: HTMLElement } | null = null;
beforeEach(() => store.clear());
afterEach(async () => {
	if (mounted) await act(async () => mounted!.root.unmount());
	mounted?.host.remove();
	mounted = null;
	globalThis.fetch = originalFetch;
});

const settle = () => act(async () => { for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0)); });
async function mount(node: React.ReactNode) {
	const host = document.createElement("div");
	document.body.append(host);
	const root = createRoot(host);
	mounted = { root, host };
	await act(async () => root.render(node));
	await settle();
	return host;
}
const q = (host: ParentNode, id: string) => host.querySelector<HTMLElement>(`[data-testid='${id}']`);
const click = async (el: HTMLElement) => { await act(async () => void el.dispatchEvent(new dom.window.Event("click", { bubbles: true }))); await settle(); };

function fakeEvents() {
	const handlers = new Map<string, (data: string) => void>();
	const source: NotifySource = { close() {}, onOpen() {}, onEvent: (name, cb) => void handlers.set(name, cb) };
	return { connect: () => source, fire: (name: string) => handlers.get(name)?.("{}") };
}

/** The toolbar pairing, as the graph view wires it: the remembered switch
 *  drives the toggle, and the heat the canvas would get is exposed. */
function Harness({ onHeat }: { onHeat: (heat: boolean) => void }) {
	const [on, setOn] = useRetentionOverlay();
	onHeat(on);
	return <RetentionToggle on={on} onChange={setOn} />;
}

describe("retention overlay toggle (Done when)", () => {
	it("is off by default, flips on and off, and updates aria-pressed, the legend and local storage", async () => {
		const seen: boolean[] = [];
		const host = await mount(<Harness onHeat={(h) => seen.push(h)} />);
		const toggle = q(host, "retention-toggle")!;
		assert.equal(toggle.getAttribute("aria-pressed"), "false");
		assert.equal(q(host, "retention-legend"), null);
		assert.equal(seen.at(-1), false);

		await click(toggle);
		assert.equal(q(host, "retention-toggle")!.getAttribute("aria-pressed"), "true");
		assert.ok(q(host, "retention-legend"), "the legend shows while on");
		assert.match(q(host, "retention-legend")!.textContent!, /Strong ≥ 90%.*Fading 70 to 90%.*Slipping < 70%/);
		assert.equal(store.get(RETENTION_OVERLAY_KEY), "on");
		assert.equal(seen.at(-1), true, "the canvas gets heat while on");

		await click(q(host, "retention-toggle")!);
		assert.equal(q(host, "retention-toggle")!.getAttribute("aria-pressed"), "false");
		assert.equal(q(host, "retention-legend"), null);
		assert.equal(store.get(RETENTION_OVERLAY_KEY), "off");
		assert.equal(seen.at(-1), false);
	});

	it("starts from the remembered setting (D047)", async () => {
		store.set(RETENTION_OVERLAY_KEY, "on");
		const host = await mount(<Harness onHeat={() => {}} />);
		assert.equal(q(host, "retention-toggle")!.getAttribute("aria-pressed"), "true");
	});
});

describe("due chip (D048)", () => {
	it("shows the count and opens the review page", async () => {
		let opened = 0;
		const host = await mount(<DueChip due={12} onOpen={() => opened++} />);
		assert.equal(q(host, "review-due-chip")!.textContent, "12 due");
		await click(q(host, "review-due-chip")!);
		assert.equal(opened, 1);
	});

	it("is hidden when nothing is due", async () => {
		const host = await mount(<DueChip due={0} onOpen={() => {}} />);
		assert.equal(q(host, "review-due-chip"), null);
	});
});

describe("useReviewSummary", () => {
	it("loads the summary and refetches on reviews-changed", async () => {
		const summaries = [{ due: 3, heat: { n_1: 0.95 } }, { due: 2, heat: { n_1: 0.95, n_2: 0.6 } }];
		let gets = 0;
		globalThis.fetch = (async () => new Response(JSON.stringify(summaries[Math.min(gets++, 1)]))) as typeof fetch;
		const events = fakeEvents();
		let last: unknown = null;
		function Probe() {
			last = useReviewSummary();
			return null;
		}
		await mount(<ServerEventsProvider connect={events.connect}><Probe /></ServerEventsProvider>);
		assert.deepEqual(last, summaries[0]);
		await act(async () => events.fire("reviews-changed"));
		await settle();
		assert.deepEqual(last, summaries[1]);
	});
});

describe("sidebar Review row count (D048)", () => {
	it("renders the due count on the Review row, hidden at zero", () => {
		const source = readFileSync(new URL("../components/sidebar.tsx", import.meta.url), "utf8");
		const row = source.indexOf('data-testid="open-review"');
		const slice = source.slice(row, row + 1200);
		assert.match(slice, /\{reviewDue > 0 && \(/);
		assert.match(slice, /data-testid="review-due-count"/);
		assert.match(source, /const reviewDue = useReviewSummary\(\)\?\.due \?\? 0;/);
	});
});
