/**
 * The simulated learner and the judge (Kvasir P6-4, D094, D095): each a
 * single structured submit (runSubmitAgent), retried on a bad shape.
 */

import { Type, type Static } from "typebox";
import type { Usage } from "@earendil-works/pi-ai";
import type { PiEngine } from "../agent/models.ts";
import { runSubmitAgent } from "../agent/subagents/submit-agent.ts";
import type { QuestionData } from "../core/question-core.ts";
import { JUDGE_SYSTEM, LEARNER_SYSTEM } from "./prompts.ts";
import { RUBRIC } from "./rubric.ts";
import type { RubricScore, Scenario } from "./types.ts";

export type OnStep = (usage: Usage, model: string) => void;

const learnerSchema = Type.Object({
	reply: Type.Optional(Type.String({ description: "What you say or type. For a free-text question, your answer." })),
	choose: Type.Optional(Type.Array(Type.String(), { description: "For a question with options: the letters of the option(s) you pick, such as [\"B\"]." })),
	dontKnow: Type.Optional(Type.Boolean({ description: "True when you would press I don't know." })),
	confidence: Type.Optional(Type.Number({ description: "For a quiz or probe: how sure you are that your pick is right, 0 to 100." })),
	thinking: Type.Optional(Type.String({ description: "Optional: your reasoning, in the persona's words." })),
});
export type LearnerMove = Static<typeof learnerSchema>;

/** The learner's next move: an answer to the pending question, or the next
 *  message when nothing is pending. */
export async function learnerMove(
	engine: PiEngine,
	scenario: Scenario,
	transcript: string,
	question: QuestionData | null,
	onStep: OnStep,
): Promise<LearnerMove> {
	const task = question
		? question.mode === "text"
			? "The tutor's last question asks for a written answer. Give it in reply, or set dontKnow."
			: `The tutor's last question has options ${question.options.map((o, i) => `${String.fromCharCode(65 + i)}. ${o.label}`).join("  ")}${question.mode === "multi-select" ? " (pick all that apply)" : " (pick one)"}. Pick in choose, or set dontKnow.`
		: "Nothing is waiting for an answer. Write your next message to the tutor in reply, as the persona would.";
	return runSubmitAgent<LearnerMove>({
		role: "auditor",
		toolName: "submit_learner_move",
		toolDescription: "Submit what the learner does next.",
		parameters: learnerSchema,
		fill: (x) => x as LearnerMove,
		validate: (v) =>
			question && question.mode !== "text"
				? v.dontKnow || (v.choose?.length ?? 0) > 0
					? (v.choose ?? []).every((c) => /^[A-Z]$/.test(c.trim()) && c.trim().charCodeAt(0) - 65 < question.options.length)
						? null
						: "choose takes option letters from the list, such as [\"B\"]."
					: "Pick at least one option letter in choose, or set dontKnow."
				: v.dontKnow || (v.reply ?? "").trim()
					? null
					: "Write something in reply, or set dontKnow.",
		systemPrompt: LEARNER_SYSTEM(scenario.persona),
		prompt: `THE SESSION SO FAR:\n\n${transcript || "(nothing yet)"}\n\n${task}`,
		engine,
		signal: undefined,
		onStep: (usage, model) => onStep(usage, model),
		neverSubmitted: "the simulated learner never submitted a move",
	});
}

const judgeSchema = Type.Object({
	scores: Type.Array(
		Type.Object({
			id: Type.String({ description: "The rubric item id." }),
			score: Type.Number({ description: "0, 1 or 2." }),
			quote: Type.String({ description: "The transcript line that most supports the score, copied exactly." }),
			reason: Type.String({ description: "One sentence." }),
		}),
	),
});

/** The judge's scores, one per rubric item of the scenario (D095). */
export async function judgeTranscript(engine: PiEngine, scenario: Scenario, transcript: string, onStep: OnStep): Promise<RubricScore[]> {
	const items = scenario.rubric.map((id) => `- ${id}: ${RUBRIC[id] ?? id}`).join("\n");
	const out = await runSubmitAgent<Static<typeof judgeSchema>>({
		role: "auditor",
		toolName: "submit_scores",
		toolDescription: "Submit one score for every rubric item.",
		parameters: judgeSchema,
		fill: (x) => x as Static<typeof judgeSchema>,
		validate: (v) => {
			const ids = v.scores.map((s) => s.id);
			const missing = scenario.rubric.filter((id) => !ids.includes(id));
			if (missing.length) return `Score every rubric item; missing: ${missing.join(", ")}.`;
			if (new Set(ids).size !== ids.length) return "Score each rubric item once.";
			if (v.scores.some((s) => ![0, 1, 2].includes(s.score))) return "Each score is 0, 1 or 2.";
			if (v.scores.some((s) => !transcript.includes(s.quote.trim()))) return "Each quote must be copied exactly from the transcript.";
			return null;
		},
		systemPrompt: JUDGE_SYSTEM,
		prompt: `RUBRIC:\n${items}\n\nTRANSCRIPT:\n\n${transcript}`,
		engine,
		signal: undefined,
		onStep: (usage, model) => onStep(usage, model),
		neverSubmitted: "the judge never submitted scores",
	});
	return scenario.rubric.map((id) => {
		const s = out.scores.find((x) => x.id === id)!;
		return { id, score: s.score as 0 | 1 | 2, quote: s.quote.trim(), reason: s.reason };
	});
}
