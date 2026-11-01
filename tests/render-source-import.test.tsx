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
import { IMPORT_ACCEPT, importKindOf, planImport, resolvePending, SourceImportDialog, type PendingSourceFile } from "../components/source-import.tsx";

const dom = parseHTML("<html><body></body></html>");
Object.assign(globalThis, { window: dom.window, document: dom.document });

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
