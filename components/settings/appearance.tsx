"use client";
/**
 * THE APPEARANCE APPLICATION (thin settings wave, 2026-09-19): the settings
 * record's appearance section actually DOES something — resolved against
 * the factory defaults and applied as RUNTIME CSS variables on <html>.
 *
 * Why variables and not className swaps: every seam the settings touch was
 * built token-first (--font-prose, --lh-prose-size, --lh-ink-strong, …),
 * so application is setProperty and nothing re-renders. The ONE thing the
 * variables can't reach — the mode — is dark-only this wave (the light
 * palette is designed in the later design wave; <html class="dark"> is
 * static in app/layout.tsx).
 *
 * The provider is mounted at the ROOT LAYOUT level (like ActivityProvider):
 * every page picks appearance up on load. The settings page writes a
 * section, hands the new appearance here, and the vars move immediately.
 *
 * (The open-settings keyboard chord lives in components/keyboard-shortcuts.tsx
 * with the other navigations — mod+, pushes /settings from anywhere.)
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { FACTORY_SETTINGS, type AppearanceSettings } from "@/src/core";

/** The resolved, fully-concrete appearance view (delta + factory merged). */
export function resolveAppearance(delta: AppearanceSettings | undefined) {
	const f = FACTORY_SETTINGS.appearance;
	return {
		mode: delta?.mode ?? f.mode,
		background: delta?.background ?? f.background,
		lightBackground: delta?.lightBackground ?? f.lightBackground,
		fontFamily: delta?.fontFamily ?? f.fontFamily,
		proseFontSize: delta?.proseFontSize ?? f.proseFontSize,
		sessionNameSerif: delta?.sessionNameSerif ?? f.sessionNameSerif,
		mdRendering: {
			headingWeight: delta?.mdRendering?.headingWeight ?? f.mdRendering.headingWeight,
			boldColor: delta?.mdRendering?.boldColor ?? f.mdRendering.boldColor,
			italicColor: delta?.mdRendering?.italicColor ?? f.mdRendering.italicColor,
		},
	};
}

/** One colour shifted on every channel, clamped: additive offsets matching
 *  the hand-picked palettes (dark: #141414 → card +8 → accent +22 → border
 *  +47; light, P7-2: card -8 → accent -19 → border -33) — the "per-mode
 *  derivation in code" the schema promises, as the thinnest curve that
 *  keeps each palette's relationships. */
