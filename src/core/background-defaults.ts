/**
 * Each mode's default background (Kvasir P7-2, D129), for the Background
 * settings rows' hint and placeholder. The palettes themselves live in
 * app/globals.css; these two values mirror its --background defaults, and
 * tests/light-mode.test.ts keeps them equal. electron/main.cjs uses the same
 * pair for the window's first paint.
 */
export const DEFAULT_BACKGROUNDS = { dark: "#141414", light: "#faf8f4" } as const;
