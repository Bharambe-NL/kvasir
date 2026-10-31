"use client";

/**
 * The review session (P1-5, the Memory system's page). One card at a time:
 * read the cue or scenario, think, reveal with Space or Enter, rate with 1
 * to 4 (Again, Hard, Good, Easy). The next card follows. Fully keyboard
 * driven (D044): no typed answers. Refetches on "reviews-changed", so a
 * question generated in the background replaces the name fallback (D042).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { formatInterval, type ReviewQueueView, type ReviewRating } from "@/src/core";
import { Button } from "@/components/ui/button";
import { useServerEvent } from "@/components/server-events";

const RATINGS: { rating: ReviewRating; label: string }[] = [
	{ rating: 1, label: "Again" },
	{ rating: 2, label: "Hard" },
	{ rating: 3, label: "Good" },
	{ rating: 4, label: "Easy" },
];

const FORMAT_LABEL = { cue: "Cue", scenario: "Scenario", fallback: "Recall" } as const;

const reviewId = () => `rev_${Date.now().toString(36)}_${crypto.randomUUID().slice(0, 8)}`;

function isTypingTarget(target: EventTarget | null): boolean {
	if (!target || typeof (target as HTMLElement).tagName !== "string") return false;
	const el = target as HTMLElement;
	const tag = el.tagName.toLowerCase();
	return tag === "input" || tag === "textarea" || tag === "select" || el.isContentEditable === true;
}

export function ReviewSession() {
	const [view, setView] = useState<ReviewQueueView | null>(null);
	const [loadError, setLoadError] = useState(false);
	const [saveError, setSaveError] = useState(false);
	const [revealed, setRevealed] = useState(false);
	const [saving, setSaving] = useState(false);
	const shownNode = useRef<string | null>(null);

	const load = useCallback(async () => {
		try {
			const res = await fetch("/api/review", { cache: "no-store" });
			if (!res.ok) throw new Error(String(res.status));
			setView((await res.json()) as ReviewQueueView);
			setLoadError(false);
		} catch {
			setLoadError(true);
		}
	}, []);

	useEffect(() => {
		void load();
	}, [load]);
	useServerEvent("reviews-changed", () => void load());

	const current = view?.items[0] ?? null;
	// A new card starts hidden; a refetch of the same card keeps the reveal.
	if ((current?.nodeId ?? null) !== shownNode.current) {
		shownNode.current = current?.nodeId ?? null;
		if (revealed) setRevealed(false);
	}

	const rate = useCallback(
		async (rating: ReviewRating) => {
			if (!current || saving) return;
			setSaving(true);
			setSaveError(false);
			try {
				const res = await fetch("/api/review", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ id: reviewId(), nodeId: current.nodeId, rating }),
				});
				if (!res.ok) throw new Error(String(res.status));
				setRevealed(false);
				await load();
			} catch {
				setSaveError(true);
			} finally {
				setSaving(false);
			}
		},
		[current, saving, load],
	);

	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (!current || e.metaKey || e.ctrlKey || e.altKey || isTypingTarget(e.target)) return;
			if (!revealed && (e.key === " " || e.key === "Enter")) {
				e.preventDefault();
				setRevealed(true);
				return;
			}
			if (revealed && ["1", "2", "3", "4"].includes(e.key)) {
				e.preventDefault();
				void rate(Number(e.key) as ReviewRating);
			}
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [current, revealed, rate]);

	if (loadError && !view) {
		return (
			<p className="p-8 text-sm text-muted-foreground" data-testid="review-load-error">
				Could not load the review queue. Try again in a moment.
			</p>
		);
	}
	if (!view) return <p className="p-8 text-sm text-muted-foreground" data-testid="review-loading">Loading reviews…</p>;

	const { stats, retention } = view;
	const retentionLine = retention
		? `Retention, last 30 days: ${Math.round((retention.recalled / retention.total) * 100)}% of ${retention.total} scheduled reviews`
		: "Retention: not enough scheduled reviews yet";

	return (
		<div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-6 py-10" data-testid="review-session">
			<header className="flex flex-col gap-1">
				<h1 className="text-lg font-medium">Review</h1>
				<p className="text-xs text-muted-foreground" data-testid="review-counts">
					{view.items.length} due · {stats.newLeft} new left today
				</p>
				<p className="text-xs text-muted-foreground" data-testid="review-retention">{retentionLine}</p>
			</header>

			{!current ? (
				<div className="flex flex-col gap-1" data-testid="review-empty">
					<p className="text-sm">Nothing due right now.</p>
					{stats.nextDueAt && (
						<p className="text-xs text-muted-foreground">Next card due in {formatInterval(view.now, stats.nextDueAt)}.</p>
					)}
				</div>
			) : (
				<section className="flex flex-col gap-4 rounded-lg border p-5" data-testid="review-card">
					<span className="text-xs uppercase tracking-wider text-muted-foreground" data-testid="review-format">
						{FORMAT_LABEL[current.question.format]}
					</span>
					<p className="whitespace-pre-wrap text-base leading-relaxed" data-testid="review-prompt">
						{current.question.prompt}
					</p>
					{!revealed ? (
						<Button type="button" variant="outline" className="self-start" data-testid="review-reveal" onClick={() => setRevealed(true)}>
							Reveal (Space)
						</Button>
					) : (
						<>
							<p className="whitespace-pre-wrap border-t pt-4 text-base leading-relaxed" data-testid="review-answer">
								{current.question.answer}
							</p>
							<div className="flex flex-wrap gap-2" role="group" aria-label="Rate your recall">
								{RATINGS.map(({ rating, label }) => (
									<Button
										key={rating}
										type="button"
										variant="outline"
										disabled={saving}
										data-testid={`review-rate-${rating}`}
										onClick={() => void rate(rating)}
									>
										<kbd className="text-xs text-muted-foreground">{rating}</kbd>
										{label} · {formatInterval(view.now, current.previews[rating])}
									</Button>
								))}
							</div>
						</>
					)}
					{saveError && (
						<p className="text-xs text-destructive" data-testid="review-save-error">
							Could not save the rating. Try again.
						</p>
					)}
				</section>
			)}
		</div>
	);
}
