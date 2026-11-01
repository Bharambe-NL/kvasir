/**
 * Type roles (Kvasir P7-5, D143): the scale tokens exist, the body is
 * sans, mono comes back only for small labels, numbers, keys and code,
 * and tailwind-merge treats the role sizes as sizes. A ratchet guards the
 * rest: a component may not add explicit mono (`font-ui`, `font-mono`)
 * beyond today's uses, so new controls and body text start sans. Lower a
 * count when a file drops one; a file that needs more mono for a real
 * label, number, key or code says so here.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { cn } from "../lib/utils.ts";

const ROOT = new URL("..", import.meta.url).pathname;
const CSS = fs.readFileSync(path.join(ROOT, "app/globals.css"), "utf8");

/** Explicit mono uses per file on 2026-11-01, after the polish pass. */
const MONO_ALLOWED: Record<string, number> = {
	"components/answered-card.tsx": 1,
	"components/artifacts/demo-card.tsx": 1,
	"components/artifacts/dispatch-card.tsx": 1,
	"components/artifacts/live-tool-card.tsx": 1,
	"components/artifacts/tool-call-card.tsx": 3,
	"components/chat.tsx": 5,
	"components/composer-actions.tsx": 2,
	"components/composer.tsx": 1,
	"components/delete-node-dialog.tsx": 2,
	"components/delete-session-dialog.tsx": 1,
	"components/file-path-drop-zone.tsx": 2,
	"components/graph-context-card.tsx": 1,
	"components/graph-view.tsx": 1,
	"components/home.tsx": 1,
	"components/keyboard-shortcuts.tsx": 1,
	"components/locked-screen.tsx": 2,
	"components/md-blocks.tsx": 1,
	"components/mermaid-error.tsx": 2,
	"components/minimal-home.tsx": 6,
	"components/new-session.tsx": 1,
	"components/practice-cards.tsx": 6,
	"components/question-dock.tsx": 1,
	"components/queued-steers.tsx": 1,
	"components/session-find.tsx": 1,
	"components/settings/agent-section.tsx": 2,
	"components/settings/connection-controls.tsx": 1,
	"components/settings/controls.tsx": 1,
	"components/settings/keyboard-section.tsx": 1,
	"components/settings/keys-section.tsx": 17,
	"components/settings/model-menu.tsx": 1,
	"components/settings/security-section.tsx": 1,
	"components/settings/subscription-connections.tsx": 1,
	"components/setup-dialog.tsx": 5,
	"components/source-import.tsx": 1,
	"components/thinking-block.tsx": 1,
};

function tsxFiles(dir: string): string[] {
	return fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }).flatMap((e) => {
		const rel = path.join(dir, e.name);
		if (e.isDirectory()) return tsxFiles(rel);
		return e.name.endsWith(".tsx") ? [rel] : [];
	});
}

describe("type roles (D143)", () => {
	it("defines the five role sizes", () => {
		for (const [name, size] of [["label", "11px"], ["control", "13px"], ["title", "22px"], ["page", "28px"]] as const) {
			assert.match(CSS, new RegExp(`--text-${name}: ${size};`));
		}
		assert.match(CSS, /--text-body: var\(--lh-prose-size\);/);
	});

	it("sets the body in sans and brings mono back only for labels, numbers, keys and code", () => {
		assert.match(CSS, /body \{[^}]*font-family: var\(--font-prose\);/);
		assert.match(CSS, /:where\(\.uppercase, \.tabular-nums, kbd, code, pre, samp\) \{\s*font-family: var\(--font-ui\);/);
	});

	it("keeps a role size when a text colour follows it", () => {
		assert.equal(cn("text-control text-foreground"), "text-control text-foreground");
		assert.equal(cn("text-sm text-title"), "text-title");
	});

	it("adds no explicit mono beyond today's uses", () => {
		const over: string[] = [];
		for (const file of [...tsxFiles("components"), ...tsxFiles("app")]) {
			const n = (fs.readFileSync(path.join(ROOT, file), "utf8").match(/\bfont-(ui|mono)\b/g) ?? []).length;
			if (n > (MONO_ALLOWED[file] ?? 0)) over.push(`${file}: ${n} > ${MONO_ALLOWED[file] ?? 0}`);
		}
		assert.deepEqual(over, []);
	});
});
