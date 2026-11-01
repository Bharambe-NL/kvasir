/**
 * No hard-coded colours (Kvasir P7-1, D123, D125): every colour in the app
 * comes from the tokens in app/globals.css, so light mode and colour themes
 * change token values, never components. This scans components/, app/ and
 * src/ for hex, rgb, hsl and oklch literals and for Tailwind palette
 * classes. Comments are skipped. Each allowed exception says why.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { it } from "node:test";

const REPO = fileURLToPath(new URL("..", import.meta.url));
const ROOTS = ["components", "app", "src"];
const TOKEN_FILES = new Set(["app/globals.css", "src/core/background-defaults.ts", "src/core/theme-presets.ts"]);

/** Exceptions: file, the exact text allowed there, and why. */
const ALLOWED: { file: string; text: string; why: string }[] = [
	{ file: "src/agent/subagents/headless.ts", text: "#fff", why: "the white page agent-rendered images are drawn on, not the app UI" },
	{ file: "src/agent/subagents/headless.ts", text: "#ffffff", why: "the same page background for the headless screenshot" },
	{ file: "components/graph-view.tsx", text: "#888888", why: "the canvas fallback when a token cannot be resolved" },
	{ file: "components/graph-canvas.ts", text: "rgba(", why: "turns an already resolved token colour into rgba with an alpha" },
	{ file: "components/graph-canvas.ts", text: "hsla(", why: "cluster regions take a hue generated from the cluster id; their saturation and lightness become theme settings in P7-3" },
];

const HEX = /(?<![&\w#])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{4}|[0-9a-fA-F]{3})(?![\w-])/g;
const FUNC = /\b(?:rgba?|hsla?|oklch|oklab|lch|lab)\(/g;
const COLORS = "red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|slate|gray|zinc|neutral|stone|white|black";
const PALETTE = new RegExp(`(?<![\\w-])(?:[a-z]+:)*(?:bg|text|border|ring|fill|stroke|from|to|via|outline|decoration|shadow|divide|placeholder|caret|accent)-(?:${COLORS})(?:-[0-9]{2,3})?(?:/[0-9]+)?(?![\\w-])`, "g");

/** Comments out, keeping line numbers; strings and URLs (://) survive. */
function stripComments(src: string): string {
	return src
		.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
		.replace(/(^|[^:"'`\\])\/\/.*$/gm, (_m, lead: string) => lead)
		.replace(/\{\/\*[\s\S]*?\*\/\}/g, (m) => m.replace(/[^\n]/g, " "));
}

function files(dir: string): string[] {
	return fs.readdirSync(path.join(REPO, dir), { withFileTypes: true }).flatMap((e) => {
		const rel = path.join(dir, e.name);
		if (e.isDirectory()) return files(rel);
		return /\.(tsx?|css)$/.test(e.name) ? [rel.split(path.sep).join("/")] : [];
	});
}

it("no hard-coded colour outside the token files (D125)", () => {
	const hits: string[] = [];
	for (const file of ROOTS.flatMap(files)) {
		if (TOKEN_FILES.has(file)) continue;
		const lines = stripComments(fs.readFileSync(path.join(REPO, file), "utf8")).split("\n");
		lines.forEach((line, i) => {
			for (const re of [HEX, FUNC, PALETTE]) {
				for (const m of line.matchAll(re)) {
					if (ALLOWED.some((a) => a.file === file && m[0] === a.text)) continue;
					hits.push(`${file}:${i + 1}: ${m[0]}`);
				}
			}
		});
	}
	assert.deepEqual(hits, [], `Use a token from app/globals.css instead:\n${hits.join("\n")}`);
});

it("every allowed exception is still needed", () => {
	for (const a of ALLOWED) {
		const src = stripComments(fs.readFileSync(path.join(REPO, a.file), "utf8"));
		assert.ok(src.includes(a.text), `${a.file} no longer contains ${a.text}; drop it from ALLOWED (${a.why})`);
	}
});

it("the scan catches what it should and skips what it should", () => {
	const scan = (src: string) => [HEX, FUNC, PALETTE].flatMap((re) => [...stripComments(src).matchAll(re)].map((m) => m[0]));
	assert.deepEqual(scan('<p className="text-red-500 hover:bg-white/10 border-sky-300" />'), ["text-red-500", "hover:bg-white/10", "border-sky-300"]);
	assert.deepEqual(scan('const c = "#e5484d"; const d = `rgba(0,0,0,.5)`; const e = "oklch(0.7 0.1 20)";'), ["#e5484d", "rgba(", "oklch("]);
	assert.deepEqual(scan('// issue #110 and #fff in a comment\n/* red-500 #abc */ const url = "https://x.test/#abc-1"; const ok = "text-danger bg-paper";'), []);
	assert.deepEqual(scan('<span>&#160;</span>'), []);
});
