/**
 * Lesson citation links (Kvasir P2-6, D084) through the real markdown
 * renderer (MessageResponse): a `#src-` link becomes the chip, a click opens
 * the source panel on the unit, an unresolved link falls back to its text,
 * and ordinary links, math and sanitising are unchanged. linkedom DOM, a
 * faked /api/graph/source-unit; no server, no model.
 */
import React, { act } from "react";
(globalThis as Record<string, unknown>).React = React;
(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { parseHTML } from "linkedom";
import { MessageResponse } from "../components/ai-elements/message.tsx";

const dom = parseHTML("<html><body></body></html>");
Object.assign(globalThis, { window: dom.window, document: dom.document });
const originalFetch = globalThis.fetch;
let mounted: { root: Root; host: HTMLElement } | null = null;
afterEach(async () => {
	if (mounted) await act(async () => mounted!.root.unmount());
	mounted?.host.remove();
	mounted = null;
	globalThis.fetch = originalFetch;
});
const settle = () => act(async () => { for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0)); });
const q = (id: string) => document.querySelector<HTMLElement>(`[data-testid='${id}']`);

const LESSON = "Firms must adopt a strategy [Regulation (EU) 2022/2554, Art. 28(2)](#src-ver_dfa4295bb03c-U412). See [the EBA](https://www.eba.europa.eu). Math $a<b$ holds. <script>alert(1)</script>";
const VIEW = { label: "Regulation (EU) 2022/2554, Art. 28(2)", documentTitle: "REGULATION (EU) 2022/2554", versionLabel: "2022-12-14", path: ["Chapter V", "Section I", "Article 28", "paragraph 2"], unitText: "As part of their ICT risk management framework, financial entities shall adopt a strategy." };

async function mount(md: string) {
	const host = document.createElement("div");
	document.body.append(host);
	const root = createRoot(host);
	mounted = { root, host };
	await act(async () => root.render(<MessageResponse>{md}</MessageResponse>));
	await settle();
	return host;
}

describe("lesson citation links (D084)", () => {
	it("render as the chip; other links, math and sanitising are unchanged", () => {
		const html = renderToStaticMarkup(<MessageResponse>{LESSON}</MessageResponse>);
		assert.match(html, /data-testid="source-cite"[^>]*>.*Regulation \(EU\) 2022\/2554, Art\. 28\(2\)<\/span><\/button>/);
		assert.doesNotMatch(html, /href="#src-/, "the citation is no longer a plain link");
		assert.match(html, /data-streamdown="link"[^>]*>the EBA</, "an ordinary link keeps Streamdown's link handling");
		assert.match(html, /class="katex"/);
		assert.doesNotMatch(html, /<script>/);
	});

	it("a click opens the source panel on the unit", async () => {
		const asked: string[] = [];
		globalThis.fetch = (async (url: string) => {
			asked.push(String(url));
			return new Response(JSON.stringify(VIEW));
		}) as typeof fetch;
		await mount(LESSON);
		await act(async () => void q("source-cite")!.dispatchEvent(new dom.window.Event("click", { bubbles: true })));
		await settle();
		assert.deepEqual(asked, ["/api/graph/source-unit?ref=ver_dfa4295bb03c-U412"]);
		const panel = q("citation-panel")!;
		assert.match(panel.textContent!, /Version 2022-12-14/);
		assert.match(panel.textContent!, /Chapter V > Section I > Article 28 > paragraph 2/);
		assert.equal(q("citation-unit-text")!.textContent, VIEW.unitText);
		assert.equal(panel.querySelector("mark"), null, "a lesson link names a paragraph, not a quote");
	});

	it("an unresolved link falls back to its text", async () => {
		globalThis.fetch = (async () => new Response(JSON.stringify({ error: "Source not found" }), { status: 404 })) as typeof fetch;
		const host = await mount(LESSON);
		await act(async () => void q("source-cite")!.dispatchEvent(new dom.window.Event("click", { bubbles: true })));
		await settle();
		assert.equal(q("source-cite"), null);
		assert.match(host.textContent!, /Regulation \(EU\) 2022\/2554, Art\. 28\(2\)/);
		assert.equal(q("citation-panel"), null);
	});
});
