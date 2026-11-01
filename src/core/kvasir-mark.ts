/**
 * The Kvasir symbol (Kvasir P7-4, D139, D140): a chevron and a round gold
 * dot, a prompt and then the point. This module is the one source of its
 * geometry and brand colours. `npm run icons` (scripts/make-symbol.ts)
 * writes every icon file from it, and components/lh-mark.tsx draws the
 * in-app mark from it; tests/app-icon.test.ts keeps them in step. The
 * colour guard treats this file as a token file.
 */

/** On a 1024 by 1024 canvas. */
export const MARK = {
	chevron: { points: [[330, 352], [520, 512], [330, 672]] as const, stroke: 100 },
	dot: { cx: 676, cy: 626, r: 66 },
	squircle: { x: 64, y: 64, size: 896, r: 200 },
} as const;

/** The app icon's fixed brand colours (in the app the mark follows the
 *  theme instead, D140). */
export const MARK_COLOURS = { background: "#141414", chevron: "#f2efe8", dot: "#f2b544" } as const;

/** The chevron's path. */
export const chevronPath = (): string => {
	const [a, b, c] = MARK.chevron.points;
	return `M${a[0]} ${a[1]} L${b[0]} ${b[1]} L${c[0]} ${c[1]}`;
};

/** The bare mark (no squircle) as SVG elements, coloured as given. */
export function markElements(chevron: string, dot: string): string {
	return `<path d="${chevronPath()}" fill="none" stroke="${chevron}" stroke-width="${MARK.chevron.stroke}" stroke-linecap="round" stroke-linejoin="round"/><circle cx="${MARK.dot.cx}" cy="${MARK.dot.cy}" r="${MARK.dot.r}" fill="${dot}"/>`;
}

/** Where the squircle sits on each platform's 1024 canvas. The mark keeps
 *  its proportion to the squircle (the design's 896 and radius 200).
 *    design  the drawing's own frame
 *    flat    Windows, Linux and the favicon: the full canvas, shape baked in
 *    mac     Apple's icon grid before macOS 26: 824 centred */
export const ICON_FRAMES = {
	design: { size: 896 },
	flat: { size: 1024 },
	mac: { size: 824 },
} as const;

/** The full app icon as an SVG document, for a platform frame. */
export function appIconSvg(frame: keyof typeof ICON_FRAMES = "flat"): string {
	const size = ICON_FRAMES[frame].size;
	const k = size / MARK.squircle.size;
	const off = (1024 - size) / 2;
	const r = MARK.squircle.r * k;
	const mark = `<g transform="translate(512 512) scale(${+k.toFixed(6)}) translate(-512 -512)">${markElements(MARK_COLOURS.chevron, MARK_COLOURS.dot)}</g>`;
	return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024"><rect x="${off}" y="${off}" width="${size}" height="${size}" rx="${+r.toFixed(3)}" fill="${MARK_COLOURS.background}"/>${mark}</svg>\n`;
}

/** One Icon Composer layer (macOS 26): the shape alone on the canvas, at
 *  the flat frame's scale (Icon Composer applies the platform mask). */
export function layerSvg(part: "chevron" | "dot"): string {
	const k = ICON_FRAMES.flat.size / MARK.squircle.size;
	const inner =
		part === "chevron"
			? `<path d="${chevronPath()}" fill="none" stroke="${MARK_COLOURS.chevron}" stroke-width="${MARK.chevron.stroke}" stroke-linecap="round" stroke-linejoin="round"/>`
			: `<circle cx="${MARK.dot.cx}" cy="${MARK.dot.cy}" r="${MARK.dot.r}" fill="${MARK_COLOURS.dot}"/>`;
	return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024"><g transform="translate(512 512) scale(${+k.toFixed(6)}) translate(-512 -512)">${inner}</g></svg>\n`;
}
