/**
 * One scenario, run through a real session (Kvasir P6-4, D094 to D098). The
 * session itself is injected (`send` posts an input and waits for the turn
 * to settle), so the same driver runs live in scripts/eval.ts and with faux
 * engines in the tests. Answers are built with the chat dock's own
 * questionDataFor and buildAnswer, exactly what a click would send.
 */

import type { Usage } from "@earendil-works/pi-ai";
import type { PiEngine } from "../agent/models.ts";
import type { ChatInput } from "../core/input-events.ts";
import { pendingQuestionOf, type LhMessage } from "../core/native-messages.ts";
import { buildAnswer, type AnswerRequest, type AskToolInput, type ExplainToolInput, type QuizToolInput } from "../core/question-core.ts";
import { questionDataFor } from "../core/question-data.ts";
import type { SourceRef } from "../core/source-cite.ts";
import { runChecks } from "./checks.ts";
import { judgeTranscript, learnerMove } from "./roles.ts";
import { transcriptText } from "./transcript.ts";
import type { RoleUsage, Scenario, ScenarioResult } from "./types.ts";

export const MAX_LEARNER_REPLIES = 12;

export interface SessionPort {
	createChat(title: string): string;
	send(chatId: string, input: ChatInput): Promise<void>;
	messages(chatId: string): LhMessage[];
	/** The session's own model usage (prober and teacher), from its record. */
	usage(chatId: string): RoleUsage[];
	resolves(ref: SourceRef): boolean;
}

export interface RunOptions {
	scenario: Scenario;
	session: SessionPort;
	learner: PiEngine;
	judge: PiEngine;
	commit: string;
	maxReplies?: number;
	log?: (line: string) => void;
	now?: () => string;
}

function adder(list: RoleUsage[]) {
	return (u: Usage, model: string) => {
		let row = list.find((r) => r.model === model);
		if (!row) list.push((row = { model, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, cacheWrite1hTokens: 0 }));
		row.inputTokens += u.input;
		row.outputTokens += u.output;
		row.cacheReadTokens += u.cacheRead;
		row.cacheWriteTokens += u.cacheWrite;
		row.cacheWrite1hTokens += u.cacheWrite1h ?? 0;
	};
}

export async function runScenario(opts: RunOptions): Promise<ScenarioResult> {
	const { scenario, session } = opts;
	const max = opts.maxReplies ?? MAX_LEARNER_REPLIES;
	const log = opts.log ?? (() => {});
	const learnerUsage: RoleUsage[] = [];
	const judgeUsage: RoleUsage[] = [];
	const chatId = session.createChat(`[eval] ${scenario.title}`);
	let replies = 0;
	let stop: ScenarioResult["stop"] = "cap";
	let error: string | undefined;
	try {
		log(`[${scenario.id}] learner: ${scenario.opening}`);
		await session.send(chatId, { type: "text", text: scenario.opening });
		while (replies < max) {
			const messages = session.messages(chatId);
			const pending = pendingQuestionOf(messages);
			const qd = pending ? questionDataFor(pending.tool, pending.toolCallId, pending.input as QuizToolInput | AskToolInput | ExplainToolInput) : null;
			const move = await learnerMove(opts.learner, scenario, transcriptText(messages), qd, adder(learnerUsage));
			if (pending && qd) {
				const req: AnswerRequest = move.dontKnow
					? { dontKnow: true }
					: qd.mode === "text"
						? { text: (move.reply ?? "").trim(), thinking: move.thinking }
						: {
								values: (move.choose ?? []).map((c) => qd.options[c.trim().charCodeAt(0) - 65]!.value),
								thinking: move.thinking,
								confidence: qd.kind === "quiz" ? Math.max(0, Math.min(100, Math.round(move.confidence ?? 50))) : undefined,
							};
				const answer = buildAnswer(qd, req, pending.tool);
				log(`[${scenario.id}] learner answers ${pending.tool}: ${move.dontKnow ? "I don't know" : (move.choose ?? []).join(",") || move.reply}`);
				await session.send(chatId, { type: "answer", toolCallId: pending.toolCallId, answer });
			} else {
				const text = (move.reply ?? "").trim();
				if (!text) {
					stop = "ended";
					break;
				}
				log(`[${scenario.id}] learner: ${text}`);
				await session.send(chatId, { type: "text", text });
			}
			replies++;
		}
	} catch (err) {
		stop = "error";
		error = err instanceof Error ? err.message : String(err);
		log(`[${scenario.id}] stopped on error: ${error}`);
	}
	const messages = session.messages(chatId);
	const transcript = transcriptText(messages);
	const checks = runChecks(scenario.checks, messages, session.resolves);
	let scores: ScenarioResult["scores"] = [];
	try {
		scores = await judgeTranscript(opts.judge, scenario, transcript, adder(judgeUsage));
	} catch (err) {
		error = [error, `judge: ${err instanceof Error ? err.message : String(err)}`].filter(Boolean).join("; ");
	}
	return {
		scenario: scenario.id,
		commit: opts.commit,
		ranAt: (opts.now ?? (() => new Date().toISOString()))(),
		learnerReplies: replies,
		stop,
		...(error ? { error } : {}),
		checks,
		scores,
		total: { score: scores.reduce((s, x) => s + x.score, 0), max: scenario.rubric.length * 2 },
		usage: { session: session.usage(chatId), learner: learnerUsage, judge: judgeUsage },
		transcript,
	};
}

/** The summary table for one run (evals/results/<commit>/summary.md). */
export function summaryMarkdown(commit: string, results: readonly ScenarioResult[]): string {
	const lines = [
		`# Teaching evals at ${commit}`,
		"",
		"| Scenario | Stop | Replies | Checks passed | Rubric |",
		"|---|---|---|---|---|",
		...results.map((r) => `| ${r.scenario} | ${r.stop} | ${r.learnerReplies} | ${r.checks.filter((c) => c.pass).length} of ${r.checks.length} | ${r.total.score} of ${r.total.max} |`),
	];
	for (const r of results) {
		lines.push("", `## ${r.scenario}`, "");
		for (const c of r.checks) lines.push(`- Check \`${c.id}\`: ${c.pass ? "pass" : "fail"} (${c.detail})`);
		for (const s of r.scores) lines.push(`- Rubric \`${s.id}\`: ${s.score} of 2. ${s.reason} Quote: "${s.quote}"`);
		if (r.error) lines.push(`- Error: ${r.error}`);
	}
	return `${lines.join("\n")}\n`;
}
