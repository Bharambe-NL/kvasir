/**
 * A session as plain text, for the simulated learner and the judge
 * (Kvasir P6-4): the learner's messages and answers, the tutor's prose,
 * its questions with their options, and the names of the tools it called.
 */

import type { LhMessage } from "../core/native-messages.ts";

const QUESTIONS = new Set(["quiz", "probe", "ask_user_question", "explain", "recall"]);
const PROSE_TOOLS = new Set(["send_to_user"]);

function questionText(name: string, args: Record<string, unknown>): string {
	const opts = Array.isArray(args.options) ? (args.options as { label?: string }[]).map((o, i) => `  ${String.fromCharCode(65 + i)}. ${o.label ?? ""}`) : [];
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
			for (const part of msg.content as { type: string; text?: string; name?: string; arguments?: Record<string, unknown> }[]) {
				if (part.type === "text" && part.text?.trim()) out.push(`TUTOR: ${part.text.trim()}`);
				else if (part.type === "toolCall" && part.name) {
					if (QUESTIONS.has(part.name)) out.push(questionText(part.name, part.arguments ?? {}));
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
