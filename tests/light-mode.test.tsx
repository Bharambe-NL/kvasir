/**
 * Light mode (Kvasir P7-2, D128 to D131): the settings shape, the tokens
 * (every themed colour holds a light and a dark value), the defaults the
 * settings rows show, the mode class, the Mode and background rows, and the
 * light palette's contrast, computed from the token values themselves.
 */
import React from "react";
(globalThis as Record<string, unknown>).React = React;

import assert from "node:assert/strict";
import fs from "node:fs";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { DEFAULT_BACKGROUNDS, FACTORY_SETTINGS, sanitizeUserSettings } from "../src/core/index.ts";
import { applyModeClass, resolveAppearance } from "../components/settings/appearance.tsx";
import { AppearanceSection } from "../components/settings/appearance-section.tsx";

const CSS = fs.readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
const ROOT = CSS.slice(CSS.indexOf(":root {"), CSS.indexOf("\n}\n", CSS.indexOf(":root {")));
const tokens = new Map([...ROOT.matchAll(/^\t(--[a-z0-9-]+): ([^;]+);/gm)].map((m) => [m[1]!, m[2]!]));

/** The light and dark halves of a token (a per-mode hook's fallback included). */
function halves(name: string): { light: string; dark: string } {
	const v = tokens.get(name)!;
	const m = /^light-dark\((.+), (.+)\)$/.exec(v);
	assert.ok(m, `${name} is not light-dark(): ${v}`);
	const unhook = (x: string) => /^var\(--lh-[a-z]+-[a-z-]+, (.+)\)$/.exec(x)?.[1] ?? x;
	// split at the top-level comma
	let depth = 0;
	const inner = v.slice("light-dark(".length, -1);
	for (let i = 0; i < inner.length; i++) {
		if (inner[i] === "(") depth++;
		else if (inner[i] === ")") depth--;
		else if (inner[i] === "," && depth === 0) return { light: unhook(inner.slice(0, i).trim()), dark: unhook(inner.slice(i + 1).trim()) };
	}
	throw new Error(name);
}

describe("the settings shape (D128, D131)", () => {
	it("mode takes dark, light or system; lightBackground is a hex or null; defaults unchanged", () => {
		const ok = sanitizeUserSettings({ version: 1, appearance: { mode: "system", lightBackground: "#fafafa", background: "#101010" } })!;
		assert.deepEqual(ok.appearance, { mode: "system", lightBackground: "#fafafa", background: "#101010" });
		const bad = sanitizeUserSettings({ version: 1, appearance: { mode: "sepia", lightBackground: "paper" } })!;
		assert.equal(bad.appearance?.mode, undefined);
		assert.equal(bad.appearance?.lightBackground, null);
		assert.equal(FACTORY_SETTINGS.appearance.mode, "dark");
		assert.equal(FACTORY_SETTINGS.appearance.lightBackground, null);
		assert.equal(resolveAppearance(undefined).mode, "dark");
	});
});

describe("the tokens (D129)", () => {
	const SAME_IN_BOTH = ["--heat-low", "--heat-mid", "--heat-high", "--confidence-0", "--confidence-30", "--confidence-50", "--confidence-70", "--confidence-90", "--confidence-100", "--scrim", "--on-accent", "--paper"];
	it("every colour token holds a light and a dark value, except the ones meant to read the same", () => {
		const colour = [...tokens].filter(([, v]) => /#|rgb|oklch|light-dark|var\(--lh-/.test(v) && !v.startsWith("var(--foreground)")).map(([k]) => k);
		const single = colour.filter((k) => !tokens.get(k)!.startsWith("light-dark("));
		assert.deepEqual(single.sort(), [...SAME_IN_BOTH].sort());
	});
	it("the dark halves are today's palette; the light background is warm paper", () => {
		assert.deepEqual(halves("--background"), { light: "#faf8f4", dark: "#141414" });
		assert.deepEqual(halves("--card"), { light: "#f2efe9", dark: "#1c1c1c" });
		assert.deepEqual(halves("--foreground"), { light: "#1c1b19", dark: "#e6e6e6" });
		assert.deepEqual(halves("--border"), { light: "#d9d4ca", dark: "#434343" });
	});
	it("the settings rows show the stylesheet's defaults", () => {
		assert.deepEqual(DEFAULT_BACKGROUNDS, { dark: halves("--background").dark, light: halves("--background").light });
	});
	it("the mode classes set the colour scheme; dark: also covers System on a dark Mac", () => {
		assert.match(CSS, /\.dark \{\s*color-scheme: dark;/);
		assert.match(CSS, /\.light \{\s*color-scheme: light;/);
		assert.match(CSS, /\.system \{\s*color-scheme: light dark;/);
		assert.match(CSS, /@media \(prefers-color-scheme: dark\) \{\s*&:is\(\.system \*\)/);
	});
});

describe("the mode class", () => {
	it("one mode class at a time on <html>", () => {
		const set = new Set(["dark", "lh-electron"]);
		const classList = { add: (c: string) => void set.add(c), remove: (c: string) => void set.delete(c) } as unknown as DOMTokenList;
		applyModeClass({ classList }, "light");
		assert.deepEqual([...set].sort(), ["lh-electron", "light"]);
		applyModeClass({ classList }, "system");
		assert.deepEqual([...set].sort(), ["lh-electron", "system"]);
	});
});

describe("Settings > Appearance", () => {
	const text = (h: string) => h.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
	it("Mode is a live select with Dark, Light and System; a background row per mode", () => {
		const html = renderToStaticMarkup(<AppearanceSection appearance={{ mode: "light" }} onSectionChange={() => {}} />);
		const mode = /<select[^>]*aria-label="mode"[^>]*>([\s\S]*?)<\/select>/.exec(html)!;
		assert.doesNotMatch(mode[0], /disabled/);
		assert.equal(text(mode[1]!), "Dark Light System");
		assert.match(mode[1]!, /value="light" selected/);
		assert.doesNotMatch(html, /Coming soon/);
		assert.match(text(html), /Dark background Empty = #141414/);
		assert.match(text(html), /Light background Empty = #faf8f4/);
	});
});

// ─── contrast, from the token values (WCAG 2) ───────────────────────────────

function parseColour(c: string): [number, number, number] {
	if (c.startsWith("#")) {
		const h = c.length === 4 ? [...c.slice(1)].map((x) => x + x).join("") : c.slice(1, 7);
		return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255) as [number, number, number];
	}
	const m = /^oklch\(([\d.]+)%? ([\d.]+) ([\d.]+)\)$/.exec(c);
	assert.ok(m, c);
	let L = Number(m[1]);
	if (c.includes("%")) L /= 100;
	const C = Number(m[2]);
	const h = (Number(m[3]) * Math.PI) / 180;
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
export const contrast = (a: string, b: string) => {
	const [x, y] = [luminance(parseColour(a)), luminance(parseColour(b))].sort((p, q) => q - p);
	return (x! + 0.05) / (y! + 0.05);
};

describe("light palette contrast (D129, WCAG AA 4.5:1 for text)", () => {
	const TEXT = ["--foreground", "--muted-foreground", "--danger", "--danger-soft", "--warning", "--success", "--destructive"];
	for (const surface of ["--background", "--card"]) {
		for (const t of TEXT) {
			it(`${t} on ${surface}`, () => {
				const r = contrast(halves(t).light, halves(surface).light);
				assert.ok(r >= 4.5, `${t} on ${surface} in light mode is ${r.toFixed(2)}:1`);
			});
		}
	}
});
