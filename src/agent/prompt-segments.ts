/**
 * THE canonical prompt-segment discovery + override resolution (P2
 * reconciliation, 2026-09-19). The agent layer owns it because composition
 * lives here: composeInstructions (teacher-agent.ts) composes through
 * effectivePromptSegments, and the discovery reads THIS layer's own tree
 * (src/agent/prompts — base, shared/, per-agent fragments) — the exact
 * rules the pre-P2 loader used, now in one place.
 *
 * The architecture law pins the layout: the agent layer never imports the
 * store adapters, so the override-file READ lives here too (config-anchored
 * static file, same discipline as reading the source fragments); the
 * override-file CRUD (write/delete/list — the mutating store behind the
 * core port) stays in src/store/prompt-overrides.ts. Both sides share the
 * pure path grammar (src/core/prompt-segments.ts).
 *
 * SEGMENTS: the SHARED base (src/agent/system-prompt.md), then every
 * numeric-prefix *.md fragment in the agent's own directory (sorted by
 * filename), then the shared/ fragments directory (composed by BOTH
 * agents as a trailing appendix — the 2026-09-27 reorder). The segment
 * list adapts to the code: an override keyed to a segment the source no
 * longer ships stops composing automatically.
 *
 * OVERRIDES: override files mirror the source layout under
 * config.PROMPTS_OVERRIDE_DIR — "system-prompt.md" at the root,
 * "shared/<file>", "teacher/<file>" / "prober/<file>". File presence is NOT
 * the override: the settings SWITCH is (owner decision) — the user keeps
 * their file and flips back to the source default to compare.
 */

import fs from "node:fs";
import path from "node:path";
import { PATHS, PROMPTS_OVERRIDE_DIR } from "../../config.ts";
import { FRAGMENT_RE, isValidSegmentPath, type PromptAgent, type PromptProfile, type PromptSegmentInfo } from "../core/prompt-segments.ts";

const PROMPTS_DIR = path.join(PATHS.root, "src", "agent", "prompts");

/** Shared fragments the PRACTICE agent composes: the VOICE, ACCURACY,
 *  and MENTAL-MODEL chunks joined the formatting guide (owner rounds 13
 *  and the prompt-refinement round of 2026-10-07) — personality, the
 *  truth contract, and the thinking-fields doctrine are ONE law across
 *  every agent. The question/confidence/file mechanics stay out
 *  (practice has no such tools). */
const PRACTICE_SHARED_FRAGMENTS = ["10-voice.md", "15-accuracy.md", "16-mental-model.md", "40-formatting.md"];

/** The shared fragments a voice session drops: written Markdown and LaTeX
 *  have no place in speech; the voice speaking guide replaces the
 *  formatting guide (D149), and the spoken question guide replaces the
 *  written question tools' guide (Kvasir P3-3, D160). */
const VOICE_DROPS = ["20-question-tools.md", "40-formatting.md"];

/** Every numeric-prefix fragment in one directory, sorted by filename. */
function fragmentsIn(dir: string): string[] {
	return fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => FRAGMENT_RE.test(f)).sort() : [];
}

/** Absolute path for an override file (unchecked — validate first). */
function overrideFileFor(segmentPath: string): string {
	return path.join(PROMPTS_OVERRIDE_DIR, ...segmentPath.split("/"));
}

/** Read one override file, or null when absent/invalid — the composition
 *  side's reader (the store's readOverride is the same mirror layout,
 *  kept separate because the layers may not import each other). */
export function readPromptOverride(segmentPath: string): string | null {
	if (!isValidSegmentPath(segmentPath)) return null;
	try {
		return fs.readFileSync(overrideFileFor(segmentPath), "utf-8");
	} catch {
		return null;
	}
}

/** List the SOURCE segments for one agent, in composition order — the
 *  shared base, then the agent's own fragments sorted by filename, then
 *  the shared/ fragments (the 2026-09-27 reorder: the agent's job and
 *  method lead; the shared tool/file/format mechanics are an appendix).
 *  The exact order composeInstructions composes them in.
 *
 *  The voice profile (Kvasir P3-1, D149) overlays the prober and the
 *  teacher: the shared appendix loses 40-formatting.md, then
 *  voice/shared/ and voice/<agent>/ close the prompt, so in a spoken
 *  session the voice rules have the last word. Practice has no voice. */
export function listSourceSegments(agent: PromptAgent, profile?: PromptProfile): Array<{ path: string; shared: boolean; file: string }> {
	// PRACTICE (owner, 2026-10-04): its own directory plus a CURATED
	// shared appendix — the teaching base and the question/confidence/
	// file mechanics stay out (the doctrine contradicts them; 00-base.md
	// plays the base role), but the FORMATTING guide composes for every
	// agent (owner, 2026-10-04 late): LaTeX delimiters and markdown apply
	// in all settings — practice shares the $...$/$$...$$ authoring contract.
	const segments: Array<{ path: string; shared: boolean; file: string }> = agent === "practice" ? [] : [
		{ path: "system-prompt.md", shared: true, file: PATHS.teacherPrompt },
	];
	const voice = profile === "voice" && agent !== "practice";
	const dir = path.join(PROMPTS_DIR, agent);
	for (const f of fragmentsIn(dir)) {
		segments.push({ path: `${agent}/${f}`, shared: false, file: path.join(dir, f) });
	}
	const sharedDir = path.join(PROMPTS_DIR, "shared");
	// The practice allowlist (owner, 2026-10-04 late): formatting only.
	const allow = agent === "practice" ? PRACTICE_SHARED_FRAGMENTS : null;
	for (const f of fragmentsIn(sharedDir)) {
		if (allow !== null && !allow.includes(f)) continue;
		if (voice && VOICE_DROPS.includes(f)) continue;
		segments.push({ path: `shared/${f}`, shared: true, file: path.join(sharedDir, f) });
	}
	if (voice) {
		for (const sub of ["shared", agent]) {
			const voiceDir = path.join(PROMPTS_DIR, "voice", sub);
			for (const f of fragmentsIn(voiceDir)) {
				segments.push({ path: `voice/${sub}/${f}`, shared: sub === "shared", file: path.join(voiceDir, f) });
			}
		}
	}
	return segments;
}

/**
 * The effective segment view for one agent — every segment with its source
 * text, override text, and effective switch state. `switches` is the
 * settings record's agent.prompts map (absent key = off); enabled =
 * switch on AND the override file exists.
 */
export function effectivePromptSegments(
	agent: PromptAgent,
	switches: Record<string, boolean>,
	profile?: PromptProfile,
): PromptSegmentInfo[] {
	return listSourceSegments(agent, profile).map((segment) => {
		let sourceText: string;
		try {
			sourceText = fs.readFileSync(segment.file, "utf-8");
		} catch {
			sourceText = ""; // source unreadable — the agent loader would crash anyway
		}
		const overrideText = readPromptOverride(segment.path);
		return {
			path: segment.path,
			sourceText,
			overrideText,
			enabled: switches[segment.path] === true && overrideText !== null,
			shared: segment.shared,
		};
	});
}

/** Every known segment path across the agents and profiles (route
 *  validation): voice fragments can be overridden like any other. */
export function allSegmentPaths(): string[] {
	const paths = new Set<string>();
	for (const agent of ["prober", "teacher", "practice"] as const) {
		for (const segment of listSourceSegments(agent)) paths.add(segment.path);
		for (const segment of listSourceSegments(agent, "voice")) paths.add(segment.path);
	}
	return [...paths].sort();
}
