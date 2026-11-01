/**
 * ask_spoken (Kvasir P3-3, D159 to D163): the spoken question's validator,
 * one question per turn, the graded and open forms, the teacher's plan
 * fields, the voice tool sets, and the spoken answer record.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { askSpokenToolFor, createProberTools, createTeacherTools } from "../src/agent/tools.ts";
import { askSpokenProblems, buildAnswer } from "../src/core/question-core.ts";
import { QUESTION_TOOLS, toolQuestionKind } from "../src/core/pending.ts";
import { questionDataFor } from "../src/core/question-data.ts";
import { chatStore } from "../src/store/chats.ts";
import { jobStore } from "../src/store/jobs.ts";

const GOOD = "Who do you think the regulator holds responsible when the cloud provider fails?";

describe("askSpokenProblems (D163)", () => {
	it("a plain spoken question passes, graded or open", () => {
		assert.deepEqual(askSpokenProblems({ question: GOOD }), []);
		assert.deepEqual(askSpokenProblems({ question: GOOD, correctAnswer: "The firm: it stays fully responsible." }), []);
	});

	const rejects: [string, string, RegExp][] = [
		["two questions", "Who is responsible? And why?", /exactly one question/],
		["options", "Is it A) the firm, B) the provider?", /No options/],
		["a pick-one question", "Which of these applies to Wero?", /No options/],
		["a formula", "What is $x^2$ when x is three?", /No formulas/],
		["Markdown", "What does **Article 28** require?", /No written formatting/],
		["too long", `${Array.from({ length: 41 }, () => "word").join(" ")}?`, /At most 40 words/],
		["no question mark", "Tell me who is responsible.", /question mark/],
		["empty question", "  ", /question is required/],
		["a second question joined with and (D164)", "Does it go in the register, and how is it treated there?", /starts a second one/],
		["a second question joined with or (D164)", "Who does the regulator hold to account, or why not the provider?", /starts a second one/],
		["an and-why tail (D164)", "Who does the regulator hold to account and why?", /starts a second one/],
	];
	for (const [what, question, pattern] of rejects) {
		it(`rejects ${what}`, () => assert.match(askSpokenProblems({ question }).join("\n"), pattern));
	}

	it("one question that happens to contain and or or still passes (D164)", () => {
		for (const q of ["What happens to payments when the provider fails and the firm has no exit plan?", "Who answers to the regulator when Wero and its cloud host both go down?"]) {
			assert.deepEqual(askSpokenProblems({ question: q }), [], q);
		}
	});

	it("an empty commitment is refused; the teacher's graded question needs type and nodeId", () => {
		assert.match(askSpokenProblems({ question: GOOD, correctAnswer: " " }).join("\n"), /correctAnswer is empty/);
		const graded = askSpokenProblems({ question: GOOD, correctAnswer: "The firm." }, { teach: true }).join("\n");
		assert.match(graded, /type is required/);
		assert.match(graded, /nodeId is required/);
		assert.deepEqual(askSpokenProblems({ question: GOOD }, { teach: true }), [], "an open question needs neither");
	});
});

describe("ask_spoken, one question per turn (D163)", () => {
	const run = (tool: ReturnType<typeof askSpokenToolFor>, input: object) => tool.execute("call", input as never, undefined as never, undefined as never);

	it("the first question in a turn is posed and ends the turn; a second is rejected", async () => {
		const tool = askSpokenToolFor();
		const first = await run(tool, { question: GOOD });
		assert.equal(first.isError, undefined);
		assert.equal((first as { terminate?: boolean }).terminate, true);
		const second = await run(tool, { question: "And what about the register?" });
		assert.equal(second.isError, true);
		assert.match(JSON.stringify(second.content), /One question per turn/);
	});

	it("a rejected question does not count: the fixed one goes through", async () => {
		const tool = askSpokenToolFor();
		assert.equal((await run(tool, { question: "Who? Why?" })).isError, true);
		assert.equal((await run(tool, { question: GOOD })).isError, undefined);
	});

	it("each turn's tool starts fresh", async () => {
		await run(askSpokenToolFor(), { question: GOOD });
		assert.equal((await run(askSpokenToolFor(), { question: GOOD })).isError, undefined);
	});

	it("the teacher's graded question names a node of this session's plan", async () => {
		const chat = chatStore.createChat("ask_spoken nodes", undefined, { voice: true });
		chatStore.saveTree(chat.id, { nodes: [{ id: "responsibility", title: "Responsibility" }], edges: [], version: 1 });
		const ctx = { chatId: chat.id, chatStore };
		const ok = await run(askSpokenToolFor(ctx), { question: GOOD, correctAnswer: "The firm.", type: "check", nodeId: "responsibility" });
		assert.equal(ok.isError, undefined);
		const bad = await run(askSpokenToolFor(ctx), { question: GOOD, correctAnswer: "The firm.", type: "check", nodeId: "nowhere" });
		assert.equal(bad.isError, true);
	});
});

describe("the voice tool sets (D160)", () => {
	const chat = chatStore.createChat("voice tools", undefined, { voice: true });
	const ctx = { chatId: chat.id, chatStore, jobStore, spawn: () => {}, searchAvailable: false, deliver: () => {} } as unknown as Parameters<typeof createTeacherTools>[0] & Parameters<typeof createProberTools>[0];
	const WRITTEN = ["quiz", "probe", "explain", "recall", "ask_user_question"];

	it("in voice, ask_spoken replaces every question tool for the prober and the teacher", () => {
		for (const tools of [createProberTools(ctx, undefined, { voice: true }), createTeacherTools(ctx, undefined, { voice: true })]) {
			assert.ok(tools.ask_spoken, "ask_spoken is there");
			for (const name of WRITTEN) assert.equal(tools[name], undefined, `${name} is gone`);
		}
		assert.ok(createTeacherTools(ctx, undefined, { voice: true }).plan_init, "the other tools stay");
	});

	it("written sessions are unchanged", () => {
		const prober = createProberTools(ctx);
		const teacher = createTeacherTools(ctx);
		assert.equal(prober.ask_spoken, undefined);
		assert.equal(teacher.ask_spoken, undefined);
		assert.ok(prober.probe && prober.ask_user_question && teacher.quiz && teacher.ask_user_question);
	});
});

describe("the spoken answer (D159)", () => {
	it("ask_spoken is a question tool of kind spoken", () => {
		assert.ok((QUESTION_TOOLS as readonly string[]).includes("ask_spoken"));
		assert.equal(toolQuestionKind("ask_spoken"), "spoken");
	});

	it("a graded answer carries the words and the commitment; an open one only the words", () => {
		const graded = buildAnswer(questionDataFor("ask_spoken", "c1", { question: GOOD, correctAnswer: "The firm." }), { text: "The firm, I think." });
		assert.equal(graded.kind, "spoken");
		assert.equal(graded.committed, "The firm.");
		assert.match(JSON.stringify(graded), /The firm, I think\./);
		const open = buildAnswer(questionDataFor("ask_spoken", "c2", { question: "What do you do for work?" }), { text: "EU payments." });
		assert.equal(open.committed, undefined);
	});
});
