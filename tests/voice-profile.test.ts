/**
 * The voice prompt profile (Kvasir P3-1, D149 to D152): the overlay's
 * composition order, the formatting guide dropped in voice, the default and
 * practice prompts unchanged, every rule of the Socratic Tutor contract
 * present, the override path grammar, and the profile reaching a built
 * agent's system prompt.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createFauxCore } from "@earendil-works/pi-ai";
import { allSegmentPaths, listSourceSegments } from "../src/agent/prompt-segments.ts";
import { composeInstructions, createTeacherAgent } from "../src/agent/teacher-agent.ts";
import { isValidSegmentPath } from "../src/core/prompt-segments.ts";
import type { PiEngine } from "../src/agent/models.ts";

const paths = (agent: "prober" | "teacher" | "practice", voice = false) =>
	listSourceSegments(agent, voice ? "voice" : undefined).map((s) => s.path);

describe("voice profile composition (D149)", () => {
	it("the teacher: base, its own fragments, the shared appendix without the written guides, then voice shared and voice teacher", () => {
		const def = paths("teacher");
		const voice = paths("teacher", true);
		const DROPPED = ["shared/20-question-tools.md", "shared/40-formatting.md"];
		for (const p of DROPPED) {
			assert.ok(def.includes(p));
			assert.ok(!voice.includes(p), `${p}: replaced by its spoken guide (D149, D160)`);
		}
		const kept = def.filter((p) => !DROPPED.includes(p));
		assert.deepEqual(voice.slice(0, kept.length), kept);
		assert.deepEqual(voice.slice(kept.length), ["voice/shared/10-spoken-session.md", "voice/shared/20-spoken-questions.md", "voice/teacher/10-spoken-teaching.md"]);
	});

	it("the prober gets the spoken session, the spoken questions and the setup questions, last", () => {
		const voice = paths("prober", true);
		assert.deepEqual(voice.slice(-3), ["voice/shared/10-spoken-session.md", "voice/shared/20-spoken-questions.md", "voice/prober/10-setup.md"]);
		assert.ok(!voice.some((p) => p.startsWith("voice/teacher/")), "never the other agent's overlay");
	});

	it("the default profile and practice are unchanged", () => {
		for (const agent of ["prober", "teacher", "practice"] as const) {
			assert.ok(!paths(agent).some((p) => p.startsWith("voice/")), `${agent}: no voice by default`);
		}
		assert.deepEqual(paths("practice", true), paths("practice"), "practice has no voice overlay");
		assert.equal(composeInstructions("practice", undefined, "voice"), composeInstructions("practice"));
	});

	it("voice fragments can be overridden like any other segment", () => {
		for (const p of ["voice/shared/10-spoken-session.md", "voice/prober/10-setup.md", "voice/teacher/10-spoken-teaching.md"]) {
			assert.ok(isValidSegmentPath(p), p);
			assert.ok(allSegmentPaths().includes(p), `${p} is a known segment`);
		}
		for (const bad of ["voice/10-x.md", "voice/practice/10-x.md", "voice/teacher/x.md", "voice/../shared/10-x.md"]) {
			assert.ok(!isValidSegmentPath(bad), bad);
		}
	});

	it("a built agent with promptProfile voice runs on the voice composition", () => {
		const faux = createFauxCore({});
		const engine: PiEngine = { model: faux.getModel(), streamFn: faux.streamSimple };
		const voiceAgent = createTeacherAgent(undefined, { engine, promptProfile: "voice" });
		const plainAgent = createTeacherAgent(undefined, { engine });
		assert.equal(voiceAgent.state.systemPrompt, composeInstructions("teacher", undefined, "voice"));
		assert.equal(plainAgent.state.systemPrompt, composeInstructions("teacher"));
		assert.ok(voiceAgent.state.systemPrompt.trimEnd().endsWith("and go on."), "the voice rules close the prompt");
	});
});

describe("the Socratic Tutor contract is in the voice prompts", () => {
	const prober = composeInstructions("prober", undefined, "voice");
	const teacher = composeInstructions("teacher", undefined, "voice");
	const RULES: [string, string, RegExp][] = [
		["1 four setup questions, one at a time", prober, /Background[\s\S]*Goal[\s\S]*Session length[\s\S]*Hint style/],
		["2 start slow, then raise the difficulty", teacher, /Start slow[\s\S]*Raise the difficulty as he shows he has it/],
		["3 one question at a time, in small chunks", prober + teacher, /One question per turn[\s\S]*Small chunks/],
		["4 confirm, correct, add one layer", teacher, /Confirm[\s\S]*Correct[\s\S]*Add one new layer/],
		["5 two hints, then the answer", teacher, /First hint[\s\S]*Second hint[\s\S]*Then the answer/],
		["6 examples from his field, then a worked example", teacher, /Examples come from his field[\s\S]*Wero[\s\S]*worked example/],
		["7 recap each section", teacher, /Recap each section/],
		["8 never read a formula aloud", prober + teacher, /Never read a formula aloud/],
		["9 never several options at once", prober + teacher, /Never offer several options at once/],
	];
	for (const [rule, text, pattern] of RULES) it(`rule ${rule}`, () => assert.match(text, pattern));

	it("the voice prompts no longer ask for Markdown or LaTeX documents", () => {
		for (const text of [prober, teacher]) {
			assert.doesNotMatch(text, /he receives documents, not chat messages/);
			assert.doesNotMatch(text, /LaTeX everywhere/, "the written question guide is gone (P3-3)");
		}
	});

	it("every question goes through ask_spoken (P3-3, D160)", () => {
		for (const text of [prober, teacher]) {
			assert.match(text, /every question goes through `ask_spoken`/);
			assert.match(text, /Grade strictly against your commitment/);
		}
	});
});
