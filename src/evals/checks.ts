/**
 * The deterministic checks (Kvasir P6-4, D095), read from a saved session.
 */

import type { LhMessage } from "../core/native-messages.ts";
import { parseSourceRef, type SourceRef } from "../core/source-cite.ts";
import type { CheckResult } from "./types.ts";

type Call = { name: string; args: Record<string, unknown> };

function calls(messages: readonly LhMessage[]): Call[] {
	const out: Call[] = [];
	for (const m of messages) {
		const msg = m as unknown as { role: string; content?: unknown };
		if (msg.role !== "assistant" || !Array.isArray(msg.content)) continue;
		for (const p of msg.content as { type: string; name?: string; arguments?: Record<string, unknown> }[]) {
			if (p.type === "toolCall" && p.name) out.push({ name: p.name, args: p.arguments ?? {} });
		}
	}
	return out;
}

/** The tutor's own prose: text parts and send_to_user messages. */
export function tutorProse(messages: readonly LhMessage[]): string {
	const out: string[] = [];
	for (const m of messages) {
		const msg = m as unknown as { role: string; content?: unknown };
		if (msg.role !== "assistant" || !Array.isArray(msg.content)) continue;
		for (const p of msg.content as { type: string; text?: string; name?: string; arguments?: Record<string, unknown> }[]) {
			if (p.type === "text" && p.text) out.push(p.text);
			if (p.type === "toolCall" && p.name === "send_to_user" && typeof p.arguments?.message === "string") out.push(p.arguments.message);
		}
	}
	return out.join("\n");
}

export const CHECKS: Readonly<Record<string, string>> = {
	handoff: "The prober called probe_done.",
	taught_with_checks: "After the handoff, the teacher asked at least one quiz.",
	no_failed_turns: "No turn ended in an error.",
	citations: "The teacher's text has at least one #src- link, and every link resolves to a stored unit.",
};

export function runChecks(
	ids: readonly string[],
	messages: readonly LhMessage[],
	resolves: (ref: SourceRef) => boolean,
): CheckResult[] {
	const all = calls(messages);
	const handoffAt = all.findIndex((c) => c.name === "probe_done");
	return ids.map((id): CheckResult => {
		switch (id) {
			case "handoff":
				return { id, pass: handoffAt >= 0, detail: handoffAt >= 0 ? "probe_done called" : "the prober never called probe_done" };
			case "taught_with_checks": {
				const quizzes = handoffAt < 0 ? 0 : all.slice(handoffAt + 1).filter((c) => c.name === "quiz").length;
				return { id, pass: quizzes > 0, detail: `${quizzes} quiz call${quizzes === 1 ? "" : "s"} after the handoff` };
			}
			case "no_failed_turns": {
				const failed = messages.filter((m) => {
					const a = m as unknown as { role: string; stopReason?: string; errorMessage?: string };
					return a.role === "assistant" && (a.stopReason === "error" || !!a.errorMessage);
				}).length;
				return { id, pass: failed === 0, detail: failed === 0 ? "no failed turn" : `${failed} failed turn${failed === 1 ? "" : "s"}` };
			}
			case "citations": {
				const refs = [...tutorProse(messages).matchAll(/\]\((#src-[^)\s]+)\)/g)].map((m) => m[1]!);
				const parsed = refs.map((r) => parseSourceRef(r));
				const bad = parsed.filter((r) => !r || !resolves(r)).length;
				return {
					id,
					pass: refs.length > 0 && bad === 0,
					detail: refs.length === 0 ? "no citation link in the teacher's text" : `${refs.length} link${refs.length === 1 ? "" : "s"}, ${bad} not resolving`,
				};
			}
			default:
				return { id, pass: false, detail: `unknown check "${id}"` };
		}
	});
}
