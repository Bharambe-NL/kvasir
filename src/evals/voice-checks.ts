/**
 * Checks on one spoken reply (Kvasir P3-1, D153): what a listener can
 * follow. Pure, so the live check (scripts/voice-check.ts) and the tests
 * share them.
 *   - at most one question
 *   - no formula symbols (LaTeX, dollar maths, powers, subscripts,
 *     equations between terms, maths characters)
 *   - no option lists to pick from
 *   - no Markdown (headings, bold, bullets, numbered lists, tables, code)
 *   - at most VOICE_WORD_CAP words
 */

export const VOICE_WORD_CAP = 130;

export interface VoiceCheck {
	name: "one question" | "no formulas" | "no options" | "no markdown" | "short";
	pass: boolean;
	/** What failed, quoted from the reply; empty when it passed. */
	detail: string;
}

/** Questions are sentences that end in a question mark. */
export function questionCount(text: string): number {
	return (text.match(/\?(?=\s|$|["'”’)])/g) ?? []).length;
}

const FORMULA: [RegExp, string][] = [
	[/\$[^$\n]+\$/, "dollar maths"],
	[/\\[a-zA-Z]+/, "a LaTeX command"],
	[/\b\w+\s*\^\s*\w+/, "a power"],
	[/\b[a-zA-Z]_[a-zA-Z0-9{]/, "a subscript"],
	[/\b[\w)]+\s*[=≈≤≥<>]\s*[\w(]/, "an equation"],
	[/[∑∏∫√∞≈≠≤≥±×÷∂∆πσμλαβγθ]/, "a maths character"],
];

const OPTIONS: [RegExp, string][] = [
	[/(^|\s)\(?[A-Da-d]\)\s+\S/m, "lettered options"],
	[/(^|\n)\s*[A-Da-d][.:]\s+\S/m, "lettered options"],
	[/\boption (?:[1-4A-Da-d]|one|two|three|four)\b/i, "numbered options"],
	[/\bwhich of (?:these|the following)\b/i, "a pick-one question"],
];

const MARKDOWN: [RegExp, string][] = [
	[/^\s{0,3}#{1,6}\s/m, "a heading"],
	[/\*\*[^*]+\*\*|__[^_]+__/, "bold"],
	[/^\s*[-*•]\s+\S/m, "a bullet"],
	[/^\s*\d+[.)]\s+\S/m, "a numbered list"],
	[/^\s*\|.*\|\s*$/m, "a table"],
	[/```|`[^`\n]+`/, "code"],
	[/\[[^\]]+\]\([^)]+\)/, "a link"],
];

function firstHit(text: string, patterns: [RegExp, string][]): string {
	for (const [re, label] of patterns) {
		const m = re.exec(text);
		if (m) return `${label}: "${m[0].trim()}"`;
	}
	return "";
}

export const wordCount = (text: string): number => text.split(/\s+/).filter(Boolean).length;

export function checkVoiceReply(text: string): VoiceCheck[] {
	const questions = questionCount(text);
	const words = wordCount(text);
	const formula = firstHit(text, FORMULA);
	const options = firstHit(text, OPTIONS);
	const markdown = firstHit(text, MARKDOWN);
	return [
		{ name: "one question", pass: questions <= 1, detail: questions <= 1 ? "" : `${questions} questions` },
		{ name: "no formulas", pass: !formula, detail: formula },
		{ name: "no options", pass: !options, detail: options },
		{ name: "no markdown", pass: !markdown, detail: markdown },
		{ name: "short", pass: words <= VOICE_WORD_CAP, detail: words <= VOICE_WORD_CAP ? "" : `${words} words` },
	];
}
