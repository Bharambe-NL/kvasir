/**
 * npm run voice:check (Kvasir P3-1 D153, reworked in P3-3): a voice session
 * live, through the app's own path. A voice chat (D161) runs on the real
 * chat handler with the configured models; fixed learner replies go in
 * through the window's turn sender (components/speech/chat-turn-sender.ts),
 * so an answer to an ask_spoken question arrives as that question's result,
 * exactly as in the app (D162). Each turn's spoken text (what the voice loop
 * would say) is checked with src/core/voice-checks.ts: one question, no
 * formulas, no options, no Markdown, short. Writes
 * evals/voice/<commit>.json and exits non-zero if any reply fails.
 *
 * Models come from the Kvasir app's own settings (KV_EVAL_SETTINGS, default
 * the desktop app's settings.json), strong slot. Keys come from the app's
 * key file, read in place (KV_AUTH_FILE), never copied. The session runs in
 * an empty temp folder with graph extraction and the background job tools
 * off, so nothing else spends and the app's data is not touched.
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
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "kv-voice-"));
fs.writeFileSync(path.join(TMP, "settings.json"), JSON.stringify({
	version: 1,
	models: appSettings.models,
	graph: { enabled: false, rendering: false },
	agent: { tools: { research: false, demo: false, visual: false, pdf: false } },
}, null, "\t"));
process.env.KV_DATA_DIR = TMP;
process.env.KV_AUTH_FILE ||= path.join(path.dirname(appData), "auth.json");

const git = (...args: string[]) => execFileSync("git", args, { cwd: REPO, encoding: "utf8" }).trim();
const dirty = git("status", "--porcelain", "--", ".", ":!evals/voice", ":!next-env.d.ts").length > 0;
const commit = `${git("rev-parse", "--short", "HEAD")}${dirty ? "-dirty" : ""}`;

await import("../src/server/keys.ts"); // reflects the key file into the environment
const { handleChatRequest, createChat } = await import("../src/server/index.ts");
const { chatStore } = await import("../src/store/chats.ts");
const streamRoute = await import("../app/api/chats/[id]/stream/route.ts");
const recordRoute = await import("../app/api/chats/[id]/route.ts");
const { createChatTurnSender } = await import("../components/speech/chat-turn-sender.ts");
const { checkVoiceReply, wordCount } = await import("../src/core/voice-checks.ts");
const { sessionCost } = await import("../src/server/pricing.ts");
type ChatRecord = import("../src/core/contracts/chat.ts").ChatRecord;

const modelId = `${strong.model.provider}:${strong.model.id}`;

/** The fixed learner: setup answers, probe answers, then teaching replies.
 *  The prober decides when the probe ends; the replies read sensibly
 *  either side of that line. */
const LEARNER = [
	"I'd like to learn about DORA.",
	"I work in EU payments. I'm on the European Payments Initiative, on Wero.",
	"I want to understand what Article 28 of DORA asks of a payment firm that relies on cloud providers.",
	"About twenty minutes.",
	"Give me a nudge in the right direction, not the answer.",
	"I know DORA is about operational resilience and that it applies to us from January 2025.",
	"Not really. I think it says something about contracts with providers, but I couldn't tell you what.",
	"I think the firm stays responsible for the service even when a cloud provider runs it.",
	"And the register only has to list the critical providers, right?",
	"I don't know.",
	"No idea, sorry.",
	"So we need a plan to leave the provider without breaking the payment service.",
	"OK, let's move on.",
];

/** fetch, routed to the real handlers in this process. */
const fetchFn = (async (input: string, init?: RequestInit) => {
	const req = new Request(`http://kvasir.local${input}`, init);
	if (input === "/api/chat") return handleChatRequest(req);
	const m = /^\/api\/chats\/([^/]+)(\/stream)?$/.exec(input);
	if (!m) throw new Error(`unrouted ${input}`);
	const ctx = { params: Promise.resolve({ id: decodeURIComponent(m[1]!) }) };
	return m[2] ? streamRoute.GET(req, ctx) : recordRoute.GET(req, ctx);
}) as typeof fetch;

const chat = createChat("Voice check", undefined, { voice: true });
chatStore.saveSettings(chat.id, { model: strong.model, ...(strong.thinkingLevel ? { thinkingLevel: strong.thinkingLevel as never } : {}) });
const send = createChatTurnSender(chat.id, fetchFn);

interface Reply { phase: "probe" | "teach"; learner: string; reply: string; words: number; rejected: number; checks: ReturnType<typeof checkVoiceReply> }
const replies: Reply[] = [];
const hasProbeDone = (record: ChatRecord) => record.messages.some((m) => m.role === "assistant" && Array.isArray(m.content) && (m.content as { type?: string; name?: string }[]).some((p) => p.type === "toolCall" && p.name === "probe_done"));
const rejections = (record: ChatRecord) => record.messages.filter((m) => m.role === "toolResult" && (m as { toolName?: string; isError?: boolean }).toolName === "ask_spoken" && (m as { isError?: boolean }).isError).length;

console.log(`voice check at ${commit} on ${modelId}`);
let rejectedBefore = 0;
for (const learner of LEARNER) {
	const before = chatStore.getChat(chat.id)!;
	const phase = hasProbeDone(before) ? "teach" : "probe";
	let reply = "";
	for await (const text of send(learner, new AbortController().signal)) reply += text;
	reply = reply.trim();
	const after = chatStore.getChat(chat.id)!;
	const rejected = rejections(after) - rejectedBefore;
	rejectedBefore = rejections(after);
	const checks = checkVoiceReply(reply);
	if (!reply) checks.push({ name: "short", pass: false, detail: "no spoken reply" });
	replies.push({ phase, learner, reply, words: wordCount(reply), rejected, checks });
	const failed = checks.filter((c) => !c.pass);
	console.log(`${phase} ${replies.length}: ${failed.length ? `FAIL (${failed.map((c) => `${c.name}: ${c.detail}`).join("; ")})` : "pass"}${rejected ? ` (${rejected} question${rejected > 1 ? "s" : ""} rejected and fixed)` : ""}`);
}

const record = chatStore.getChat(chat.id)!;
const dollars = sessionCost(record).cost;
const passed = replies.filter((r) => r.checks.every((c) => c.pass)).length;
const rejectedCalls = replies.reduce((n, r) => n + r.rejected, 0);
const out = path.join(REPO, "evals", "voice", `${commit}.json`);
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify({ commit, model: modelId, at: new Date().toISOString(), passed, total: replies.length, rejectedCalls, dollars: Math.round(dollars * 100) / 100, replies }, null, "\t") + "\n");
console.log(`${passed} of ${replies.length} replies pass; ${rejectedCalls} question calls rejected by the validator and fixed. About $${dollars.toFixed(2)}. Written to ${path.relative(REPO, out)}`);
fs.rmSync(TMP, { recursive: true, force: true });
process.exit(passed === replies.length ? 0 : 1);
