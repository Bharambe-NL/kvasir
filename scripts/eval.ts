/**
 * npm run eval [-- <scenario>...] (Kvasir P6-4, D094 to D098): runs teaching
 * scenarios through real sessions and writes evals/results/<commit>/.
 *
 * Each run works on a temp copy of evals/fixtures/data with the model slots
 * of the Kvasir app's own settings (KV_EVAL_SETTINGS, default the desktop
 * app's settings.json). Keys come from the app's key file, read in place
 * (KV_AUTH_FILE, default the desktop app's auth.json), never copied. The
 * prober and teacher use the session model (strong slot) and so does the
 * judge (D098). The simulated learner runs on another provider (D099):
 * KV_EVAL_LEARNER as provider/model id, default the fixture's OpenRouter
 * DeepSeek model.
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
if (!appSettings.models?.strong?.model) {
	console.error(`No strong model slot in ${settingsFile}. Set it in the Kvasir app first.`);
	process.exit(1);
}

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "kv-eval-"));
fs.cpSync(path.join(REPO, "evals", "fixtures", "data"), TMP, { recursive: true });
const copySettingsFile = path.join(TMP, "settings.json");
const copySettings = fs.existsSync(copySettingsFile) ? JSON.parse(fs.readFileSync(copySettingsFile, "utf8")) : {};
fs.writeFileSync(copySettingsFile, JSON.stringify({ ...copySettings, models: appSettings.models }, null, "\t"));
process.env.KV_DATA_DIR = TMP;
process.env.KV_AUTH_FILE ||= path.join(path.dirname(appData), "auth.json");
// An encrypted install (P6-6) keeps auth.json sealed; the eval cannot read
// the keys outside the app.
try {
	const auth = JSON.parse(fs.readFileSync(process.env.KV_AUTH_FILE, "utf8"));
	if (auth && auth.kv === 1 && typeof auth.ct === "string") {
		console.error("Kvasir data on this Mac is encrypted; npm run eval cannot read your API keys. Turn encryption off in Settings, or point KV_AUTH_FILE at a plain key file.");
		process.exit(1);
	}
} catch {
	/* no key file: the provider calls report it */
}

const git = (...args: string[]) => execFileSync("git", args, { cwd: REPO, encoding: "utf8" }).trim();
// next build rewrites next-env.d.ts; it is not code the eval measures.
const dirty = git("status", "--porcelain", "--", ".", ":!evals/results", ":!next-env.d.ts").length > 0;
const commit = `${git("rev-parse", "--short", "HEAD")}${dirty ? "-dirty" : ""}`;

const { handleChatRequest, runningTurn, createChat, stores, sourceUnitView } = await import("../src/server/index.ts");
const { callCost } = await import("../src/server/pricing.ts");
const { piEngineForSpec } = await import("../src/agent/models.ts");
const { runScenario, summaryMarkdown } = await import("../src/evals/driver.ts");
type Scenario = import("../src/evals/types.ts").Scenario;
type RoleUsage = import("../src/evals/types.ts").RoleUsage;
type ChatInput = import("../src/core/input-events.ts").ChatInput;

const strong = () => {
	const s = appSettings.models!.strong!;
	return piEngineForSpec({ provider: s.model!.provider, id: s.model!.id, ...(s.thinkingLevel ? { thinkingLevel: s.thinkingLevel as never } : {}) });
};
const learnerSpec = process.env.KV_EVAL_LEARNER || "openrouter/deepseek/deepseek-v4.1-flash";
const cut = learnerSpec.indexOf("/");
if (cut < 1) {
	console.error(`KV_EVAL_LEARNER is provider/model id, such as openrouter/deepseek/deepseek-v4.1-flash; got "${learnerSpec}".`);
	process.exit(1);
}
const learner = () => piEngineForSpec({ provider: learnerSpec.slice(0, cut), id: learnerSpec.slice(cut + 1) });

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function settle(chatId: string): Promise<void> {
	// A turn can wake follow-up turns (job results); wait until quiet.
	let quiet = 0;
	while (quiet < 4) {
		const handle = runningTurn(chatId);
		if (handle) {
			quiet = 0;
			await new Response(handle.subscribe()).text();
		} else {
			quiet++;
			await sleep(500);
		}
	}
}

