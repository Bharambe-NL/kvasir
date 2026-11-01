/**
 * The review page (P1-5): a keyboard-only session ("Done when"). linkedom
 * DOM, a faked fetch for /api/review, and a fake events source, so no server,
 * network or model. Every step below is driven by key events alone: Space
 * and Enter reveal, 1 to 4 rate, modifier keys are ignored.
 */
import React, { act } from "react";
(globalThis as Record<string, unknown>).React = React;
(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { afterEach, describe, it } from "node:test";
import { createRoot, type Root } from "react-dom/client";
import { parseHTML } from "linkedom";
import { ReviewSession } from "../components/review/review-session.tsx";
import { ServerEventsProvider, type NotifySource } from "../components/server-events.tsx";
import type { ReviewQueueItem, ReviewQueueView } from "../src/core/index.ts";

const dom = parseHTML("<html><body></body></html>");
Object.assign(globalThis, { self: dom.window, window: dom.window, document: dom.document, CustomEvent: dom.window.CustomEvent });
const originalFetch = globalThis.fetch;

const NOW = "2026-11-01T09:00:00.000Z";
const plus = (minutes: number) => new Date(Date.parse(NOW) + minutes * 60_000).toISOString();

const item = (nodeId: string, over: Partial<ReviewQueueItem> = {}): ReviewQueueItem => ({
	nodeId,
	name: `Name ${nodeId}`,
	phase: "new",
	question: { format: "cue", prompt: `Cue for ${nodeId}`, answer: `Answer for ${nodeId}` },
	previews: { 1: plus(1), 2: plus(6), 3: plus(10), 4: plus(8 * 24 * 60) },
	...over,
});

const view = (items: ReviewQueueItem[], over: Partial<ReviewQueueView> = {}): ReviewQueueView => ({
	now: NOW,
	items,
	stats: { reviewedToday: 0, newToday: 0, newLeft: 20, totalLeft: 200, nextDueAt: null },
	retention: null,
	...over,
});

/** A scripted /api/review: each GET returns the next view in the script
 *  (the last one repeats); POST bodies are recorded. */
function fakeApi(script: ReviewQueueView[]) {
	const posts: Record<string, unknown>[] = [];
	let gets = 0;
	globalThis.fetch = (async (_url: string, init?: RequestInit) => {
		if (init?.method === "POST") {
			posts.push(JSON.parse(String(init.body)));
			return new Response(JSON.stringify({ ok: true, duplicate: false }), { status: 200 });
		}
		const v = script[Math.min(gets, script.length - 1)]!;
		gets++;
		return new Response(JSON.stringify(v), { status: 200 });
	}) as typeof fetch;
	return { posts, gets: () => gets };
}

function fakeEvents() {
	const handlers = new Map<string, (data: string) => void>();
	const source: NotifySource = { close() {}, onOpen() {}, onEvent: (name, cb) => void handlers.set(name, cb) };
	return { connect: () => source, fire: (name: string) => handlers.get(name)?.("{}") };
}

let mounted: { root: Root; host: HTMLElement } | null = null;
afterEach(async () => {
	if (mounted) await act(async () => mounted!.root.unmount());
	mounted?.host.remove();
	mounted = null;
	globalThis.fetch = originalFetch;
});

const settle = () => act(async () => { for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0)); });

async function mount(connect: () => NotifySource) {
	const host = document.createElement("div");
	document.body.append(host);
	const root = createRoot(host);
	mounted = { root, host };
	await act(async () => root.render(<ServerEventsProvider connect={connect}><ReviewSession /></ServerEventsProvider>));
	await settle();
	return host;
}

async function press(key: string, mods: { metaKey?: boolean; ctrlKey?: boolean } = {}) {
	const event = new dom.window.Event("keydown", { bubbles: true, cancelable: true });
	Object.assign(event, { key, metaKey: false, ctrlKey: false, altKey: false, ...mods });
	await act(async () => void window.dispatchEvent(event));
	await settle();
}

const q = (host: ParentNode, id: string) => host.querySelector<HTMLElement>(`[data-testid='${id}']`);
const text = (host: ParentNode, id: string) => q(host, id)?.textContent ?? null;

