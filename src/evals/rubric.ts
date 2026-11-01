/**
 * The rubric items the judge scores (Kvasir P6-4, D095), as approved on #50.
 * Common items apply to every scenario; the others name the scenario's own
 * goal.
 */

export const RUBRIC: Readonly<Record<string, string>> = {
	probes_first: "Finds out what the learner already knows before teaching.",
	one_step: "Teaches one idea per step, each built on what the learner already holds.",
	checks_landing: "Checks that each step landed and acts on wrong answers before moving on.",
	accuracy: "Makes no false statements about the subject.",
	fixes_misconception_dora:
		'Corrects the belief that "a contract moves regulatory responsibility to the provider", grounded in DORA Article 28(1)(a).',
	cites_source: "Ties the obligations it teaches to the specific DORA paragraphs they come from.",
	fixes_misconception_bayes: "Separates P(A|B) from P(B|A) with a worked example.",
	skips_known: "Does not re-teach what the learner shows they already know, and moves to what is new to them.",
};

export const COMMON_RUBRIC = ["probes_first", "one_step", "checks_landing", "accuracy"] as const;
