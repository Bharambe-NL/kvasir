/**
 * A session as plain text, for the simulated learner and the judge
 * (Kvasir P6-4): the learner's messages and answers, the tutor's prose,
 * its questions with their options, and the names of the tools it called.
 * Options are listed in the order the dock shows them (questionDataFor,
 * which shuffles quiz options by call id), so the letters match the ones
 * the learner picks from.
 */

import type { LhMessage } from "../core/native-messages.ts";
import type { AskToolInput, ExplainToolInput, QuizToolInput } from "../core/question-core.ts";
import { questionDataFor } from "../core/question-data.ts";

const QUESTIONS = new Set(["quiz", "probe", "ask_user_question", "explain", "recall"]);
const PROSE_TOOLS = new Set(["send_to_user"]);

function shownLabels(name: string, id: string, args: Record<string, unknown>): string[] {
	if (!Array.isArray(args.options)) return [];
	try {
		return questionDataFor(name, id, args as unknown as QuizToolInput | AskToolInput | ExplainToolInput).options.map((o) => o.label);
	} catch {
		return (args.options as { label?: string }[]).map((o) => o.label ?? "");
	}
}

function questionText(name: string, id: string, args: Record<string, unknown>): string {
	const opts = shownLabels(name, id, args).map((label, i) => `  ${String.fromCharCode(65 + i)}. ${label}`);
	return [`TUTOR asks (${name}): ${String(args.question ?? "")}`, ...(args.details ? [`  ${String(args.details)}`] : []), ...opts].join("\n");
}

function answerText(details: unknown): string {
	const d = (details ?? {}) as Record<string, unknown>;
	if (d.dontKnow) return "LEARNER answers: I don't know.";
	const parts: string[] = [];
	if (Array.isArray(d.answers)) parts.push((d.answers as { label?: string }[]).map((a) => a.label).join("; "));
	for (const k of ["text", "other"]) if (typeof d[k] === "string" && d[k]) parts.push(String(d[k]));
	if (typeof d.confidence === "number") parts.push(`(confidence ${d.confidence}%)`);
	if (typeof d.thinking === "string" && d.thinking) parts.push(`(thinking: ${d.thinking})`);
	return `LEARNER answers: ${parts.join(" ") || "(no answer)"}`;
}

export function transcriptText(messages: readonly LhMessage[]): string {
	const out: string[] = [];
	for (const m of messages) {
		const msg = m as unknown as { role: string; content?: unknown; toolName?: string; details?: unknown; customType?: string };
		if (msg.role === "user") {
			const text = typeof msg.content === "string" ? msg.content : Array.isArray(msg.content) ? (msg.content as { type: string; text?: string }[]).filter((c) => c.type === "text").map((c) => c.text).join("") : "";
			if (text.trim()) out.push(`LEARNER: ${text.trim()}`);
		} else if (msg.role === "assistant" && Array.isArray(msg.content)) {
			for (const part of msg.content as { type: string; text?: string; id?: string; name?: string; arguments?: Record<string, unknown> }[]) {
				if (part.type === "text" && part.text?.trim()) out.push(`TUTOR: ${part.text.trim()}`);
				else if (part.type === "toolCall" && part.name) {
					if (QUESTIONS.has(part.name)) out.push(questionText(part.name, part.id ?? "", part.arguments ?? {}));
					else if (PROSE_TOOLS.has(part.name) && typeof part.arguments?.message === "string") out.push(`TUTOR: ${part.arguments.message.trim()}`);
					else out.push(`(tutor used ${part.name})`);
				}
			}
		} else if (msg.role === "toolResult" && msg.toolName && QUESTIONS.has(msg.toolName)) {
			out.push(answerText(msg.details));
		}
	}
	return out.join("\n\n");
}
