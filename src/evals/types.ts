/**
 * Teaching evals (Kvasir P6-4, D094 to D098): the scenario and result
 * shapes. A scenario is one JSON file in evals/scenarios/.
 */

/** One scenario: who the simulated learner is, how the session opens, and
 *  what is scored. */
export interface Scenario {
	id: string;
	title: string;
	/** The learner's persona (D094): what they know, what they get wrong,
	 *  how they talk. */
	persona: string;
	/** The learner's first message. */
	opening: string;
	/** Rubric item ids the judge scores (src/evals/rubric.ts). */
	rubric: string[];
	/** Deterministic check ids (src/evals/checks.ts). */
	checks: string[];
}

export interface CheckResult {
	id: string;
	pass: boolean;
	detail: string;
}

export interface RubricScore {
	id: string;
	/** 0 not done or done badly, 1 partly, 2 done well (D095). */
	score: 0 | 1 | 2;
	quote: string;
	reason: string;
}

export interface RoleUsage {
	model: string;
	inputTokens: number;
	outputTokens: number;
	cacheReadTokens: number;
	cacheWriteTokens: number;
}

export interface ScenarioResult {
	scenario: string;
	commit: string;
	ranAt: string;
	learnerReplies: number;
	/** Why the run stopped: "ended" (no question and the learner had nothing
	 *  to add), "cap" (D098's 12 replies) or "error". */
	stop: "ended" | "cap" | "error";
	error?: string;
	checks: CheckResult[];
	scores: RubricScore[];
	/** Sum of the rubric scores and the most it could be. */
	total: { score: number; max: number };
	usage: Record<"session" | "learner" | "judge", RoleUsage[]>;
	/** The transcript as the judge read it. */
	transcript: string;
}
