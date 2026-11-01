/**
 * The spoken-reply checks (Kvasir P3-1, D153): each passes a reply a
 * listener can follow and fails the thing it guards against.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { checkVoiceReply, questionCount, VOICE_WORD_CAP } from "../src/evals/voice-checks.ts";

const failing = (text: string) => checkVoiceReply(text).filter((c) => !c.pass).map((c) => c.name);

describe("spoken reply checks", () => {
	it("a good spoken turn passes every check", () => {
		const turn = "Right, the outsourcing policy is the board's job. One thing to add: DORA also asks for a register of every contract with a provider of ICT services. Why do you think a regulator would want that register?";
		assert.deepEqual(failing(turn), []);
	});

	it("one question only", () => {
		assert.equal(questionCount("Is that right? And why?"), 2);
		assert.deepEqual(failing("What is a register? Who keeps it?"), ["one question"]);
		assert.equal(questionCount("He asked “why?” once."), 1);
	});

	it("no formulas", () => {
		for (const t of ["The cost is $n^2$.", "Use \\frac here.", "It grows as x^2 does.", "Take x_i for each.", "So risk = impact times likelihood.", "That gives σ."]) {
			assert.deepEqual(failing(t), ["no formulas"], t);
		}
		assert.deepEqual(failing("Article 28 sets the rules."), [], "a number alone is fine");
	});

	it("no options", () => {
		for (const t of ["Is it A) late, B) lost, or C) reversed", "Pick option 2", "Which of these applies here", "a. settle\nb. reverse"]) {
			assert.ok(failing(t).includes("no options"), t);
		}
	});

	it("no Markdown", () => {
		for (const t of ["## The register", "This is **key**.", "- first point", "1. first point", "| a | b |", "Run `npm test`.", "See [the text](https://eur-lex.europa.eu)."]) {
			assert.ok(failing(t).includes("no markdown"), t);
		}
	});

	it("short", () => {
		const long = Array.from({ length: VOICE_WORD_CAP + 1 }, () => "word").join(" ");
		assert.deepEqual(failing(long), ["short"]);
	});
});
