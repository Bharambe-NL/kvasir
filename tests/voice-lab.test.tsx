/**
 * The dev-only voice page (Kvasir P3-4, D171): it renders in development,
 * and a production build answers 404.
 */
import React from "react";
(globalThis as Record<string, unknown>).React = React;
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import DevVoicePage from "../app/dev/voice/page.tsx";

describe("the dev voice page", () => {
	it("shows Start and the idle state outside production", () => {
		const html = renderToStaticMarkup(<DevVoicePage />);
		assert.match(html, />Start</);
		assert.match(html, /data-testid="voice-state">idle</);
	});

	it("is not found in a production build", () => {
		const env = process.env as Record<string, string | undefined>;
		const before = env.NODE_ENV;
		env.NODE_ENV = "production";
		try {
			assert.throws(() => DevVoicePage(), (e: unknown) => String((e as { digest?: string }).digest ?? e).includes("404"));
		} finally {
			env.NODE_ENV = before;
		}
	});
});
