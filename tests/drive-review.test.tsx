/**
 * The voice review screen (Kvasir P3-6, D183): the drive screen with the
 * review's own line under Start, its place in the queue in the corner and
 * no Transcript link; and the review page's "Review by voice" button.
 * Static markup; no audio.
 */
import React from "react";
(globalThis as Record<string, unknown>).React = React;
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { DriveView } from "../components/drive/drive-mode.tsx";
import { reviewPlace, VOICE_REVIEW_TEXT } from "../src/core/voice-review.ts";

const noop = () => {};
const text = (html: string, testid: string) => new RegExp(`data-testid="${testid}"[^>]*>([^<]*)<`).exec(html)?.[1];

describe("the voice review screen", () => {
	it("before Start: the review's own line and no transcript", () => {
		const html = renderToStaticMarkup(<DriveView phase="ready" error={null} visuals={0} chatId={null} running={false} onToggle={noop} onEnd={noop} onAddKey={noop} hint={VOICE_REVIEW_TEXT.ready} corner="" />);
		assert.equal(text(html, "drive-hint"), "Press Start to hear the first card.");
		assert.equal(text(html, "drive-toggle"), "Start");
		assert.doesNotMatch(html, /drive-transcript|drive-visuals/);
	});

	it("while running: the card's place in the corner", () => {
		const html = renderToStaticMarkup(<DriveView phase="speaking" error={null} visuals={0} chatId={null} running onToggle={noop} onEnd={noop} onAddKey={noop} hint={VOICE_REVIEW_TEXT.ready} corner={reviewPlace({ rated: 2, due: 18 })} />);
		assert.equal(text(html, "drive-visuals"), "3 of 20");
	});

	it("the place label", () => {
		assert.equal(reviewPlace({ rated: 0, due: 20 }), "1 of 20");
		assert.equal(reviewPlace({ rated: 19, due: 1 }), "20 of 20");
		assert.equal(reviewPlace({ rated: 20, due: 0 }), "20 done");
		assert.equal(reviewPlace({ rated: 0, due: 0 }), "");
	});
});
