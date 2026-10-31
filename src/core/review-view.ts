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
