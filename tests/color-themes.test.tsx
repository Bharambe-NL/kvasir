/**
 * Colour themes (Kvasir P7-3, D132 to D138): the settings shape, every
 * theme block complete and mode-aware, contrast for text and the highlight
 * in every theme and mode, the readable text on a custom highlight, the
 * Settings rows, and the E-ink rules.
 */
import React from "react";
(globalThis as Record<string, unknown>).React = React;

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { FACTORY_SETTINGS, HIGHLIGHT_SWATCHES, THEMES, onHighlight, sanitizeUserSettings, themeClass } from "../src/core/index.ts";
import { appearanceVars, applyThemeClass, resolveAppearance } from "../components/settings/appearance.tsx";
import { AppearanceSection } from "../components/settings/appearance-section.tsx";
import { CSS, block, contrast, halves } from "./colour-contrast.ts";

const ROOT = block(":root");
/** A token's value in a theme: the theme block's, else :root's (Kvasir). */
const valueIn = (theme: string, name: string) => (theme === "kvasir" ? ROOT : block(`.theme-${theme}`)).get(name) ?? ROOT.get(name)!;

describe("the settings shape (D137)", () => {
	it("theme and highlight are kept when valid, dropped when not; defaults are Kvasir and none", () => {
		assert.deepEqual(sanitizeUserSettings({ version: 1, appearance: { theme: "eink", highlight: "#3b6fd8" } })!.appearance, { theme: "eink", highlight: "#3b6fd8" });
		const bad = sanitizeUserSettings({ version: 1, appearance: { theme: "neon", highlight: "blue" } })!.appearance!;
		assert.equal(bad.theme, undefined);
		assert.equal(bad.highlight, null);
		assert.equal(FACTORY_SETTINGS.appearance.theme, "kvasir");
		assert.equal(FACTORY_SETTINGS.appearance.highlight, null);
	});
});

describe("the theme blocks (D132, D133, D138)", () => {
	const SHARED = ["--background", "--card", "--popover", "--secondary", "--muted", "--accent", "--border", "--input", "--primary-foreground", "--foreground", "--card-foreground", "--popover-foreground", "--primary", "--secondary-foreground", "--accent-foreground", "--muted-foreground", "--highlight", "--on-highlight", "--ring", "--ink-bright", "--region-saturation", "--region-lightness-light", "--region-lightness-dark", "--region-label-lightness-light", "--region-label-lightness-dark"];
	it("every theme sets the same core tokens; colours as light-dark() pairs, so Mode still picks", () => {
		for (const t of ["sepia", "forest", "eink"]) {
			const b = block(`.theme-${t}`);
			for (const name of SHARED) assert.ok(b.has(name), `${t} lacks ${name}`);
			for (const [name, v] of b) if (!name.startsWith("--region-") && name !== "--ring") assert.ok(v.startsWith("light-dark("), `${t} ${name}`);
			assert.equal(b.get("--ring"), "var(--highlight)");
		}
	});
	it("Kvasir's highlight is its old primary, so it looks as before", () => {
		assert.equal(ROOT.get("--highlight"), ROOT.get("--primary"));
		assert.deepEqual(halves(ROOT.get("--on-highlight")!), { light: halves(ROOT.get("--primary-foreground")!).light, dark: halves(ROOT.get("--primary-foreground")!).dark });
	});
	it("E-ink has no colour: every colour it sets is a grey", () => {
		const grey = (c: string) => /^#([0-9a-f]{2})\1\1$/i.test(c) || /^#(f4f4f1|ebebe7|dcdcd8|8a8a86)$/i.test(c);
		for (const [name, v] of block(".theme-eink")) {
			if (!v.startsWith("light-dark(")) continue;
			const { light, dark } = halves(v);
			assert.ok(grey(light) && grey(dark), `${name}: ${light} | ${dark}`);
		}
		assert.equal(block(".theme-eink").get("--region-saturation"), "0%");
	});
});