function shift(hex: string, by: number): string {
	const n = hex.length === 4
		? hex.slice(1).split("").map((c) => parseInt(c + c, 16))
		: [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
	return `#${n.map((c) => Math.max(0, Math.min(255, c + by)).toString(16).padStart(2, "0")).join("")}`;
}

/** The derived palette a chosen background implies, for its own mode only
 *  (P7-2, D130): the background, the surfaces (card/popover/secondary/
 *  muted), the accent, the edges (border/input) and primary-foreground (the
 *  text on primary = the background itself). Written to the per-mode hooks
 *  app/globals.css reads (--lh-dark-* or --lh-light-*), so a dark choice
 *  never reaches light mode and the reverse. */
export function derivedPalette(background: string, mode: "dark" | "light" = "dark"): Record<string, string> {
	const step = mode === "dark" ? { card: 8, accent: 22, border: 47 } : { card: -8, accent: -19, border: -33 };
	const card = shift(background, step.card);
	const accent = shift(background, step.accent);
	const border = shift(background, step.border);
	const hook = (name: string) => `--lh-${mode}-${name}`;
	return {
		[hook("background")]: background,
		[hook("card")]: card,
		[hook("popover")]: card,
		[hook("secondary")]: card,
		[hook("muted")]: card,
		[hook("accent")]: accent,
		[hook("border")]: border,
		[hook("input")]: border,
		[hook("primary-foreground")]: background,
	};
}

/** The <html> classes a mode may set (P7-2, D128); app/globals.css maps
 *  each to its colour-scheme. */
export const MODE_CLASSES = ["dark", "light", "system"] as const;

/** Put the mode's class on <html>, removing the others. */
export function applyModeClass(root: { classList: DOMTokenList }, mode: (typeof MODE_CLASSES)[number]): void {
	for (const c of MODE_CLASSES) if (c !== mode) root.classList.remove(c);
	root.classList.add(mode);
}

/** THE mapping: resolved appearance → the CSS variables to set on <html>.
 *  Absent entries = leave the factory stylesheet value in place. Pure —
 *  exported for tests. */
export function appearanceVars(a: ReturnType<typeof resolveAppearance>): Record<string, string> {
	const vars: Record<string, string> = {};
	if (a.background !== null) Object.assign(vars, derivedPalette(a.background, "dark"));
	if (a.lightBackground !== null) Object.assign(vars, derivedPalette(a.lightBackground, "light"));
	if (a.fontFamily !== null) {
		vars["--font-prose"] = `"${a.fontFamily}", var(--font-sans3), ui-sans-serif, system-ui, sans-serif`;
	}
	// The ONE documented reading-size variable (typography round 4): prose,
	// inputs, and session titles all read it, so one setProperty moves them.
	vars["--lh-prose-size"] = `${a.proseFontSize}px`;
	// Session names: CMU Serif by default; the toggle swaps the title font
	// to the prose family — covers chat.tsx + new-session.tsx titles with
	// zero component edits (they use the .font-title utility).
	if (!a.sessionNameSerif) vars["--font-title"] = "var(--font-prose)";
	// Markdown rendering: heading weight + the emphasis inks (the vars
	// were built "ready for the settings UI").
	vars["--lh-heading-weight"] = String(a.mdRendering.headingWeight);
	if (a.mdRendering.boldColor !== null) vars["--lh-ink-strong"] = a.mdRendering.boldColor;
	if (a.mdRendering.italicColor !== null) vars["--lh-ink-italic"] = a.mdRendering.italicColor;
	return vars;
}

/** Pure: the previously-applied names ABSENT from the next var set —
 *  these get removeProperty so the factory stylesheet value returns.
 *  (Owner repro, fix wave: resets and toggle-backs never reverted because
 *  application only ever SET properties — the removal half was missing.)
 *  Exported for tests. */
export function staleVarNames(
	prevNames: readonly string[],
	nextVars: Record<string, string>,
): string[] {
	return prevNames.filter((n) => !(n in nextVars));
}

interface AppearanceContextValue {
	/** Resolved appearance; factory until the record arrives. */
	appearance: ReturnType<typeof resolveAppearance>;
	/** Called by the settings page after a successful section PUT. */
	onAppearanceChange: (delta: AppearanceSettings | undefined) => void;
}

const AppearanceContext = createContext<AppearanceContextValue>({
	appearance: resolveAppearance(undefined),
	onAppearanceChange: () => {},
});

export function useAppearance() {
	return useContext(AppearanceContext);
}

export function AppearanceProvider({ children }: { children: React.ReactNode }) {
	const [delta, setDelta] = useState<AppearanceSettings | undefined>(undefined);
	// The server already rendered the saved mode's class (app/layout.tsx);
	// the client takes over only once the record has arrived, so the
	// factory default never flips a light page dark for a moment.
	const [loaded, setLoaded] = useState(false);
	const mode = resolveAppearance(delta).mode;
	useEffect(() => {
		if (loaded) applyModeClass(document.documentElement, mode);
	}, [loaded, mode]);
	const appliedRef = useRef<string>("");

	// The vars apply on every change — stringified as the change signal.
	const vars = useMemo(() => appearanceVars(resolveAppearance(delta)), [delta]);
	const key = useMemo(() => JSON.stringify(vars), [vars]);
	// REMOVAL is half the job (owner repro, fix wave): a later write that
	// OMITS a var (empty field = factory, serif toggle back on) must clear
	// the previously-set inline value or the stale one wins forever —
	// backgrounds never reset, toggles looked dead. Every name this effect
	// has ever set is tracked; names absent from the new set are removed so
	// the factory stylesheet value returns.
	const appliedNamesRef = useRef<Set<string>>(new Set());
	useEffect(() => {
		if (appliedRef.current === key) return;
		appliedRef.current = key;
		const root = document.documentElement;
		for (const name of staleVarNames([...appliedNamesRef.current], vars)) {
			root.style.removeProperty(name);
			appliedNamesRef.current.delete(name);
		}
		for (const [name, value] of Object.entries(vars)) {
			root.style.setProperty(name, value);
			appliedNamesRef.current.add(name);
		}
	}, [key, vars]);

	// One fetch per app load: the record (sanitized server-side) carries the
	// delta; resolution happens here against the compiled factory.
	useEffect(() => {
		let alive = true;
		fetch("/api/settings")
			.then((r) => r.json())
			.then((body: { settings?: Record<string, unknown> }) => {
				if (!alive) return;
				// The record arrives sanitized server-side; the appearance
				// slice is unknown-shaped here, so it goes through the same
				// resolve (absent/invalid fields = factory anyway).
				const appearance = body.settings?.appearance;
				setDelta(
					appearance && typeof appearance === "object" ? (appearance as AppearanceSettings) : undefined,
				);
				setLoaded(true);
			})
			.catch(() => {/* settings stay factory — not worth a crash */});
		return () => {
			alive = false;
		};
	}, []);

	const onAppearanceChange = useCallback((next: AppearanceSettings | undefined) => {
		setDelta(next);
		setLoaded(true);
	}, []);

	const value = useMemo(
		() => ({ appearance: resolveAppearance(delta), onAppearanceChange }),
		[delta, onAppearanceChange],
	);
	return <AppearanceContext.Provider value={value}>{children}</AppearanceContext.Provider>;
}

/** The scheme on screen now: the mode, or with System the OS appearance,
 *  following it live (P7-2). For code that draws colours itself, such as
 *  the graph canvas and Mermaid, so it can redraw when this changes. */
export function useColorScheme(): "dark" | "light" {
	const { appearance } = useAppearance();
	const [osDark, setOsDark] = useState(true);
	useEffect(() => {
		if (typeof window === "undefined" || !window.matchMedia) return;
		const mq = window.matchMedia("(prefers-color-scheme: dark)");
		setOsDark(mq.matches);
		const on = (e: MediaQueryListEvent) => setOsDark(e.matches);
		mq.addEventListener("change", on);
		return () => mq.removeEventListener("change", on);
	}, []);
	return appearance.mode === "system" ? (osDark ? "dark" : "light") : appearance.mode;
}