const session = {
	createChat: (title: string) => createChat(title).id,
	async send(chatId: string, input: ChatInput) {
		const ack = await handleChatRequest(
			new Request("http://eval/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chatId, input }) }),
		);
		if (ack.status !== 200) throw new Error(`turn refused (${ack.status}): ${await ack.text()}`);
		await settle(chatId);
	},
	messages: (chatId: string) => stores.chatStore.getChat(chatId)?.messages ?? [],
	usage(chatId: string): RoleUsage[] {
		const rows: RoleUsage[] = [];
		for (const turn of stores.chatStore.getChat(chatId)?.turns ?? []) {
			let row = rows.find((r) => r.model === turn.model);
			if (!row) rows.push((row = { model: turn.model, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, cacheWrite1hTokens: 0 }));
			for (const s of turn.steps) {
				row.inputTokens += s.inputTokens ?? 0;
				row.outputTokens += s.outputTokens ?? 0;
				row.cacheReadTokens += s.cacheReadTokens ?? 0;
				row.cacheWriteTokens += s.cacheWriteTokens ?? 0;
				row.cacheWrite1hTokens += s.cacheWrite1hTokens ?? 0;
			}
		}
		return rows;
	},
	resolves: (ref: { versionId: string; label: string }) => sourceUnitView(ref) !== null,
};

const scenarioDir = path.join(REPO, "evals", "scenarios");
const all: Scenario[] = fs.readdirSync(scenarioDir).filter((f) => f.endsWith(".json")).sort().map((f) => JSON.parse(fs.readFileSync(path.join(scenarioDir, f), "utf8")));
const wanted = process.argv.slice(2);
const unknown = wanted.filter((w) => !all.some((s) => s.id === w));
if (unknown.length) {
	console.error(`Unknown scenario(s): ${unknown.join(", ")}. Known: ${all.map((s) => s.id).join(", ")}`);
	process.exit(1);
}
const scenarios = wanted.length ? all.filter((s) => wanted.includes(s.id)) : all;

const outDir = path.join(REPO, "evals", "results", commit);
fs.mkdirSync(outDir, { recursive: true });
console.log(`Teaching evals at ${commit}: ${scenarios.map((s) => s.id).join(", ")} (data copy ${TMP})`);
console.log(`Session and judge: ${appSettings.models!.strong!.model!.provider}/${appSettings.models!.strong!.model!.id}. Learner: ${learnerSpec}.`);
const results = [];
for (const scenario of scenarios) {
	const result = await runScenario({ scenario, session, learner: learner(), judge: strong(), commit, log: (l) => console.log(l) });
	fs.writeFileSync(path.join(outDir, `${scenario.id}.json`), `${JSON.stringify(result, null, "\t")}\n`);
	results.push(result);
	console.log(`[${scenario.id}] done: ${result.stop}, checks ${result.checks.filter((c) => c.pass).length}/${result.checks.length}, rubric ${result.total.score}/${result.total.max}`);
}
fs.writeFileSync(path.join(outDir, "summary.md"), summaryMarkdown(commit, results));

let cost = 0;
let unknownCost = false;
for (const r of results) {
	for (const rows of Object.values(r.usage)) {
		for (const row of rows) {
			const c = callCost({ inputTokens: row.inputTokens, outputTokens: row.outputTokens, cacheReadTokens: row.cacheReadTokens, cacheWriteTokens: row.cacheWriteTokens, cacheWrite1hTokens: row.cacheWrite1hTokens }, row.model);
			if (c === null) unknownCost = true;
			else cost += c;
		}
	}
}
console.log(`Results: ${path.relative(REPO, outDir)}/. Cost: $${cost.toFixed(2)}${unknownCost ? " plus models without a price" : ""}.`);
fs.rmSync(TMP, { recursive: true, force: true });
process.exit(0);
