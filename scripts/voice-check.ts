/**
 * npm run voice:check (Kvasir P3-1, D153): the voice prompt profile, live.
 * Runs the real prober and teacher with promptProfile "voice" against fixed
 * learner replies and checks every reply with src/evals/voice-checks.ts:
 * one question, no formulas, no options, no Markdown, short. Writes
 * evals/voice/<commit>.json and exits non-zero if any reply fails.
 *
 * The agents hold ask_spoken as their only tool (Kvasir P3-3, D160): a
 * reply is its spoken text plus the question ask_spoken accepted, and
 * rejected calls (the validator, D163) are counted. Models
 * come from the Kvasir app's own settings (KV_EVAL_SETTINGS, default the
 * desktop app's settings.json), strong slot. Keys come from the app's key
 * file, read in place (KV_AUTH_FILE), never copied. Nothing is written to
 * the app's data: KV_DATA_DIR points at an empty temp folder.
 */

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { defaultDataDir } from "./mcp-server-paths.ts";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appData = defaultDataDir();
const settingsFile = process.env.KV_EVAL_SETTINGS || path.join(appData, "settings.json");
const appSettings = JSON.parse(fs.readFileSync(settingsFile, "utf8")) as { models?: Record<string, { model?: { provider: string; id: string }; thinkingLevel?: string }> };
const strong = appSettings.models?.strong;
if (!strong?.model) {
	console.error(`No strong model slot in ${settingsFile}. Set it in the Kvasir app first.`);
	process.exit(1);
}
process.env.KV_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "kv-voice-"));
process.env.KV_AUTH_FILE ||= path.join(path.dirname(appData), "auth.json");

const git = (...args: string[]) => execFileSync("git", args, { cwd: REPO, encoding: "utf8" }).trim();
const dirty = git("status", "--porcelain", "--", ".", ":!evals/voice", ":!next-env.d.ts").length > 0;
const commit = `${git("rev-parse", "--short", "HEAD")}${dirty ? "-dirty" : ""}`;

await import("../src/server/keys.ts"); // reflects the key file into the environment
const { piEngineForSpec } = await import("../src/agent/models.ts");
const { createProberAgent, createTeacherAgent } = await import("../src/agent/teacher-agent.ts");
const { askSpokenToolFor } = await import("../src/agent/tools.ts");
const { callCost } = await import("../src/server/pricing.ts");
const { checkVoiceReply, wordCount } = await import("../src/evals/voice-checks.ts");
type Usage = import("@earendil-works/pi-ai").Usage;

const modelId = `${strong.model.provider}:${strong.model.id}`;
const engine = () => piEngineForSpec({ provider: strong.model!.provider, id: strong.model!.id, ...(strong.thinkingLevel ? { thinkingLevel: strong.thinkingLevel as never } : {}) });

/** The fixed learner. Each line is one spoken reply. */
const PROBER_TURNS = [
	"I'd like to learn about DORA.",
	"I work in EU payments. I'm on the European Payments Initiative, on Wero.",
	"I want to understand what Article 28 of DORA asks of a payment firm that relies on cloud providers.",
	"About twenty minutes.",
	"Give me a nudge in the right direction, not the answer.",
	"I know DORA is about operational resilience and that it applies to us from January 2025.",
	"Not really. I think it says something about contracts with providers, but I couldn't tell you what.",
];
const TEACHER_SEED =
	"(The spoken probe is finished. Setup answers: background, EU payments, working on the European Payments Initiative and Wero. Goal: understand what DORA Article 28 asks of a payment firm that relies on cloud providers. Session length: twenty minutes. Hint style: a nudge in the right direction, not the answer. Probe result: he knows DORA is about operational resilience and when it applies; he does not know what Article 28 contains: the firm's full responsibility, the ICT third-party risk strategy, the register of information, or exit strategies.) Please start teaching.";
const TEACHER_TURNS = [
	"I think the firm stays responsible for the service even when a cloud provider runs it.",
	"And the register only has to list the critical providers, right?",
	"I don't know.",
	"No idea, sorry.",
	"So we need a plan to leave the provider without breaking the payment service.",
	"OK, let's move on.",
];

interface Reply { agent: "prober" | "teacher"; learner: string; reply: string; words: number; rejected: number; checks: ReturnType<typeof checkVoiceReply> }

const usage: Usage[] = [];
const replies: Reply[] = [];

