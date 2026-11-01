/**
 * Shared helpers for the colour tests (Kvasir P7-2, P7-3): read a block of
 * tokens from app/globals.css, split a light-dark() pair, and compute WCAG 2
 * contrast for hex and oklch values.
 */
import assert from "node:assert/strict";
import fs from "node:fs";

export const CSS = fs.readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");

/** The tokens of the block that starts with `selector {`. */
export function block(selector: string): Map<string, string> {
	const start = CSS.indexOf(`${selector} {`);
	assert.ok(start >= 0, `no ${selector} block`);
	const body = CSS.slice(start, CSS.indexOf("\n}\n", start));
	return new Map([...body.matchAll(/^\t(--[a-z0-9-]+): ([^;]+);/gm)].map((m) => [m[1]!, m[2]!]));
}

/** The light and dark halves of a light-dark() value (a per-mode hook's
 *  fallback included). */
export function halves(value: string): { light: string; dark: string } {
	assert.ok(value.startsWith("light-dark("), `not light-dark(): ${value}`);
	const unhook = (x: string) => /^var\(--lh-[a-z]+-[a-z-]+, (.+)\)$/.exec(x)?.[1] ?? x;
	const inner = value.slice("light-dark(".length, -1);
	let depth = 0;
	for (let i = 0; i < inner.length; i++) {
		if (inner[i] === "(") depth++;
		else if (inner[i] === ")") depth--;
		else if (inner[i] === "," && depth === 0) return { light: unhook(inner.slice(0, i).trim()), dark: unhook(inner.slice(i + 1).trim()) };
	}
	throw new Error(value);
}

function parseColour(c: string): [number, number, number] {
	if (c.startsWith("#")) {
		const h = c.length === 4 ? [...c.slice(1)].map((x) => x + x).join("") : c.slice(1, 7);
		return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255) as [number, number, number];
	}
	const m = /^oklch\(([\d.]+)(%?) ([\d.]+) ([\d.]+)\)$/.exec(c);
	assert.ok(m, c);
	const L = Number(m[1]) / (m[2] ? 100 : 1);
	const C = Number(m[3]);
	const h = (Number(m[4]) * Math.PI) / 180;
	const a = C * Math.cos(h);
	const b = C * Math.sin(h);
	const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
	const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
	const s_ = L - 0.0894841775 * a - 1.291485548 * b;
	const [l, mm, s] = [l_ ** 3, m_ ** 3, s_ ** 3];
	const lin = [4.0767416621 * l - 3.3077115913 * mm + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * mm - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * mm + 1.707614701 * s];
	return lin.map((x) => Math.min(1, Math.max(0, x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055))) as [number, number, number];
}

const luminance = (rgb: [number, number, number]) => {
	const [r, g, b] = rgb.map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
	return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
};

export function contrast(a: string, b: string): number {
	const [x, y] = [luminance(parseColour(a)), luminance(parseColour(b))].sort((p, q) => q - p);
	return (x! + 0.05) / (y! + 0.05);
}
