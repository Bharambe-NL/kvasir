/**
 * The review session's wire shape (P1-5): what GET /api/review returns and
 * the review page renders. Browser-safe: types plus one pure formatter, and
 * only TYPE imports from the scheduler side, so the page bundle never pulls
 * in the FSRS library.
 */

import type { CardPhase, QuestionFormat, ReviewRating } from "./contracts/learner.ts";
import type { QueueStats, Retention } from "./review-queue.ts";

export interface ReviewQueueItem {
	nodeId: string;
	name: string;
	phase: CardPhase;
	/** The generated question, or the D042 fallback ("fallback"). */
	question: { format: QuestionFormat | "fallback"; prompt: string; answer: string };
	/** ISO due time each rating would give if rated now. */
	previews: Record<ReviewRating, string>;
}

export interface ReviewQueueView {
	now: string;
	items: ReviewQueueItem[];
	stats: QueueStats;
	retention: Retention | null;
}

export type { QueueStats, Retention };

/** GET /api/review/summary (P1-6): the home signals. */
export interface ReviewSummary {
	/** Cards in today's queue right now (the review page's count). */
	due: number;
	/** Current recall chance per reviewed live card (D045), 0 to 1. */
	heat: Record<string, number>;
}

export type HeatBand = "low" | "mid" | "high";

/** The overlay band for a recall chance (D046): below 0.70 slipping, 0.70
 *  up to 0.90 fading, 0.90 and above strong. */
export function heatBand(r: number): HeatBand {
	if (r >= 0.9) return "high";
	if (r >= 0.7) return "mid";
	return "low";
}

/** A short interval label between two ISO times: "1 min", "10 min",
 *  "3 h", "4 d", "2 mo", "1.5 y". Never negative. */
export function formatInterval(fromIso: string, toIso: string): string {
	const minutes = Math.max(0, (Date.parse(toIso) - Date.parse(fromIso)) / 60_000);
	if (minutes < 60) return `${Math.max(1, Math.round(minutes))} min`;
	const hours = minutes / 60;
	if (hours < 24) return `${Math.round(hours)} h`;
	const days = hours / 24;
	if (days < 30) return `${Math.round(days)} d`;
	if (days < 365) return `${Math.round(days / 30)} mo`;
	const years = Math.round((days / 365) * 10) / 10;
	return `${years} y`;
}

/** GET /api/review/exclusions (P1-8): the birth sessions out of review. */
export interface ReviewExclusionsView {
	excluded: string[];
}