/** What the listener hears from one turn: the assistant's text, then the
 *  question ask_spoken accepted; and how many calls the validator rejected. */
function spokenTurn(messages: unknown[], from: number): { text: string; rejected: number } {
	const added = messages.slice(from) as { role?: string; content?: unknown; toolCallId?: string; isError?: boolean }[];
	const failed = new Set(added.filter((m) => m.role === "toolResult" && m.isError).map((m) => m.toolCallId));
	const texts: string[] = [];
	let question = "";
	let rejected = 0;
	for (const m of added) {
		if (m.role !== "assistant" || !Array.isArray(m.content)) continue;
		for (const part of m.content as { type?: string; text?: string; name?: string; id?: string; arguments?: { question?: string } }[]) {
			if (part.type === "text" && part.text?.trim()) texts.push(part.text.trim());
			if (part.type === "toolCall" && part.name === "ask_spoken") {
				if (failed.has(part.id)) rejected++;
				else question = part.arguments?.question?.trim() ?? "";
			}
		}
	}
	return { text: [...texts, ...(question ? [question] : [])].join("\n\n"), rejected };
}

async function converse(agent: "prober" | "teacher", turns: string[]) {
	const opts = { engine: engine(), promptProfile: "voice" as const, onUsage: (u: Usage) => void usage.push(u) };
	let a: ReturnType<typeof createTeacherAgent> | undefined;
	for (const learner of turns) {
		// Agents are rebuilt every turn in the app; here one agent runs the
		// session, so each turn gets a fresh ask_spoken (its one-question
		// count is per turn).
		const tools = { ask_spoken: askSpokenToolFor() };
		a ??= agent === "prober" ? createProberAgent({} as never, { ...opts, tools }) : createTeacherAgent(undefined, { ...opts, tools });
		a.state.tools = Object.values(tools);
		const from = a.state.messages.length;
		await a.prompt(learner);
		const { text: reply, rejected } = spokenTurn(a.state.messages as unknown[], from);
		const checks = checkVoiceReply(reply);
		if (!reply) checks.push({ name: "short", pass: false, detail: "no spoken reply" });
		replies.push({ agent, learner, reply, words: wordCount(reply), rejected, checks });
		const failed = checks.filter((c) => !c.pass);
		console.log(`${agent} ${replies.length}: ${failed.length ? `FAIL (${failed.map((c) => `${c.name}: ${c.detail}`).join("; ")})` : "pass"}${rejected ? ` (${rejected} question${rejected > 1 ? "s" : ""} rejected and fixed)` : ""}`);
	}
}

console.log(`voice check at ${commit} on ${modelId}`);
await converse("prober", PROBER_TURNS);
await converse("teacher", [TEACHER_SEED, ...TEACHER_TURNS]);

const total = usage.reduce(
	(t, u) => ({ inputTokens: t.inputTokens + u.input, outputTokens: t.outputTokens + u.output, cacheReadTokens: t.cacheReadTokens + u.cacheRead, cacheWriteTokens: t.cacheWriteTokens + u.cacheWrite, cacheWrite1hTokens: t.cacheWrite1hTokens + (u.cacheWrite1h ?? 0) }),
	{ inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, cacheWrite1hTokens: 0 },
);
const dollars = usage.reduce((sum, u) => sum + (callCost({ inputTokens: u.input, outputTokens: u.output, cacheReadTokens: u.cacheRead, cacheWriteTokens: u.cacheWrite, cacheWrite1hTokens: u.cacheWrite1h ?? 0 }, modelId) ?? 0), 0);
const passed = replies.filter((r) => r.checks.every((c) => c.pass)).length;
const out = path.join(REPO, "evals", "voice", `${commit}.json`);
fs.mkdirSync(path.dirname(out), { recursive: true });
const rejectedCalls = replies.reduce((n, r) => n + r.rejected, 0);
fs.writeFileSync(out, JSON.stringify({ commit, model: modelId, at: new Date().toISOString(), passed, total: replies.length, rejectedCalls, dollars: Math.round(dollars * 100) / 100, tokens: total, replies }, null, "\t") + "\n");
console.log(`${passed} of ${replies.length} replies pass; ${rejectedCalls} question calls rejected by the validator and fixed. About $${dollars.toFixed(2)}. Written to ${path.relative(REPO, out)}`);
fs.rmSync(process.env.KV_DATA_DIR, { recursive: true, force: true });
process.exit(passed === replies.length ? 0 : 1);
