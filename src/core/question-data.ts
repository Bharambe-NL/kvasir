/**
 * The canonical QuestionData for a question tool call: the shape the
 * learner's answer is built from (buildAnswer). Moved out of the question
 * dock (Kvasir P6-4) so the teaching-eval harness answers exactly as the UI
 * does. Quiz options are shuffled deterministically, seeded by the call id,
 * so position never leaks correctness and every caller sees the same order.
 */

import { toolQuestionKind } from "./pending.ts";
import {
	normalizeOptions,
	normalizeQuizType,
	resolveCorrect,
	seededRandom,
	shuffleOptions,
	type AskToolInput,
	type ExplainToolInput,
	type QuestionData,
	type QuestionMode,
	type QuizToolInput,
} from "./question-core.ts";

export function questionDataFor(
	toolName: string,
	toolCallId: string,
	input: QuizToolInput | AskToolInput | ExplainToolInput,
	createdAt: string = new Date().toISOString(),
): QuestionData {
	const kind = toolQuestionKind(toolName);
	const quizInput = kind === "quiz" ? (input as QuizToolInput) : null;
	const askInput = kind === "ask" ? (input as AskToolInput) : null;
	const explainInput = kind === "explain" ? (input as ExplainToolInput) : null;
	const multi = input instanceof Object && "multiSelect" in input ? input.multiSelect === true : false;
	const mode: QuestionMode =
		kind === "quiz" ? (multi ? "multi-select" : "single-select") : askInput?.options?.length ? (multi ? "multi-select" : "single-select") : "text";
	const options = normalizeOptions((quizInput?.options ?? askInput?.options ?? []) as { label: string; value?: string }[]);
	const ordered = kind === "quiz" && options.length > 0 ? shuffleOptions(options, seededRandom(toolCallId)) : options;
	const q: QuestionData = {
		id: toolCallId,
		kind,
		// The role (owner 2026-10-03): predict questions gate by it in the
		// view (never collapsed) and the answered card tucks the explanation.
		questionType: kind === "quiz" ? normalizeQuizType((input as { type?: unknown }).type) : undefined,
		question: input.question,
		context: input.details,
		mode,
		options: ordered,
		createdAt,
	};
	if (quizInput) {
		const resolved = resolveCorrect(quizInput.correctAnswer, ordered);
		if (resolved.error) console.error("[quiz] correctAnswer did not resolve:", resolved.error);
		q.correctIndices = resolved.indices;
		q.explanation = quizInput.explanation;
	}
	if (explainInput) {
		// The commitment rides the question data (never sent to the client
		// before answering) and snapshots into the answer at submit. One
		// field, reasoning included (owner ruling 2026-09-27).
		q.committedAnswer = explainInput.correctAnswer;
	}
	return q;
}
