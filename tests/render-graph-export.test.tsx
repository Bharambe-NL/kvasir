/**
 * The Export menu's states (Kvasir P6-3, D100, D105), rendered to static
 * markup: closed, open, exporting, done for each kind with and without the
 * Show in Finder bridge, and the error line.
 */
import React from "react";
(globalThis as Record<string, unknown>).React = React;

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ExportMenuView, type ExportState } from "../components/graph-export.tsx";

const html = (state: ExportState, open = true, reveal = true) =>
	renderToStaticMarkup(<ExportMenuView open={open} onToggle={() => {}} state={state} onExport={() => {}} onReveal={reveal ? () => {} : undefined} />);
const text = (s: string) => s.replace(/<[^>]+>/g, " ").replace(/&gt;/g, ">").replace(/\s+/g, " ").trim();

describe("the Export menu", () => {
	it("closed: only the Export button", () => {
		assert.equal(text(html({ status: "idle" }, false)), "Export");
	});
	it("open: the two items", () => {
		assert.equal(text(html({ status: "idle" })), "Export Obsidian vault Anki deck");
	});
	it("exporting: the items are disabled", () => {
		const h = html({ status: "exporting", kind: "anki" });
		assert.match(text(h), /Exporting\.\.\.$/);
		assert.equal((h.match(/disabled=""/g) ?? []).length, 2);
	});
	it("done: where, the Anki import hint, and Show in Finder only with the bridge", () => {
		const done = { status: "done", path: "/Users/s/Documents/Kvasir exports/2026-11-01 1030", display: "~/Documents/Kvasir exports/2026-11-01 1030", propositions: 138 } as const;
		assert.match(text(html({ ...done, kind: "obsidian" })), /Exported 138 propositions to ~\/Documents\/Kvasir exports\/2026-11-01 1030\/ Show in Finder$/);
		assert.match(text(html({ ...done, kind: "anki" })), /2026-11-01 1030\/ Import it in Anki with File > Import\. Show in Finder$/);
		assert.doesNotMatch(text(html({ ...done, kind: "anki" }, true, false)), /Show in Finder/);
	});
	it("error: the reason", () => {
		assert.match(text(html({ status: "error", message: "disk full" })), /Export failed: disk full$/);
	});
});
