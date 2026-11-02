/**
 * The drive screen (Kvasir P3-5, D173 to D178): the words and buttons in
 * each phase, the visuals count, the error notices, and what the screen
 * reads from a voice session's record. Static markup; no audio.
 */
import React from "react";
(globalThis as Record<string, unknown>).React = React;
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { DriveView } from "../components/drive/drive-mode.tsx";
import { DRIVE_TEXT, driveErrorKind, visualsLabel, visualsWaiting, type DrivePhase } from "../src/core/drive.ts";

const noop = () => {};
const view = (phase: DrivePhase, extra: Partial<Parameters<typeof DriveView>[0]> = {}) =>
	renderToStaticMarkup(<DriveView phase={phase} error={null} visuals={0} chatId="chat_1" running={phase !== "ready" && phase !== "ended"} onToggle={noop} onEnd={noop} onAddKey={noop} {...extra} />);
const text = (html: string, testid: string) => new RegExp(`data-testid="${testid}"[^>]*>([^<]*)<`).exec(html)?.[1];

describe("the drive screen", () => {
	it("before Start: the hint, Start, no state word, End hidden", () => {
		const html = view("ready", { chatId: null });
		assert.equal(text(html, "drive-hint"), "Press Start, then say what you want to learn.");
		assert.equal(text(html, "drive-toggle"), "Start");
		assert.equal(text(html, "drive-state"), "");
		assert.match(html, /data-testid="drive-end"[^>]*disabled/);
		assert.doesNotMatch(html, /drive-transcript/, "no transcript before the chat exists");
	});

	it("one state word per phase, and the big button pauses or resumes", () => {
		for (const [phase, word, button] of [
			["listening", "Listening", "Pause"],
			["thinking", "Thinking", "Pause"],
			["speaking", "Speaking", "Pause"],
			["paused", "Paused", "Resume"],
			["ended", "Ended", "Start"],
		] as const) {
			const html = view(phase);
			assert.equal(text(html, "drive-state"), word, phase);
			assert.equal(text(html, "drive-toggle"), button, phase);
		}
		assert.match(view("listening"), /href="\/chat\/chat_1"[^>]*>Transcript</);
	});

	it("shows how many visuals wait (D178)", () => {
		assert.doesNotMatch(view("listening"), /drive-visuals/);
		assert.equal(text(view("listening", { visuals: 1 }), "drive-visuals"), "1 visual to view later");
		assert.equal(text(view("listening", { visuals: 3 }), "drive-visuals"), "3 visuals to view later");
		assert.equal(visualsLabel(0), "");
	});

	it("error notices", () => {
		assert.match(view("ready", { error: "noKey" }), /Voice needs a Deepgram key\. <button[^>]*>Add one<\/button> in Settings\./);
		assert.equal(text(view("paused", { error: "connectionLost" }), "drive-error"), DRIVE_TEXT.connectionLost);
		assert.equal(text(view("ready", { error: "noMicrophone" }), "drive-error"), "Microphone not available. Check Kvasir's microphone access in System Settings.".replace("'", "&#x27;"));
	});
});

describe("drive mode's reading of the record", () => {
	it("counts demo and visual calls, less the failed ones", () => {
		const messages = [
			{ role: "user", content: "Teach me" },
			{ role: "assistant", content: [{ type: "text", text: "Here." }, { type: "toolCall", name: "demo", id: "d1" }, { type: "toolCall", name: "ask_spoken", id: "q1" }] },
			{ role: "toolResult", toolCallId: "d1", isError: false },
			{ role: "assistant", content: [{ type: "toolCall", name: "visual", id: "v1" }, { type: "toolCall", name: "visual", id: "v2" }] },
			{ role: "toolResult", toolCallId: "v2", isError: true },
		];
		assert.equal(visualsWaiting(messages), 2);
		assert.equal(visualsWaiting([]), 0);
	});

	it("sorts failures into the screen's three notices", () => {
		assert.equal(driveErrorKind(new Error("Voice needs a Deepgram key")), "noKey");
		assert.equal(driveErrorKind(Object.assign(new Error("Permission denied"), { name: "NotAllowedError" })), "noMicrophone");
		assert.equal(driveErrorKind(new Error("Deepgram listening stopped (1011)")), "connectionLost");
	});
});
