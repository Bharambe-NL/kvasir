/**
 * The voice review (Kvasir P3-6, D182 to D186): the P1 review queue read
 * aloud and rated by spoken word. Browser-safe and pure: the queue read and
 * the rating write are injected, so tests drive it with the real route.
 *
 * createReviewTurnSender is a TurnSender for runVoiceLoop. No model is
 * called (D182): each utterance moves a small script on.
 *
 *   opening    the loop's first turn (speakFirst): the count, the first question
 *   question   his utterance is the answer: the stored answer is read (D184)
 *   rating     his utterance should hold a rating word (D185); saved, a tone,
 *              then the next question (D186), or the rating asked again
 *   done       the queue is empty; the closing line is repeated
 *
 * The phase moves on when a turn starts, so a barge-in over the question
 * counts as the answer, and one over the answer as the rating.
 */

import type { ReviewRating } from "./contracts/learner.ts";
import type { TurnSender } from "./speech.ts";
import type { ReviewQueueItem } from "./review-view.ts";

export const VOICE_REVIEW_TEXT = {
	nothingDue: "Nothing is due right now.",
	askRating: "Again, hard, good or easy?",
	saveFailed: "I couldn't save that rating. Say it again.",
} as const;

/** "<N> cards due. Here is the first." (one card: "1 card due.") */
export function openingLine(due: number): string {
	return due === 1 ? "1 card due." : `${due} cards due. Here is the first.`;
}

/** "That's all <N> cards for today." */
export function endLine(rated: number): string {
	return `That's all ${rated} ${rated === 1 ? "card" : "cards"} for today.`;
}

/** The question as spoken: a fallback card (D042) is "Recall: <name>." */
export function spokenQuestion(item: Pick<ReviewQueueItem, "question">): string {
	const prompt = item.question.prompt.trim();
	return /[.?!]$/.test(prompt) ? prompt : `${prompt}.`;
}

const RATING_WORDS: Record<string, ReviewRating> = {
	again: 1, one: 1, "1": 1,
	hard: 2, two: 2, "2": 2,
	good: 3, three: 3, "3": 3,
	easy: 4, four: 4, "4": 4,
};

/** The rating in a short reply (D185): a rating name or "one" to "four",
 *  anywhere in it. Null when none is heard or two different ones are. */
export function ratingFromWords(text: string): ReviewRating | null {
	const found = new Set<ReviewRating>();
	for (const word of text.toLowerCase().split(/[^a-z0-9]+/)) {
		const rating = RATING_WORDS[word];
		if (rating !== undefined) found.add(rating);
	}
	return found.size === 1 ? [...found][0]! : null;
}

export interface VoiceReviewProgress {
	/** Cards rated in this session. */
	rated: number;
	/** Cards still due now, the current one included. */
	due: number;
}

export interface ReviewTurnSenderOptions {
	/** Today's queue (GET /api/review), read before each card. */
	loadQueue(): Promise<ReviewQueueItem[]>;
	/** Save one rating (POST /api/review); throws when it was not saved. */
	record(review: { id: string; nodeId: string; rating: ReviewRating }): Promise<void>;
	newId(): string;
	/** A rating was saved: the UI plays the soft tone (D186). */
	onSaved?(): void;
	onSaveFailed?(err: unknown): void;
	onProgress?(progress: VoiceReviewProgress): void;
}

export type ReviewTurnSender = TurnSender & {
	/** The line to repeat after silence (D169): the question, or the rating ask. */
	openQuestion(): string | null;
	/** The queue is empty and the closing line was given. */
	done(): boolean;
};

type Phase = "opening" | "question" | "rating" | "done";

export function createReviewTurnSender(opts: ReviewTurnSenderOptions): ReviewTurnSender {
	let phase: Phase = "opening";
	let card: ReviewQueueItem | null = null;
	let rated = 0;

	/** Read the queue and move to its first card, or to done. */
	const nextCard = async (): Promise<number> => {
		const queue = await opts.loadQueue();
		card = queue[0] ?? null;
		phase = card ? "question" : "done";
		opts.onProgress?.({ rated, due: queue.length });
		return queue.length;
	};

	async function* send(utterance: string): AsyncIterable<string> {
		switch (phase) {
			case "opening": {
				const due = await nextCard();
				if (!card) {
					yield VOICE_REVIEW_TEXT.nothingDue;
					return;
				}
				yield `${openingLine(due)} ${spokenQuestion(card)}`;
				return;
			}
			case "question":
				phase = "rating";
				yield card!.question.answer;
				return;
			case "rating": {
				const rating = ratingFromWords(utterance);
				if (rating === null) {
					yield VOICE_REVIEW_TEXT.askRating;
					return;
				}
				try {
					await opts.record({ id: opts.newId(), nodeId: card!.nodeId, rating });
				} catch (err) {
					opts.onSaveFailed?.(err);
					yield VOICE_REVIEW_TEXT.saveFailed;
					return;
				}
				rated++;
				opts.onSaved?.();
				await nextCard();
				yield card ? spokenQuestion(card) : endLine(rated);
				return;
			}
			case "done":
				yield rated === 0 ? VOICE_REVIEW_TEXT.nothingDue : endLine(rated);
		}
	}

	const sender = ((utterance: string) => send(utterance)) as ReviewTurnSender;
	sender.openQuestion = () => {
		if (phase === "question" && card) return spokenQuestion(card);
		if (phase === "rating") return VOICE_REVIEW_TEXT.askRating;
		return null;
	};
	sender.done = () => phase === "done";
	return sender;
}
