/**
 * A voice session in the written window (Kvasir P3-3): an open ask_spoken
 * question shows as a text answer, as free recall does, and its answered
 * card shows the words and, when graded, the commitment.
 */
import React from "react";
(globalThis as Record<string, unknown>).React = React;
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { QuestionDock } from "../components/question-dock.tsx";
import { answerForPresentation } from "../src/core/answer-presentation.ts";
import { buildAnswer } from "../src/core/question-core.ts";
import { questionDataFor } from "../src/core/question-data.ts";
import { parseAskSpokenInput } from "../src/core/tool-parts.ts";

const INPUT = { question: "Who does the regulator hold responsible when Wero stops?", correctAnswer: "The firm." };

describe("ask_spoken in the written window", () => {
	it("parses for display with the question alone", () => {
		assert.equal(parseAskSpokenInput({ question: "What do you do for work?" })?.question, "What do you do for work?");
		assert.equal(parseAskSpokenInput({ question: "  " }), undefined);
	});

	it("the open question renders as a text answer, never as a malformed card", () => {
		const html = renderToStaticMarkup(
			<QuestionDock toolName="ask_spoken" toolCallId="q1" input={INPUT} expanded dictationClaim={false} onExpand={() => {}} onSubmit={() => {}} />,
		);
		assert.doesNotMatch(html, /malformed-question/);
		assert.match(html, /Who does the regulator hold responsible/);
		assert.match(html, /data-testid="answer-field"/, "a text answer, like free recall");
	});

	it("the answered card's presentation carries the commitment of a graded spoken question", () => {
		const answer = buildAnswer(questionDataFor("ask_spoken", "q1", INPUT), { text: "The firm, I think." });
		const shown = answerForPresentation(answer, INPUT);
		assert.equal(shown.questionText, INPUT.question);
		assert.equal(shown.committed, "The firm.");
	});
});
