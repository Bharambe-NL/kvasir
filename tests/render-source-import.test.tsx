/**
 * The import button's sources door (Kvasir P2-3, D071, D074, D075): which
 * files go where, the dialog's prefilled label, the "Cite as source" toggle
 * for Markdown, and Cancel. linkedom DOM, no server.
 */
import React, { act, useState } from "react";
(globalThis as Record<string, unknown>).React = React;
(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { createRoot, type Root } from "react-dom/client";
import { parseHTML } from "linkedom";
import { IMPORT_ACCEPT, importKindOf, planImport, preselectVersions, resolvePending, SourceImportDialog, versionChoices, type PendingSourceFile } from "../components/source-import.tsx";

const dom = parseHTML("<html><body></body></html>");
Object.assign(globalThis, { window: dom.window, document: dom.document, Element: dom.window.Element, HTMLElement: dom.window.HTMLElement, Node: dom.window.Node, CustomEvent: dom.window.CustomEvent,
	requestAnimationFrame: (cb: () => void) => setTimeout(cb, 0) as unknown as number, cancelAnimationFrame: (id: number) => clearTimeout(id) });

let mounted: { root: Root; host: HTMLElement } | null = null;
afterEach(async () => {
	if (mounted) await act(async () => mounted!.root.unmount());
	mounted?.host.remove();
	mounted = null;
});
const file = (name: string) => new File(["x"], name);
const q = (id: string) => document.querySelector<HTMLElement>(`[data-testid='${id}']`);
const qa = (id: string) => [...document.querySelectorAll<HTMLElement>(`[data-testid='${id}']`)];
const click = async (el: Element) => act(async () => void el.dispatchEvent(new dom.window.Event("click", { bubbles: true })));

describe("sorting a selection", () => {
	it("accepts notes and source files, and routes each kind", () => {
		assert.equal(IMPORT_ACCEPT, ".md,.markdown,.txt,.pdf,.xhtml,.html");
		assert.deepEqual(["dora.xhtml", "page.HTML", "gl.pdf", "notes.md", "a.markdown", "t.txt"].map(importKindOf), ["eurlex", "eurlex", "pdf", "markdown", "markdown", "notes"]);
		const { ready, pending } = planImport([file("dora.xhtml"), file("gl.pdf"), file("notes.md"), file("t.txt")]);
		assert.deepEqual(ready.notes.map((f) => f.name), ["t.txt"]);
		assert.deepEqual(ready.sources.map((s) => s.file.name), ["dora.xhtml"]);
		assert.deepEqual(pending.map((p) => [p.file.name, p.kind, p.label, p.asSource]), [["gl.pdf", "pdf", "gl.pdf", true], ["notes.md", "markdown", "notes.md", false]]);
	});

	it("folds the dialog's answers: Markdown stays notes unless cited as a source (D075)", () => {
		const { ready, pending } = planImport([file("gl.pdf"), file("a.md"), file("b.md")]);
		const answered: PendingSourceFile[] = [
			{ ...pending[0]!, label: "  Final 2019 " },
			pending[1]!,
			{ ...pending[2]!, asSource: true, label: "" },
		];
		const plan = resolvePending(ready, answered);
		assert.deepEqual(plan.notes.map((f) => f.name), ["a.md"]);
		assert.deepEqual(plan.sources.map((s) => [s.file.name, s.label]), [["gl.pdf", "Final 2019"], ["b.md", "b.md"]]);
	});
});

describe("the dialog (D074, D075)", () => {
	function Harness({ onDone }: { onDone: (r: string) => void }) {
		const [pending, setPending] = useState(planImport([file("gl.pdf"), file("notes.md")]).pending);
		return (
			<SourceImportDialog
				pending={pending}
				onChange={(i, next) => setPending((p) => p.map((x, j) => (j === i ? next : x)))}
				onImport={() => onDone(JSON.stringify(pending.map((p) => [p.label, p.asSource])))}
				onCancel={() => onDone("cancel")}
			/>
		);
	}
	async function mount(onDone: (r: string) => void) {
		const host = document.createElement("div");
		document.body.append(host);
		const root = createRoot(host);
		mounted = { root, host };
		await act(async () => root.render(<Harness onDone={onDone} />));
	}

	it("shows one row per file with the label prefilled, and the toggle only for Markdown", async () => {
		let done = "";
		await mount((r) => (done = r));
		assert.ok(q("source-import-dialog"));
		assert.deepEqual(qa("source-import-label").map((i) => (i as HTMLInputElement).value), ["gl.pdf", "notes.md"]);
		const rows = qa("source-import-row");
		assert.equal(rows[0]!.querySelector("[role='switch']"), null, "a PDF is always a source");
		const toggle = rows[1]!.querySelector("[role='switch']")!;
		assert.equal(toggle.getAttribute("aria-label"), "Cite as source");
		assert.equal(toggle.getAttribute("aria-checked"), "false");
		assert.match(document.body.textContent!, /Version label/);
		await click(toggle);
		assert.equal(rows[1]!.querySelector("[role='switch']")!.getAttribute("aria-checked"), "true");
		await click(q("source-import-confirm")!);
		assert.equal(done, JSON.stringify([["gl.pdf", true], ["notes.md", true]]));
		assert.equal(q("source-import-confirm")!.textContent, "Import");
	});

	it("Cancel imports nothing", async () => {
		let done = "";
		await mount((r) => (done = r));
		assert.equal(q("source-import-cancel")!.textContent, "Cancel");
		await click(q("source-import-cancel")!);
		assert.equal(done, "cancel");
	});

	it("renders nothing with no pending files", async () => {
		const host = document.createElement("div");
		document.body.append(host);
		const root = createRoot(host);
		mounted = { root, host };
		await act(async () => root.render(<SourceImportDialog pending={[]} onChange={() => {}} onImport={() => {}} onCancel={() => {}} />));
		assert.equal(q("source-import-dialog"), null);
	});
});

describe("Version of (Kvasir P2-5, D082)", () => {
	const DOCS = [
		{ id: "doc_gl", title: "FINAL REPORT", format: "pdf" as const, label: "EBA/GL/2019/04", fileNames: ["gl.pdf"] },
		{ id: "doc_md", title: "Policy", format: "markdown" as const, label: "v1", fileNames: ["policy.md"] },
		{ id: "doc_eu", title: "REGULATION", format: "eurlex-html" as const, label: "2022-12-14", fileNames: ["dora.xhtml"] },
	];
	it("preselects a document whose earlier file name matches, of the same format", () => {
		const { pending } = planImport([file("gl.pdf"), file("other.pdf"), file("policy.md")]);
		assert.deepEqual(preselectVersions(pending, DOCS).map((p) => p.versionOf), ["doc_gl", "", "doc_md"]);
		assert.deepEqual(versionChoices(pending[0]!, DOCS).map((d) => d.id), ["doc_gl"]);
	});
	it("passes the choice into the plan", () => {
		const { ready, pending } = planImport([file("gl.pdf")]);
		assert.deepEqual(resolvePending(ready, [{ ...pending[0]!, versionOf: "doc_gl" }]).sources.map((s) => s.versionOf), ["doc_gl"]);
		assert.deepEqual(resolvePending(ready, pending).sources.map((s) => s.versionOf), [undefined]);
	});
	it("shows the select for PDFs and cited Markdown, with A new document first", async () => {
		const host = document.createElement("div");
		document.body.append(host);
		const root = createRoot(host);
		mounted = { root, host };
		const pending = preselectVersions(planImport([file("gl.pdf"), file("policy.md")]).pending, DOCS);
		await act(async () => root.render(<SourceImportDialog pending={pending} documents={DOCS} onChange={() => {}} onImport={() => {}} onCancel={() => {}} />));
		// The settings menu select (P7-5): the trigger shows the choice; opened, the options.
		const selects = [...document.querySelectorAll<HTMLButtonElement>("[data-testid^='source-import-version-of-']")];
		assert.equal(selects.length, 1, "Markdown kept as notes has no select");
		assert.match(selects[0]!.textContent!, /EBA\/GL\/2019\/04/, "the preselected document");
		await act(async () => selects[0]!.click());
		assert.deepEqual([...document.querySelectorAll("[role='option']")].map((o) => [o.getAttribute("data-value"), o.textContent]), [["", "A new document"], ["doc_gl", "EBA/GL/2019/04"]]);
		assert.match(document.body.textContent!, /Version of/);
		await act(async () => root.render(<SourceImportDialog pending={pending.map((p) => ({ ...p, asSource: true }))} documents={DOCS} onChange={() => {}} onImport={() => {}} onCancel={() => {}} />));
		assert.equal(document.querySelectorAll("button[data-testid^='source-import-version-of-']").length, 2, "cited Markdown gets one too");
	});
});