describe("contrast in every theme and mode (WCAG AA 4.5:1)", () => {
	const TEXT = ["--foreground", "--muted-foreground", "--danger", "--danger-soft", "--warning", "--success", "--destructive"];
	/** Kvasir dark is today's palette, kept pixel for pixel (P7-1, P7-3 plan);
	 *  this shortfall predates the themes and is raised with Sagar apart. */
	const KNOWN = new Set(["kvasir dark --danger on --card 4.46"]);
	for (const theme of THEMES.map((t) => t.id)) {
		for (const mode of ["light", "dark"] as const) {
			it(`${theme}, ${mode}: text on background and cards; text on the highlight`, () => {
				const low: string[] = [];
				for (const surface of ["--background", "--card"]) {
					for (const t of TEXT) {
						const r = contrast(halves(valueIn(theme, t))[mode], halves(valueIn(theme, surface))[mode]);
						if (r < 4.5 && !KNOWN.has(`${theme} ${mode} ${t} on ${surface} ${r.toFixed(2)}`)) low.push(`${t} on ${surface} ${r.toFixed(2)}`);
					}
				}
				const hl = contrast(halves(valueIn(theme, "--highlight"))[mode], halves(valueIn(theme, "--on-highlight"))[mode]);
				if (hl < 4.5) low.push(`on-highlight ${hl.toFixed(2)}`);
				assert.deepEqual(low, []);
			});
		}
	}
});

describe("a custom highlight (D134)", () => {
	it("text on it is black or white, whichever reads better; every swatch passes 4.5:1", () => {
		assert.equal(onHighlight("#ffd84a"), "#000000");
		assert.equal(onHighlight("#1c1b19"), "#ffffff");
		for (const hex of HIGHLIGHT_SWATCHES) assert.ok(contrast(hex, onHighlight(hex)) >= 4.5, hex);
	});
	it("sets the highlight, its text and the focus ring inline, over any theme", () => {
		const vars = appearanceVars(resolveAppearance({ theme: "sepia", highlight: "#3b6fd8" }));
		assert.deepEqual([vars["--highlight"], vars["--on-highlight"], vars["--ring"]], ["#3b6fd8", "#ffffff", "#3b6fd8"]);
		assert.equal(appearanceVars(resolveAppearance(undefined))["--highlight"], undefined, "none by default");
	});
});

describe("the theme class (D132)", () => {
	it("one theme class at a time; Kvasir has none", () => {
		const set = new Set(["dark", "theme-sepia"]);
		const classList = { add: (c: string) => void set.add(c), remove: (c: string) => void set.delete(c) } as unknown as DOMTokenList;
		applyThemeClass({ classList }, "eink");
		assert.deepEqual([...set].sort(), ["dark", "theme-eink"]);
		applyThemeClass({ classList }, "kvasir");
		assert.deepEqual([...set], ["dark"]);
		assert.equal(themeClass("kvasir"), null);
	});
});

describe("Settings > Appearance (D133, D134)", () => {
	const text = (h: string) => h.replace(/<[^>]+>/g, " ").replace(/&#x27;|&apos;/g, "'").replace(/\s+/g, " ").trim();
	it("a Theme menu showing the current preset and a Highlight colour row with six swatches", () => {
		const html = renderToStaticMarkup(<AppearanceSection appearance={{ theme: "forest", highlight: "#3b6fd8" }} onSectionChange={() => {}} />);
		// Theme is the settings menu (P7-5): the closed trigger shows the
		// choice; tests/menu-select.test.tsx opens it and picks.
		const sel = /<button[^>]*aria-label="theme"[^>]*>([\s\S]*?)<\/button>/.exec(html)!;
		assert.equal(text(sel[1]!), "Forest ▾");
		assert.match(text(html), /Highlight colour Empty = the theme's own/);
		assert.equal((html.match(/data-testid="swatch-/g) ?? []).length, 6);
		assert.match(html, /aria-label="#3b6fd8" aria-pressed="true"/);
	});
});

describe("E-ink rules (D136)", () => {
	it("switches off motion and puts a symbol before status text", () => {
		assert.match(CSS, /\.theme-eink \*,\s*\.theme-eink \*::before,\s*\.theme-eink \*::after \{\s*animation: none !important;\s*transition: none !important;/);
		for (const cls of ["text-danger", "text-warning", "text-success"]) assert.match(CSS, new RegExp(`\\.theme-eink \\.${cls}::before \\{\\s*content:`));
	});
});
