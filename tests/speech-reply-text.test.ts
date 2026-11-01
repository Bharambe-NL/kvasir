/**
 * Reply text from the chat's own stream (Kvasir P3-2): message_update
 * events carry the full message so far; the tracker yields only what is
 * new, skips thinking and tool calls, and starts a new paragraph for a
 * second assistant message in the same turn.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ReplyTextTracker, replyTextOf } from "../src/core/speech.ts";

const msg = (timestamp: number, ...content: unknown[]) => ({ role: "assistant", timestamp, content });
const update = (message: unknown) => ({ type: "message_update", message });

describe("replyTextOf", () => {
	it("speaks text parts only", () => {
		assert.equal(replyTextOf(msg(1, { type: "thinking", thinking: "hmm" }, { type: "text", text: "Hello. " }, { type: "toolCall", name: "quiz" }, { type: "text", text: "Next." })), "Hello. Next.");
		assert.equal(replyTextOf({ role: "user", content: [{ type: "text", text: "me" }] }), "");
		assert.equal(replyTextOf(null), "");
	});
});

describe("ReplyTextTracker", () => {
	it("yields only the new text of a growing message", () => {
		const t = new ReplyTextTracker();
		assert.equal(t.feed(update(msg(1, { type: "text", text: "The firm" }))), "The firm");
		assert.equal(t.feed(update(msg(1, { type: "text", text: "The firm stays" }))), " stays");
		assert.equal(t.feed(update(msg(1, { type: "text", text: "The firm stays" }))), "", "nothing new");
		assert.equal(t.feed({ type: "message_end", message: msg(1, { type: "text", text: "The firm stays responsible." }) }), " responsible.");
	});

	it("a second assistant message in the turn starts a paragraph", () => {
		const t = new ReplyTextTracker();
		t.feed(update(msg(1, { type: "text", text: "First." })));
		assert.equal(t.feed(update(msg(2, { type: "text", text: "Second" }))), "\n\nSecond");
	});

	it("ignores other events and non-assistant messages", () => {
		const t = new ReplyTextTracker();
		assert.equal(t.feed({ type: "agent_start" }), "");
		assert.equal(t.feed({ type: "tool_execution_end" }), "");
		assert.equal(t.feed(update({ role: "user", timestamp: 1, content: [{ type: "text", text: "hi" }] })), "");
	});
});