describe("review session, keyboard only (Done when)", () => {
	it("Space reveals, 3 rates Good, the next card follows; Enter reveals; modifier keys do nothing", async () => {
		const api = fakeApi([view([item("n_1"), item("n_2")]), view([item("n_2")]), view([])]);
		const host = await mount(fakeEvents().connect);

		assert.equal(text(host, "review-prompt"), "Cue for n_1");
		assert.equal(text(host, "review-format"), "Cue · 1 of 2");
		assert.equal(q(host, "review-progress")!.style.width, "0%");
		assert.equal(q(host, "review-answer"), null, "the answer starts hidden");

		await press(" ");
		assert.equal(text(host, "review-answer"), "Answer for n_1");
		assert.match(text(host, "review-rate-1")!, /Again · 1 min/);
		assert.match(text(host, "review-rate-3")!, /Good · 10 min/);
		assert.match(text(host, "review-rate-4")!, /Easy · 8 d/);

		await press("3");
		assert.equal(api.posts.length, 1);
		assert.equal(api.posts[0]!.nodeId, "n_1");
		assert.equal(api.posts[0]!.rating, 3);
		assert.match(String(api.posts[0]!.id), /^rev_/);
		assert.equal(text(host, "review-prompt"), "Cue for n_2");
		assert.equal(text(host, "review-format"), "Cue · 2 of 2", "the visit keeps its size as cards are rated");
		assert.equal(q(host, "review-progress")!.style.width, "50%");
		assert.equal(q(host, "review-answer"), null, "the next card starts hidden");

		await press("1", { metaKey: true });
		await press("2", { ctrlKey: true });
		assert.equal(api.posts.length, 1, "rating keys before reveal or with modifiers do nothing");

		await press("Enter");
		assert.equal(text(host, "review-answer"), "Answer for n_2");
		await press("1", { metaKey: true });
		assert.equal(api.posts.length, 1, "a modifier never rates");
		await press("1");
		assert.equal(api.posts.length, 2);
		assert.equal(api.posts[1]!.rating, 1);
		assert.ok(q(host, "review-empty"), "the queue is done");
	});

	it("shows the name fallback as Recall (D042), the label carrying the word once (P7-5)", async () => {
		fakeApi([view([item("n_1", { question: { format: "fallback", prompt: "Recall: Name n_1", answer: "Statement." } })])]);
		const host = await mount(fakeEvents().connect);
		assert.equal(text(host, "review-format"), "Recall · 1 of 1");
		assert.equal(text(host, "review-prompt"), "Name n_1");
	});

	it("refetches on reviews-changed, so a generated question replaces the fallback", async () => {
		const events = fakeEvents();
		const api = fakeApi([
			view([item("n_1", { question: { format: "fallback", prompt: "Recall: Name n_1", answer: "Statement." } })]),
			view([item("n_1", { question: { format: "cue", prompt: "A real cue", answer: "Statement." } })]),
		]);
		const host = await mount(events.connect);
		assert.equal(text(host, "review-format"), "Recall · 1 of 1");
		await act(async () => events.fire("reviews-changed"));
		await settle();
		assert.equal(api.gets(), 2);
		assert.equal(text(host, "review-format"), "Cue · 1 of 1");
		assert.equal(text(host, "review-prompt"), "A real cue");
	});

	it("shows the counts, the retention line and the caught-up state (P7-5)", async () => {
		fakeApi([view([], { stats: { reviewedToday: 5, newToday: 3, newLeft: 17, totalLeft: 195, nextDueAt: plus(10) }, retention: { recalled: 23, total: 25 } })]);
		const host = await mount(fakeEvents().connect);
		assert.equal(text(host, "review-counts"), "0 due · 17 new left today");
		assert.equal(text(host, "review-retention"), "Retention, last 30 days: 92% of 25 scheduled reviews");
		assert.match(text(host, "review-empty")!, /All caught up\./);
		assert.equal(text(host, "review-next"), "Next review in 10 min");
		assert.equal(q(host, "review-practise")!.getAttribute("href"), "/chat/new?mode=practice");
		assert.equal(text(host, "review-practise"), "Practise instead");
	});

	it("says nothing is scheduled yet when no card is waiting (P7-5)", async () => {
		fakeApi([view([], { stats: { reviewedToday: 0, newToday: 0, newLeft: 20, totalLeft: 200, nextDueAt: null }, retention: null })]);
		const host = await mount(fakeEvents().connect);
		assert.equal(text(host, "review-empty"), "Nothing to review yet. Teach a session and its ideas come back here.");
		assert.equal(q(host, "review-practise"), null);
	});

	it("says when there are not enough scheduled reviews to measure retention", async () => {
		fakeApi([view([item("n_1")])]);
		const host = await mount(fakeEvents().connect);
		assert.equal(text(host, "review-retention"), "Retention: not enough scheduled reviews yet");
	});
});

describe("sidebar Review row (D043)", () => {
	it("sits under Practice and opens /review", () => {
		const source = readFileSync(new URL("../components/sidebar.tsx", import.meta.url), "utf8");
		const practice = source.indexOf('data-testid="new-session-practice"');
		const review = source.indexOf('data-testid="open-review"');
		assert.ok(practice > 0 && review > practice, "Review comes after Practice");
		assert.match(source.slice(review, review + 600), /router\.push\("\/review"\)/);
		assert.match(source.slice(review, review + 900), />\s*Review\s*</);
	});
});
