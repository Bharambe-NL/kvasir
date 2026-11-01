/**
 * Motion (Kvasir P7-5, D144): every animation the app defines is off when
 * the Mac asks for reduced motion, and E-ink turns all motion off. The
 * shared durations and easing exist as tokens.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import { describe, it } from "node:test";

const CSS = fs.readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "");
const css = strip(CSS);

/** Every rule body that sets `animation:` to something other than none, with its selector. */
function animatedSelectors(): string[] {
	const out: string[] = [];
	for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
		const selector = m[1]!.trim();
		if (selector.startsWith("@") || /^(from|to|\d)/.test(selector)) continue;
		if (/(^|;|\s)animation\s*:(?!\s*none)/.test(m[2]!)) out.push(...selector.split(",").map((s) => s.trim()));
	}
	return out;
}

/** Selectors switched to `animation: none` inside a reduced-motion block. */
function reducedSelectors(): Set<string> {
	const out = new Set<string>();
	const re = /@media \(prefers-reduced-motion: reduce\) \{/g;
	for (let m = re.exec(css); m; m = re.exec(css)) {
		let depth = 1;
		let i = re.lastIndex;
		while (depth > 0 && i < css.length) depth += css[i] === "{" ? 1 : css[i] === "}" ? -1 : 0, i++;
		for (const r of css.slice(re.lastIndex, i - 1).matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
			if (/animation\s*:\s*none/.test(r[2]!)) for (const s of r[1]!.split(",")) out.add(s.trim());
		}
	}
	return out;
}

describe("motion", () => {
	it("defines the shared durations and easing", () => {
		assert.match(CSS, /--motion-fast: 150ms;/);
		assert.match(CSS, /--motion-base: 200ms;/);
		assert.match(CSS, /--ease-soft: cubic-bezier\(/);
	});

	it("offers lh-fade-in and lh-rise-in on the shared tokens", () => {
		assert.match(css, /\.lh-fade-in \{\s*animation: lh-fade-in var\(--motion-fast\) var\(--ease-soft\);/);
		assert.match(css, /\.lh-rise-in \{\s*animation: lh-rise-in var\(--motion-base\) var\(--ease-soft\);/);
	});

	it("turns every animation off for reduced motion", () => {
		const reduced = reducedSelectors();
		const missing = animatedSelectors().filter((s) => !reduced.has(s));
		assert.deepEqual(missing, []);
	});

	it("turns all motion off in E-ink", () => {
		assert.match(css, /\.theme-eink \*,\s*\.theme-eink \*::before,\s*\.theme-eink \*::after \{\s*animation: none !important;\s*transition: none !important;/);
	});
});
