/**
 * One teaching-eval scenario end to end (Kvasir P6-4, D094 to D098) through
 * the real chat handler, over a temp copy of the eval fixture. The teacher,
 * the simulated learner and the judge are faux engines; the answer the
 * learner posts is built with the dock's own questionDataFor and
 * buildAnswer. No network, no model.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { after, describe, it } from "node:test";
import { createFauxCore, fauxAssistantMessage, fauxToolCall, type FauxResponseStep, type ToolCall } from "@earendil-works/pi-ai";

const FIXTURE = fileURLToPath(new URL("../evals/fixtures/data", import.meta.url));
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "kv-evals-run-"));
fs.cpSync(FIXTURE, TMP, { recursive: true });
process.env.KV_DATA_DIR = TMP;
process.env.KV_AUTH_FILE = path.join(TMP, "auth.json");
process.env.OPENROUTER_API_KEY ??= "test-key-presence-gate";

const { handleChatRequest } = await import("../src/server/chat-handler.ts");
const { runningTurn } = await import("../src/server/turn-runs.ts");
const { chatStore } = await import("../src/store/chats.ts");
const { sourceUnitView } = await import("../src/server/source-cite.ts");
const { createTeacherAgent } = await import("../src/agent/teacher-agent.ts");
const { runScenario, summaryMarkdown } = await import("../src/evals/driver.ts");
const { questionDataFor } = await import("../src/core/question-data.ts");
const { buildAnswer } = await import("../src/core/question-core.ts");
const { labelUnits } = await import("../src/core/source-extract.ts");
type PiEngine = import("../src/agent/models.ts").PiEngine;
type ChatInput = import("../src/core/input-events.ts").ChatInput;
type Scenario = import("../src/evals/types.ts").Scenario;
type SessionPort = import("../src/evals/driver.ts").SessionPort;

after(() => fs.rmSync(TMP, { recursive: true, force: true }));

const args = (x: Record<string, unknown>) => x as unknown as ToolCall["arguments"];
function engineOf(steps: FauxResponseStep[]): { engine: PiEngine; prompts: string[] } {
	const faux = createFauxCore({});
	const prompts: string[] = [];
	faux.setResponses(steps.map((s) => (context, ...rest) => {
		prompts.push(JSON.stringify(context.messages));
		return typeof s === "function" ? s(context, ...rest) : s;
	}));
	return { engine: { model: faux.getModel(), streamFn: faux.streamSimple }, prompts };
}

const QUIZ = {
	question: "Under DORA Article 28, who stays responsible when an ICT service is outsourced?",
	options: [{ label: "The ICT provider" }, { label: "The financial entity" }, { label: "The supervisor" }],
	correctAnswer: "The financial entity",
	explanation: "Article 28(1) keeps the financial entity fully responsible.",
	type: "check",
	nodeId: "dora-art28",
};
/** The letter the dock shows for the right option (quiz options are shuffled by call id). */
const PICK = String.fromCharCode(65 + questionDataFor("quiz", "quiz-1", QUIZ as never).options.findIndex((o) => o.label === "The financial entity"));
const LINK = "[Regulation (EU) 2022/2554, Art. 28(1)](#src-ver_dfa4295bb03c-U";

const SCENARIO: Scenario = {
	id: "faux",
	title: "Faux run",
	persona: "A compliance analyst who thinks the provider is responsible.",
	opening: "Teach me DORA Article 28.",
	rubric: ["probes_first", "accuracy"],
	checks: ["no_failed_turns", "citations"],
};

