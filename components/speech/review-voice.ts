/**
 * The voice review's transport (Kvasir P3-6): the review queue and the
 * rating write over the same /api/review route the review page uses
 * (D182). Shared by the drive review screen and the tests, which route
 * fetch to the real handlers.
 */

import { createReviewTurnSender, type ReviewQueueView, type ReviewTurnSender, type ReviewTurnSenderOptions } from "@/src/core";

const reviewId = () => `rev_${Date.now().toString(36)}_${crypto.randomUUID().slice(0, 8)}`;

export function createReviewVoiceSender(
	callbacks: Pick<ReviewTurnSenderOptions, "onSaved" | "onSaveFailed" | "onProgress">,
	fetchFn: typeof fetch = fetch,
): ReviewTurnSender {
	return createReviewTurnSender({
		...callbacks,
		newId: reviewId,
		async loadQueue() {
			const res = await fetchFn("/api/review", { cache: "no-store" });
			if (!res.ok) throw new Error(`review queue ${res.status}`);
			return ((await res.json()) as ReviewQueueView).items;
		},
		async record(review) {
			const res = await fetchFn("/api/review", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(review),
			});
			if (!res.ok) throw new Error(`record review ${res.status}`);
		},
	});
}
