/**
 * The review opt-out controls (P1-8, D053, D056): the Chains table cluster
 * row toggle and tag, the shared useReviewExclusions hook, and the sidebar
 * menu item. linkedom DOM, a faked /api/review/exclusions and a fake events
 * source: no server, network or model.
 */
import React, { act } from "react";
(globalThis as Record<string, unknown>).React = React;
(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { afterEach, describe, it } from "node:test";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { parseHTML } from "linkedom";
import { ChainTableBody, type ChainSort } from "../components/chain-table.tsx";
import { EXCLUDE_LABEL, EXCLUDED_TAG, INCLUDE_LABEL, useReviewExclusions, type ReviewExclusions } from "../components/review/use-review-exclusions.ts";
import { ServerEventsProvider, type NotifySource } from "../components/server-events.tsx";
import type { GraphChain, GraphNode } from "../src/core/contracts.ts";

const dom = parseHTML("<html><body></body></html>");
Object.assign(globalThis, { window: dom.window, document: dom.document, CustomEvent: dom.window.CustomEvent });
const originalFetch = globalThis.fetch;

let mounted: { root: Root; host: HTMLElement } | null = null;
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

const node = (id: string, chatId: string): GraphNode =>
	({ id, name: `Name ${id}`, statement: `Statement ${id}.`, aliases: [], createdAt: "2026-09-20T10:00:00.000Z", provenance: [{ chatId, messageId: `m_${id}` }] }) as unknown as GraphNode;
const BASE = {
	nodes: [node("a", "chat1"), node("b", "notes1")],
	chains: [] as GraphChain[],
	sessions: { chat1: "Ethics lesson" },
	fileSources: { notes1: "notes/raw/ethics.md" },
	query: "",
	onQuery: () => {},
	sort: { col: "name", dir: 1 } as ChainSort,
	onSort: () => {},
	selection: new Set<string>(),
	expandedClusters: new Set<string>(),
	expandedChains: new Set<string>(),
	onToggleCluster: () => {},
	onToggleChain: () => {},
	onToggleNodes: () => {},
	onClear: () => {},
	onDelete: () => {},
	onClose: () => {},
};

describe("Chains table cluster rows (D053, D056)", () => {
	it("show no control when the table is not wired for review", () => {
		const html = renderToStaticMarkup(<ChainTableBody {...BASE} />);
		assert.equal(html.includes("cluster-review-toggle"), false);
	});

	it("offer Exclude from review on chat and notes clusters, and Include in review with the tag once excluded", () => {
		const html = renderToStaticMarkup(<ChainTableBody {...BASE} reviewExcluded={new Set(["notes1"])} onReviewExclusion={() => {}} />);
		const chat = html.split('data-testid="cluster-group-chat1"')[1]!.split('data-testid="cluster-group-')[0]!;
		const notes = html.split('data-testid="cluster-group-notes1"')[1]!.split('data-testid="cluster-group-')[0]!;
		assert.match(chat, new RegExp(`aria-pressed="false"[^>]*>${EXCLUDE_LABEL}<`));
		assert.equal(chat.includes(EXCLUDED_TAG), false);
		assert.match(notes, new RegExp(`aria-pressed="true"[^>]*>${INCLUDE_LABEL}<`));
		assert.ok(notes.includes(`data-testid="cluster-review-tag-notes1"`) && notes.includes(EXCLUDED_TAG));
		assert.deepEqual([EXCLUDE_LABEL, INCLUDE_LABEL, EXCLUDED_TAG], ["Exclude from review", "Include in review", "Not in review"]);
	});

	it("a click reports the birth session and the new state", async () => {
		const calls: [string, boolean][] = [];
		const host = await mount(<ChainTableBody {...BASE} reviewExcluded={new Set(["notes1"])} onReviewExclusion={(s, e) => calls.push([s, e])} />);
		await click(q(host, "cluster-review-toggle-chat1")!);
		await click(q(host, "cluster-review-toggle-notes1")!);
		assert.deepEqual(calls, [["chat1", true], ["notes1", false]]);
	});
});

describe("useReviewExclusions", () => {
	it("loads the list, posts a toggle, and refetches on reviews-changed", async () => {
		const posts: unknown[] = [];
		const lists = [["chat1"], ["chat1", "chat2"]];
		let gets = 0;
		globalThis.fetch = (async (_url: string, init?: RequestInit) => {
			if (init?.method === "POST") {
				posts.push(JSON.parse(String(init.body)));
				return new Response(JSON.stringify({ ok: true, changed: true, excluded: false }));
			}
			return new Response(JSON.stringify({ excluded: lists[Math.min(gets++, 1)] }));
		}) as typeof fetch;
		const events = fakeEvents();
		let last: ReviewExclusions | null = null;
		function Probe() {
			last = useReviewExclusions();
			return null;
		}
		await mount(<ServerEventsProvider connect={events.connect}><Probe /></ServerEventsProvider>);
		assert.deepEqual([...last!.excluded], ["chat1"]);
		await act(async () => last!.setExcluded("chat1", false));
		await settle();
		assert.deepEqual(posts, [{ sessionId: "chat1", excluded: false }]);
		assert.deepEqual([...last!.excluded], [], "updated without waiting for the event");
		await act(async () => events.fire("reviews-changed"));
		await settle();
		assert.deepEqual([...last!.excluded].sort(), ["chat1", "chat2"]);
	});
});

describe("sidebar session menu item (D053, D056)", () => {
	it("toggles the right-clicked chat's exclusion, sits above Delete, and reads from the shared labels", () => {
		const source = readFileSync(new URL("../components/sidebar.tsx", import.meta.url), "utf8");
		const item = source.indexOf('data-testid="ctx-review-exclusion"');
		assert.ok(item > 0);
		assert.ok(item > source.indexOf('data-testid="ctx-export-md"') && item < source.indexOf('data-testid="ctx-delete"'), "above Delete");
		const slice = source.slice(item, item + 600);
		assert.match(slice, /reviewExclusions\.setExcluded\(chatId, !reviewExclusions\.excluded\.has\(chatId\)\)/);
		assert.match(slice, /reviewExclusions\.excluded\.has\(ctxChatId\) \? INCLUDE_LABEL : EXCLUDE_LABEL/);
		assert.match(source, /const reviewExclusions = useReviewExclusions\(\);/);
	});
});