function sessionPort(teacher: PiEngine): SessionPort & { posted: ChatInput[] } {
	const posted: ChatInput[] = [];
	return {
		posted,
		createChat(title) {
			const chat = chatStore.createChat(title);
			chatStore.saveSettings(chat.id, { model: { provider: "openrouter", id: "z-ai/glm-5.3-flash" } });
			chatStore.saveTree(chat.id, { nodes: [{ id: "dora-art28", title: "DORA Article 28" }], edges: [] } as never);
			return chat.id;
		},
		async send(chatId, input) {
			posted.push(input);
			const ack = await handleChatRequest(
				new Request("http://eval/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chatId, input }) }),
				(opts) => createTeacherAgent(undefined, { engine: teacher, messages: opts.messages }),
			);
			assert.equal(ack.status, 200, await ack.clone().text());
			const handle = runningTurn(chatId);
			if (handle) await new Response(handle.subscribe()).text();
		},
		messages: (chatId) => chatStore.getChat(chatId)?.messages ?? [],
		usage: () => [],
		resolves: (ref) => sourceUnitView(ref) !== null,
	};
}

describe("runScenario through the real chat handler (faux engines)", () => {
	it("answers the quiz the way the dock would, cites, is judged, and writes the summary", async () => {
		const units = JSON.parse(fs.readFileSync(path.join(TMP, "graph", "document-units", "ver_dfa4295bb03c.json"), "utf8")).units;
		const label = labelUnits(units).find((l) => l.unit.path.slice(-2).join() === "Article 28,paragraph 1")!.label!;
		assert.equal(sourceUnitView({ versionId: "ver_dfa4295bb03c", label })?.label, "Regulation (EU) 2022/2554, Art. 28(1)");
		const teacher = engineOf([
			fauxAssistantMessage([fauxToolCall("quiz", args(QUIZ), { id: "quiz-1" })], { stopReason: "toolUse" }),
			fauxAssistantMessage(`Right. The financial entity stays fully responsible ${LINK}${label.slice(1)}).`),
		]);
		const learner = engineOf([
			fauxAssistantMessage([fauxToolCall("submit_learner_move", args({ choose: [PICK], confidence: 80, thinking: "the bank signs the contract" }), { id: "l-1" })], { stopReason: "toolUse" }),
			fauxAssistantMessage([fauxToolCall("submit_learner_move", args({ reply: "" }), { id: "l-2" })], { stopReason: "toolUse" }),
			fauxAssistantMessage([fauxToolCall("submit_learner_move", args({ dontKnow: true }), { id: "l-3" })], { stopReason: "toolUse" }),
		]);
		const judge = engineOf([
			fauxAssistantMessage([fauxToolCall("submit_scores", args({ scores: [
				{ id: "probes_first", score: 2, quote: "TUTOR asks (quiz):", reason: "It asked before teaching." },
				{ id: "accuracy", score: 2, quote: "The financial entity stays fully responsible", reason: "Correct." },
			] }), { id: "j-1" })], { stopReason: "toolUse" }),
		]);
		const session = sessionPort(teacher.engine);
		const lines: string[] = [];
		const r = await runScenario({ scenario: SCENARIO, session, learner: learner.engine, judge: judge.engine, commit: "abc1234", log: (l) => lines.push(l), now: () => "2026-11-01T09:00:00.000Z" });

		// The posted answer is exactly what the dock builds for option B.
		const qd = questionDataFor("quiz", "quiz-1", QUIZ as never);
		const pick = qd.options.findIndex((o) => o.label === "The financial entity");
		const expected = buildAnswer(qd, { values: [qd.options[pick]!.value], thinking: "the bank signs the contract", confidence: 80 }, "quiz");
		const answer = session.posted.find((p) => p.type === "answer");
		assert.ok(answer && answer.type === "answer");
		assert.equal(answer.toolCallId, "quiz-1");
		assert.deepEqual({ ...answer.answer, answeredAt: undefined }, { ...expected, answeredAt: undefined });
		assert.equal(expected.correct, true);

		// The empty reply with nothing pending ends the run; the judge read the transcript.
		assert.equal(r.stop, "ended");
		assert.equal(r.learnerReplies, 1);
		assert.match(r.transcript, /^LEARNER: Teach me DORA Article 28\./);
		assert.match(r.transcript, /LEARNER answers: The financial entity \(confidence 80%\)/);
		assert.match(r.transcript, new RegExp(`\\n  ${PICK}\\. The financial entity`), "the transcript letters match the dock's");
		assert.match(learner.prompts[0]!, new RegExp(`${PICK}\\. The financial entity`), "and so do the learner's");
		assert.deepEqual(r.checks.map((c) => [c.id, c.pass]), [["no_failed_turns", true], ["citations", true]]);
		assert.deepEqual(r.scores.map((s) => s.score), [2, 2]);
		assert.deepEqual(r.total, { score: 4, max: 4 });
		assert.equal(r.usage.learner.length, 1);
		assert.equal(r.usage.judge.length, 1);
		assert.equal(r.ranAt, "2026-11-01T09:00:00.000Z");
		assert.ok(lines[0]!.startsWith("[faux] learner: Teach me"));

		const md = summaryMarkdown("abc1234", [r]);
		assert.match(md, /^# Teaching evals at abc1234\n/);
		assert.match(md, /\| faux \| ended \| 1 \| 2 of 2 \| 4 of 4 \|/);
		assert.match(md, /- Rubric `accuracy`: 2 of 2\. Correct\. Quote: "The financial entity stays fully responsible"/);
	});

	it("stops at the reply cap", async () => {
		const teacher = engineOf(Array.from({ length: 4 }, (_, i) => fauxAssistantMessage(`Point ${i + 1}.`)));
		const learner = engineOf(Array.from({ length: 4 }, (_, i) => fauxAssistantMessage([fauxToolCall("submit_learner_move", args({ reply: `Go on ${i}.` }), { id: `l-${i}` })], { stopReason: "toolUse" })));
		const judge = engineOf([
			fauxAssistantMessage([fauxToolCall("submit_scores", args({ scores: [
				{ id: "probes_first", score: 0, quote: "TUTOR: Point 1.", reason: "No probe." },
				{ id: "accuracy", score: 1, quote: "TUTOR: Point 2.", reason: "Thin." },
			] }), { id: "j-1" })], { stopReason: "toolUse" }),
		]);
		const session = sessionPort(teacher.engine);
		const r = await runScenario({ scenario: SCENARIO, session, learner: learner.engine, judge: judge.engine, commit: "abc1234", maxReplies: 2 });
		assert.equal(r.stop, "cap");
		assert.equal(r.learnerReplies, 2);
		assert.equal(session.posted.length, 3, "the opening and two replies");
		assert.deepEqual(r.total, { score: 1, max: 4 });
		assert.equal(r.checks.find((c) => c.id === "citations")!.pass, false);
	});
});
