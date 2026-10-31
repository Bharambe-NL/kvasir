/** Browser-safe review view helpers (P1-5, P1-6): interval labels and the
 *  retention heat bands (D046). Pure. */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatInterval, heatBand } from "../src/core/review-view.ts";

describe("heatBand (D046)", () => {
	it("splits at 0.70 and 0.90", () => {
		assert.equal(heatBand(0), "low");
		assert.equal(heatBand(0.6999), "low");
		assert.equal(heatBand(0.7), "mid");
		assert.equal(heatBand(0.8999), "mid");
		assert.equal(heatBand(0.9), "high");
		assert.equal(heatBand(1), "high");
	});
});

describe("formatInterval", () => {
	const t = "2026-11-01T09:00:00.000Z";
	const plus = (minutes: number) => new Date(Date.parse(t) + minutes * 60_000).toISOString();
	it("labels minutes, hours, days, months and years, never below 1 min", () => {
		assert.equal(formatInterval(t, t), "1 min");
		assert.equal(formatInterval(t, plus(-30)), "1 min");
		assert.equal(formatInterval(t, plus(10)), "10 min");
		assert.equal(formatInterval(t, plus(6 * 60)), "6 h");
		assert.equal(formatInterval(t, plus(8 * 24 * 60)), "8 d");
		assert.equal(formatInterval(t, plus(60 * 24 * 60)), "2 mo");
		assert.equal(formatInterval(t, plus(548 * 24 * 60)), "1.5 y");
	});
});
