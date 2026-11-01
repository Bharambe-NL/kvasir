/**
 * The citation chip and side panel (Kvasir P2-4, D077 to D079). "Done
 * when": render tests; works from the canvas, the Chains table and the
 * transcript. The Chains table and the transcript's graph context card run
 * the full flow: chip, click, panel with the quote marked, Esc closes. The
 * canvas detail card uses the same chip and panel hook; its wiring is
 * checked in the source here and clicked in the browser check. linkedom
 * DOM, a faked /api/graph/citations; no server, no model.
 */
import React, { act, useState } from "react";
(globalThis as Record<string, unknown>).React = React;
(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { afterEach, describe, it } from "node:test";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { parseHTML } from "linkedom";
import { CitationChip, CitationPanel, highlight, useCitationPanel } from "../components/citation-chip.tsx";
import { ChainTableBody, type ChainSort } from "../components/chain-table.tsx";
import { GraphContextCard } from "../components/graph-context-card.tsx";
import type { CitationView, GraphChain, GraphNode } from "../src/core/index.ts";

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
async function mount(node: React.ReactNode) {
	const host = document.createElement("div");
	document.body.append(host);
	const root = createRoot(host);
	mounted = { root, host };
	await act(async () => root.render(node));
	await settle();
	return host;
}
const q = (id: string) => document.querySelector<HTMLElement>(`[data-testid='${id}']`);
const click = async (el: Element) => { await act(async () => void el.dispatchEvent(new dom.window.Event("click", { bubbles: true }))); await settle(); };
// linkedom has no KeyboardEvent: a plain keydown event carrying the key.
const esc = async () => {
	const e = new dom.window.Event("keydown");
	Object.defineProperty(e, "key", { value: "Escape" });
	await act(async () => void window.dispatchEvent(e));
	await settle();
};

const VIEW: CitationView = {
	id: "cit_1", nodeId: "a", label: "Regulation (EU) 2022/2554, Art. 28(2)",
	documentTitle: "Regulation (EU) 2022/2554 on digital operational resilience", versionLabel: "2022-12-14",
	path: ["Chapter V", "Section I", "Article 28", "paragraph 2"], heading: "General principles",
	quote: "shall adopt, and regularly review, a strategy",
	unitText: "As part of their ICT risk management framework, financial entities shall adopt, and regularly review, a strategy on ICT third-party risk.",
};
let requested: string[] = [];
function fakeCitations(byNode: Record<string, CitationView[]>) {
	requested = [];
	globalThis.fetch = (async (url: string) => {
		requested.push(String(url));
		const ids = decodeURIComponent(String(url).split("nodeIds=")[1] ?? "").split(",");
		return new Response(JSON.stringify(Object.fromEntries(ids.filter((id) => byNode[id]).map((id) => [id, byNode[id]]))));
	}) as typeof fetch;
}
/** The shared checks once the panel is open. */
function assertPanel() {
	const panel = q("citation-panel")!;
	assert.ok(panel, "the panel opens");
	assert.equal(panel.getAttribute("role"), "dialog");
	assert.match(panel.textContent!, /Regulation \(EU\) 2022\/2554 on digital operational resilience/);
	assert.match(panel.textContent!, /Version 2022-12-14/);
	assert.match(panel.textContent!, /Chapter V > Section I > Article 28 > paragraph 2/);
	assert.match(panel.textContent!, /General principles/);
	const mark = q("citation-unit-text")!.querySelector("mark")!;
	assert.equal(mark.textContent, "shall adopt, and regularly review, a strategy");
	assert.equal(q("citation-unit-text")!.textContent, VIEW.unitText);
}

describe("CitationChip (D077)", () => {
	it("shows the first label plus +N, titled 'Open the source', and nothing when uncited", async () => {
		assert.equal(renderToStaticMarkup(<CitationChip labels={undefined} onOpen={() => {}} />), "");
		assert.equal(renderToStaticMarkup(<CitationChip labels={[]} onOpen={() => {}} />), "");
		let opened = 0;
		await mount(<div onClick={() => assert.fail("the click must not reach the row")}><CitationChip labels={["Regulation (EU) 2022/2554, Art. 28(2)", "Recital 12"]} onOpen={() => opened++} /></div>);
		assert.equal(q("citation-chip")!.textContent, "Regulation (EU) 2022/2554, Art. 28(2) +1");
		assert.equal(q("citation-chip")!.getAttribute("title"), "Open the source");
		await click(q("citation-chip")!);
		assert.equal(opened, 1);
	});
});

describe("CitationPanel (D078)", () => {
	it("marks every occurrence of the quote", () => {
		const html = renderToStaticMarkup(<p>{highlight("a b a b a", "a")}</p>);
		assert.equal((html.match(/<mark/g) ?? []).length, 3);
	});
	it("lists every citation, says when the text is not stored, and closes on X", async () => {
		let closed = 0;
		await mount(<CitationPanel views={[VIEW, { ...VIEW, id: "cit_2", unitText: null, versionLabel: "2024-01-17", path: ["Recital 12"], heading: undefined, quote: "This Regulation aims to consolidate" }]} onClose={() => closed++} />);
		assertPanel();
		assert.equal(document.querySelectorAll("[data-testid='citation-view']").length, 2);
		assert.match(q("citation-panel")!.textContent!, /The source text for this version is not stored\./);
		assert.equal(q("citation-close")!.getAttribute("aria-label"), "Close source");
		await click(q("citation-close")!);
		assert.equal(closed, 1);
	});
});

describe("the Chains table (Done when)", () => {
	const node = (id: string, name: string): GraphNode => ({ id, name, statement: `Statement ${id}.`, aliases: [], createdAt: "2026-10-01T00:00:00.000Z", provenance: [{ chatId: "chat1", messageId: "" }] }) as unknown as GraphNode;
	const chain: GraphChain = { id: "arg_1", premises: ["b"], conclusion: "a", provenance: [], createdAt: "2026-10-01T00:00:00.000Z" };
	function Harness() {
		const citation = useCitationPanel();
		return (
			<>
				<ChainTableBody
					nodes={[node("a", "Third-party risk"), node("b", "ICT risk")]} chains={[chain]} sessions={{ chat1: "DORA" }} fileSources={{}}
					query="" onQuery={() => {}} sort={{ col: "name", dir: 1 } as ChainSort} onSort={() => {}}
					selection={new Set()} expandedClusters={new Set(["chat1"])} expandedChains={new Set(["arg_1"])}
					onToggleCluster={() => {}} onToggleChain={() => {}} onToggleNodes={() => {}} onClear={() => {}} onDelete={() => {}} onClose={() => {}}
					citations={{ a: ["Regulation (EU) 2022/2554, Art. 28(2)"] }} onOpenCitation={citation.open}
				/>
				{citation.panel}
			</>
		);
	}
	it("a cited statement row shows its chip; a click opens the panel; Esc closes it", async () => {
		fakeCitations({ a: [VIEW] });
		await mount(<Harness />);
		assert.ok(q("prop-row-a")!.querySelector("[data-testid='citation-chip-a']"), "the chip sits in the statement row");
		assert.equal(q("citation-chip-b"), null, "an uncited row has no chip");
		await click(q("citation-chip-a")!);
		assert.deepEqual(requested, ["/api/graph/citations?nodeIds=a"]);
		assertPanel();
		await esc();
		assert.equal(q("citation-panel"), null);
	});
});

describe("the transcript's graph context card (Done when, D079)", () => {
	it("fetches labels on expand, shows chips for cited propositions, and opens the panel", async () => {
		fakeCitations({ a: [VIEW] });
		await mount(<GraphContextCard data={{ propositions: [{ id: "a", name: "Third-party risk", statement: "Statement a." }, { id: "b", name: "ICT risk", statement: "Statement b." }], chains: [] }} />);
		assert.deepEqual(requested, [], "nothing is fetched while collapsed");
		await click(q("graph-context-toggle")!);
		assert.deepEqual(requested, ["/api/graph/citations?nodeIds=a%2Cb"]);
		assert.equal(q("citation-chip-a")!.textContent, "Regulation (EU) 2022/2554, Art. 28(2)");
		assert.equal(q("citation-chip-b"), null);
		await click(q("citation-chip-a")!);
		assertPanel();
		await esc();
		assert.equal(q("citation-panel"), null);
	});
});

describe("the canvas detail card (Done when)", () => {
	it("renders the chip from the snapshot and opens the same panel", () => {
		const src = readFileSync(new URL("../components/graph-view.tsx", import.meta.url), "utf8");
		const card = src.slice(src.indexOf("{selected.node.statement}"), src.indexOf('<div className="text-xs text-muted-foreground">Sessions</div>'));
		assert.match(card, /snapshot\?\.citations\?\.\[selected\.node\.id\]/);
		assert.match(card, /<CitationChip\s+labels=\{snapshot\.citations\[selected\.node\.id\]\}\s+outdated=\{snapshot\.outdated\?\.includes\(selected\.node\.id\) \?\? false\}\s+onOpen=\{\(\) => citation\.open\(selected\.node\.id\)\}\s+\/>/);
		assert.match(src, /const citation = useCitationPanel\(\);/);
		assert.match(src, /\{citation\.panel\}/);
		assert.match(src, /citations=\{snapshot\?\.citations\}\s*outdated=\{snapshot\?\.outdated\}\s*onOpenCitation=\{citation\.open\}/, "the Chains table overlay gets the same map, the outdated list and the opener");
	});
});

describe("outdated citations (Kvasir P2-5, D083)", () => {
	it("the chip shows an Outdated tag only when outdated", async () => {
		await mount(<><CitationChip labels={["A"]} outdated onOpen={() => {}} testid="c1" /><CitationChip labels={["B"]} onOpen={() => {}} testid="c2" /></>);
		assert.equal(q("c1")!.querySelector("[data-testid='citation-outdated']")!.textContent, "Outdated");
		assert.equal(q("c2")!.querySelector("[data-testid='citation-outdated']"), null);
	});

	it("the panel says where the text changed, with that version's text, or that it was removed", async () => {
		const changed = { ...VIEW, outdated: { versionLabel: "2024-06-01", kind: "changed" as const, text: "Financial entities shall adopt a strategy on ICT third-party risk." } };
		const removed = { ...VIEW, id: "cit_2", outdated: { versionLabel: "2024-06-01", kind: "removed" as const } };
		await mount(<CitationPanel views={[changed, removed, { ...VIEW, id: "cit_3" }]} onClose={() => {}} />);
		const notes = [...document.querySelectorAll("[data-testid='citation-outdated-note']")].map((n) => n.textContent);
		assert.deepEqual(notes, [
			"Changed in version 2024-06-01Financial entities shall adopt a strategy on ICT third-party risk.",
			"Removed in version 2024-06-01",
		]);
	});

	it("the transcript card tags an outdated proposition's chip", async () => {
		fakeCitations({ a: [{ ...VIEW, outdated: { versionLabel: "2024-06-01", kind: "removed" } }] });
		await mount(<GraphContextCard data={{ propositions: [{ id: "a", name: "Third-party risk", statement: "Statement a." }], chains: [] }} />);
		await click(q("graph-context-toggle")!);
		assert.ok(q("citation-chip-a")!.querySelector("[data-testid='citation-outdated']"));
	});
});
