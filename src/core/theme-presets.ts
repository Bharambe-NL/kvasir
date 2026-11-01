/**
 * The colour themes (Kvasir P7-3, D133, D134, D137). The palettes live in
 * app/globals.css (one block per theme, light-dark() pairs); this module
 * holds what code needs: the ids, the names shown in Settings, and the
 * highlight swatches. The colour guard treats it as a token file.
 */

export type ThemeId = "kvasir" | "sepia" | "forest" | "eink";

export const THEMES: readonly { id: ThemeId; name: string }[] = [
	{ id: "kvasir", name: "Kvasir" },
	{ id: "sepia", name: "Sepia" },
	{ id: "forest", name: "Forest" },
	{ id: "eink", name: "E-ink" },
];

export const THEME_IDS: readonly ThemeId[] = THEMES.map((t) => t.id);

/** The <html> class for a theme; Kvasir is the stylesheet's default. */
export const themeClass = (id: ThemeId): string | null => (id === "kvasir" ? null : `theme-${id}`);

/** Highlight colour swatches (D134): the themes' own highlights (their light
 *  values) plus blue and rose. */
export const HIGHLIGHT_SWATCHES: readonly string[] = ["#1c1b19", "#9a5b2e", "#2f7a4f", "#000000", "#3b6fd8", "#c2416b"];

/** Black or white, whichever reads better on a highlight colour (WCAG
 *  relative luminance; the crossover where both give equal contrast). */
export function onHighlight(hex: string): "#000000" | "#ffffff" {
	const h = hex.length === 4 ? [...hex.slice(1)].map((c) => c + c).join("") : hex.slice(1, 7);
	const [r, g, b] = [0, 2, 4].map((i) => {
		const v = parseInt(h.slice(i, i + 2), 16) / 255;
		return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
	});
	const L = 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
	return L > 0.179 ? "#000000" : "#ffffff";
}
