/**
 * The Memory scheduler (P1-2): FSRS over the review ledger, with fixed
 * clocks only. Covers the "Done when" phases (new, learning, review, lapse,
 * relearn), ledger handling, determinism and the rating preview, and pins
 * one sequence's exact numbers so a library or settings change fails here.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ReviewEntry, ReviewRating } from "../src/core/contracts/learner.ts";
import { isDue, previewRatings, scheduleCard, SCHEDULER_SETTINGS } from "../src/core/schedule.ts";

const NODE = "n_1";
const T0 = "2026-11-01T09:00:00.000Z";
const at = (minutes: number) => new Date(Date.parse(T0) + minutes * 60_000).toISOString();
const MIN = 60_000;
const DAY = 24 * 60 * MIN;
const review = (id: string, rating: ReviewRating, minutes: number, nodeId = NODE): ReviewEntry => ({
	id,
	nodeId,
	rating,
	reviewedAt: at(minutes),
});
const sinceT0 = (iso: string) => Date.parse(iso) - Date.parse(T0);

/** Good, then Good after the 10-minute step: the card graduates. */
const GRADUATED = [review("rev_a", 3, 0), review("rev_b", 3, 10)];

describe("scheduler settings (D033 to D035)", () => {
	it("pins retention 0.90, the FSRS short-term steps and no fuzz", () => {
		assert.equal(SCHEDULER_SETTINGS.requestRetention, 0.9);
		assert.deepEqual([...SCHEDULER_SETTINGS.learningSteps], ["1m", "10m"]);
		assert.deepEqual([...SCHEDULER_SETTINGS.relearningSteps], ["10m"]);
		assert.equal(SCHEDULER_SETTINGS.enableFuzz, false);
	});
});

describe("phases", () => {
	it("new: no reviews gives a new card due at its introduction", () => {
		const s = scheduleCard(NODE, [], T0);
		assert.equal(s.phase, "new");
		assert.equal(s.due, T0);
		assert.equal(s.reps, 0);
		assert.equal(s.lapses, 0);
		assert.equal(s.lastReviewedAt, null);
		assert.equal(isDue(s, T0), true);
	});

	it("learning: Good on a new card returns after the 10-minute step, Again after 1 minute", () => {
		const good = scheduleCard(NODE, [review("rev_a", 3, 0)], T0);
		assert.equal(good.phase, "learning");
		assert.equal(sinceT0(good.due), 10 * MIN);
		assert.equal(good.lastReviewedAt, T0);
		const again = scheduleCard(NODE, [review("rev_a", 1, 0)], T0);
		assert.equal(again.phase, "learning");
		assert.equal(sinceT0(again.due), 1 * MIN);
	});

	it("review: a second Good after the steps graduates to day-based scheduling; Easy skips the steps", () => {
		const s = scheduleCard(NODE, GRADUATED, T0);
		assert.equal(s.phase, "review");
		assert.equal(s.reps, 2);
		assert.ok(sinceT0(s.due) >= DAY, "due at least a day out");
		const easy = scheduleCard(NODE, [review("rev_a", 4, 0)], T0);
		assert.equal(easy.phase, "review");
		assert.ok(sinceT0(easy.due) > sinceT0(s.due), "Easy schedules further than the graduated Good");
	});

	it("lapse: Again on a review card enters relearning, counts a lapse and returns after 10 minutes", () => {
		const graduated = scheduleCard(NODE, GRADUATED, T0);
		const dueMinutes = sinceT0(graduated.due) / MIN;
		const s = scheduleCard(NODE, [...GRADUATED, review("rev_c", 1, dueMinutes)], T0);
		assert.equal(s.phase, "relearning");
		assert.equal(s.lapses, 1);
		assert.equal(Date.parse(s.due) - Date.parse(graduated.due), 10 * MIN);
		assert.ok(s.stability < graduated.stability, "a lapse lowers stability");
	});

	it("relearn: Good after the relearning step returns to review with lower stability than before the lapse", () => {
		const graduated = scheduleCard(NODE, GRADUATED, T0);
		const dueMinutes = sinceT0(graduated.due) / MIN;
		const s = scheduleCard(NODE, [...GRADUATED, review("rev_c", 1, dueMinutes), review("rev_d", 3, dueMinutes + 10)], T0);
		assert.equal(s.phase, "review");
		assert.equal(s.lapses, 1);
		assert.equal(s.reps, 4);
		assert.ok(s.stability < graduated.stability);
		assert.ok(Date.parse(s.due) - Date.parse(at(dueMinutes + 10)) >= DAY, "back to day-based scheduling");
	});
});

describe("ledger handling", () => {
	it("ignores other nodes' reviews, so the whole ledger can be passed", () => {
		const mixed = [review("rev_x", 1, 0, "n_other"), ...GRADUATED, review("rev_y", 4, 5, "n_other")];
		assert.deepEqual(scheduleCard(NODE, mixed, T0), scheduleCard(NODE, GRADUATED, T0));
	});

	it("counts a retried review id once", () => {
		const firstGood = GRADUATED[0]!;
		assert.deepEqual(scheduleCard(NODE, [firstGood, firstGood, GRADUATED[1]!], T0), scheduleCard(NODE, GRADUATED, T0));
	});

	it("replays in time order whatever the append order", () => {
		assert.deepEqual(scheduleCard(NODE, [...GRADUATED].reverse(), T0), scheduleCard(NODE, GRADUATED, T0));
	});
});

describe("determinism", () => {
	it("the same ledger always gives the same state", () => {
		const ledger = [...GRADUATED, review("rev_c", 2, 3000)];
		assert.deepEqual(scheduleCard(NODE, ledger, T0), scheduleCard(NODE, ledger, T0));
	});

	it("pins one sequence's exact schedule (ts-fsrs 5.4.2, D032 to D035)", () => {
		const s = scheduleCard(NODE, GRADUATED, T0);
		assert.equal(s.due, "2026-11-03T09:10:00.000Z");
		assert.equal(s.stability.toFixed(4), "2.3065");
		assert.equal(s.difficulty.toFixed(4), "2.1112");
		const easy = scheduleCard(NODE, [review("rev_a", 4, 0)], T0);
		assert.equal(easy.due, "2026-11-09T09:00:00.000Z");
	});
});

describe("previewRatings", () => {
	it("due dates rise from Again to Easy", () => {
		const now = scheduleCard(NODE, GRADUATED, T0).due;
		const p = previewRatings(NODE, GRADUATED, T0, now);
		assert.equal(p[1].phase, "relearning");
		assert.ok(Date.parse(p[1].due) < Date.parse(p[2].due));
		assert.ok(Date.parse(p[2].due) < Date.parse(p[3].due));
		assert.ok(Date.parse(p[3].due) < Date.parse(p[4].due));
	});

	it("each preview equals scheduleCard after appending that rating", () => {
		const now = scheduleCard(NODE, GRADUATED, T0).due;
		const p = previewRatings(NODE, GRADUATED, T0, now);
		for (const rating of [1, 2, 3, 4] as const) {
			const appended = scheduleCard(NODE, [...GRADUATED, { id: `rev_p${rating}`, nodeId: NODE, rating, reviewedAt: now }], T0);
			assert.deepEqual(p[rating], appended);
		}
	});
});
