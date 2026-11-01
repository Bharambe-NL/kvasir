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
const TOKEN_FILES = new Set(["app/globals.css"]);

/** Exceptions: file, the exact text allowed there, and why. */
const ALLOWED: { file: string; text: string; why: string }[] = [
	{ file: "src/agent/subagents/headless.ts", text: "#fff", why: "the white page agent-rendered images are drawn on, not the app UI" },
	{ file: "src/agent/subagents/headless.ts", text: "#ffffff", why: "the same page background for the headless screenshot" },
	{ file: "components/graph-view.tsx", text: "#888888", why: "the canvas fallback when a token cannot be resolved" },
	{ file: "components/graph-canvas.ts", text: "rgba(", why: "turns an already resolved token colour into rgba with an alpha" },
	{ file: "components/settings/appearance-section.tsx", text: "#141414", why: "the background setting's default value, shown as its placeholder and hint" },
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
