/**
 * The review generator (P1-4): writes one review question per due card,
 * ahead of the review, for the Memory system (D038, D039, D040).
 *
 * - Format by card phase (core/learner.ts formatFor, D038): a cue that makes
 *   the learner recall the proposition while the memory is forming, an
 *   applied scenario once the card is in the review phase.
 * - One submit call is the deliverable (runSubmitAgent), on the
 *   reviewGenerator role (cheap slot, D040).
 * - Every generation runs inside the SHARED background-LLM semaphore
 *   (withBgLlmSlot): the review generator and extraction draw from one pool.
 * - Failure isolation: each card is its own settled promise. One card's
 *   failure never touches another; failures are reported, never stored, and
 *   the card is simply retried on the next run.
 *
 * The agent layer never imports a store (import law): the caller hands in
 * appendQuestion and chainsFor.
 */

import type { Usage } from "@earendil-works/pi-ai";
import { Type, type Static } from "typebox";
import type { ReviewCard } from "../../core/cards.ts";
import { isDue } from "../../core/schedule.ts";
import type { QuestionFormat, ReviewQuestion } from "../../core/contracts/learner.ts";
import { formatFor, questionFor } from "../../core/learner.ts";
import type { PiEngine } from "../models.ts";
import { withBgLlmSlot } from "./bg-llm-semaphore.ts";
import { runSubmitAgent } from "./submit-agent.ts";

/** A related proposition, for context: a premise of the card's
 *  proposition, or a conclusion it supports. */
export interface RelatedStatement {
	relation: "premise" | "supports";
	statement: string;
}

const questionSchema = Type.Object({
	prompt: Type.String({
		description: "What the learner sees: the cue, or the scenario. Never states the proposition itself.",
	}),
	answer: Type.String({
		description: "What is revealed after the learner answers: the proposition (cue) or a model answer (scenario).",
	}),
});
type QuestionInput = Static<typeof questionSchema>;

const fillQuestion = (input: QuestionInput): QuestionInput => ({
	prompt: String(input.prompt ?? "").trim(),
	answer: String(input.answer ?? "").trim(),
});

const validateQuestion = (value: QuestionInput): string | null => {
	if (value.prompt.length === 0) return "prompt must not be empty";
	if (value.answer.length === 0) return "answer must not be empty";
	return null;
};

export const REVIEW_GENERATOR_INSTRUCTIONS = `You write one review question for a learner's spaced-review session. The learner has already been taught the proposition below. Your question brings it back from memory just before it would be forgotten.

You receive the proposition, its short name, related propositions for context, and a format.

Format "cue": write a short question or prompt that makes the learner recall the proposition. Point at it without stating it, and without giving away its key terms. The answer is the proposition itself, stated clearly in one or two sentences.

Format "scenario": write a short, realistic situation of two to four sentences in which the proposition must come to mind to reason correctly, then ask one question about it. Do not name the proposition. The answer is a model answer: the conclusion first, then the reasoning that uses the proposition, in two to four sentences.

Rules:
- One question only. The learner answers in their head or in a few lines, then sees your answer and rates their own recall.
- Stay within what the proposition and the related propositions say. Add no facts of your own.
- Plain English, short sentences. No dashes as punctuation: use commas, colons or full stops.

Your entire deliverable is ONE submit_review_question call with "prompt" and "answer".`;

function buildPrompt(card: ReviewCard, format: QuestionFormat, related: readonly RelatedStatement[]): string {
	const lines = [`Format: ${format}`, `Name: ${card.name}`, `Proposition: ${card.statement}`];
	if (related.length > 0) {
		lines.push("Related propositions:");
		for (const r of related) lines.push(`- (${r.relation === "premise" ? "premise of it" : "it supports"}) ${r.statement}`);
	}
	return lines.join("\n");
}

const noStep = (_usage: Usage, _model: string, _step: number, _finishReason: string, _tools: string) => {};

/** Write one review question for one card. Throws when the model never
 *  submits a valid question; the batch below turns that into a per-card
 *  failure. */
export async function generateReviewQuestion(opts: {
	card: ReviewCard;
	format: QuestionFormat;
	related: readonly RelatedStatement[];
	engine: PiEngine | undefined;
	signal: AbortSignal | undefined;
	now: string;
	newId: () => string;
}): Promise<ReviewQuestion> {
	const submitted = await runSubmitAgent<QuestionInput>({
		role: "reviewGenerator",
		toolName: "submit_review_question",
		toolDescription: "Submit the one review question: the prompt the learner sees and the answer revealed after.",
		parameters: questionSchema,
		fill: fillQuestion,
		validate: validateQuestion,
		systemPrompt: REVIEW_GENERATOR_INSTRUCTIONS,
		prompt: buildPrompt(opts.card, opts.format, opts.related),
		engine: opts.engine,
		signal: opts.signal,
		onStep: noStep,
		neverSubmitted: "the review generator never submitted a question",
	});
	const model = opts.engine ? `${opts.engine.model.provider}:${opts.engine.model.id}` : "unknown";
	return {
		id: opts.newId(),
		nodeId: opts.card.nodeId,
		cycle: opts.card.state.reps,
		format: opts.format,
		prompt: submitted.prompt,
		answer: submitted.answer,
		generatedAt: opts.now,
		model,
	};
}

export type GenerationResult =
	| { nodeId: string; ok: true; question: ReviewQuestion }
	| { nodeId: string; ok: false; error: string };

/** Write questions for every card due at `now` that has none for its
 *  current cycle. Each card runs inside one permit of the shared semaphore;
 *  successes are appended as they finish; one card's failure never affects
 *  another. Returns one result per card attempted. */
export async function generateDueQuestions(opts: {
	cards: readonly ReviewCard[];
	questions: readonly ReviewQuestion[];
	relatedFor: (nodeId: string) => RelatedStatement[];
	engine: PiEngine | undefined;
	appendQuestion: (question: ReviewQuestion) => void;
	now: string;
	signal?: AbortSignal;
	newId: () => string;
}): Promise<GenerationResult[]> {
	const pending = opts.cards.filter(
		(card) => isDue(card.state, opts.now) && questionFor(card.nodeId, card.state.reps, opts.questions) === null,
	);
	const settled = await Promise.allSettled(
		pending.map((card) =>
			withBgLlmSlot(opts.signal, async () => {
				const question = await generateReviewQuestion({
					card,
					format: formatFor(card.state),
					related: opts.relatedFor(card.nodeId),
					engine: opts.engine,
					signal: opts.signal,
					now: opts.now,
					newId: opts.newId,
				});
				opts.appendQuestion(question);
				return question;
			}),
		),
	);
	return settled.map((outcome, i): GenerationResult => {
		const nodeId = pending[i]!.nodeId;
		if (outcome.status === "fulfilled") return { nodeId, ok: true, question: outcome.value };
		const reason = outcome.reason;
		return { nodeId, ok: false, error: reason instanceof Error ? reason.message : String(reason) };
	});
}
