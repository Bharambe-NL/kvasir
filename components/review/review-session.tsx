"use client";

/**
 * The review session (P1-5, the Memory system's page). One card at a time:
 * read the cue or scenario, think, reveal with Space or Enter, rate with 1
 * to 4 (Again, Hard, Good, Easy). The next card follows. Fully keyboard
 * driven (D044): no typed answers. Refetches on "reviews-changed", so a
 * question generated in the background replaces the name fallback (D042).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
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

/** The prompt as shown: a fallback card's "Recall: " prefix repeats the
 *  card's kind label above it, so the label carries it (Kvasir P7-5). */
export function displayPrompt(question: { format: keyof typeof FORMAT_LABEL; prompt: string }): string {
	return question.format === "fallback" ? question.prompt.replace(/^Recall:\s*/, "") : question.prompt;
}

/** "Recall · 3 of 80": the card's kind and its place in this visit. */
export function positionLabel(format: keyof typeof FORMAT_LABEL, rated: number, due: number): string {
	return `${FORMAT_LABEL[format]} · ${rated + 1} of ${rated + due}`;
}

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
	// Cards rated on this visit: with the cards still due, the visit's size.
	const [rated, setRated] = useState(0);
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
				setRated((n) => n + 1);
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

	const due = view.items.length;
	const total = rated + due;

	return (
		<div className="mx-auto flex w-full max-w-[40rem] flex-col gap-8 px-6 pb-12 pt-[16vh]" data-testid="review-session">
			<header className="flex flex-col gap-1.5">
				<h1 className="font-title text-page tracking-tight">Review</h1>
				<p className="text-sm text-muted-foreground" data-testid="review-counts">
					<span className="tabular-nums">{due}</span> due · <span className="tabular-nums">{stats.newLeft}</span> new left today
				</p>
				<p className="text-sm text-muted-foreground" data-testid="review-retention">{retentionLine}</p>
			</header>

			{!current ? (
				stats.nextDueAt ? (
					<div className="lh-fade-in flex flex-col items-start gap-3 rounded-xl border bg-card p-8" data-testid="review-empty">
						<p className="font-title text-title tracking-tight">All caught up.</p>
						<p className="text-base text-muted-foreground" data-testid="review-next">
							Next review in {formatInterval(view.now, stats.nextDueAt)}
						</p>
						<Button asChild variant="outline" className="mt-2">
							<Link href="/chat/new?mode=practice" data-testid="review-practise">Practise instead</Link>
						</Button>
					</div>
				) : (
					<div className="lh-fade-in flex flex-col gap-2 rounded-xl border bg-card p-8" data-testid="review-empty">
						<p className="text-base text-muted-foreground">Nothing to review yet. Teach a session and its ideas come back here.</p>
					</div>
				)
			) : (
				<section key={current.nodeId} className="lh-rise-in relative flex flex-col gap-6 overflow-hidden rounded-xl border bg-card px-8 pb-8 pt-9" data-testid="review-card">
					<div className="absolute inset-x-0 top-0 h-1 bg-muted" aria-hidden="true">
						<div className="h-full bg-highlight transition-[width] duration-200" style={{ width: `${(rated / Math.max(total, 1)) * 100}%` }} data-testid="review-progress" />
					</div>
					<span className="text-xs uppercase tracking-wider text-muted-foreground" data-testid="review-format">
						{positionLabel(current.question.format, rated, due)}
					</span>
					<p className="lh-prose whitespace-pre-wrap text-foreground" data-testid="review-prompt">
						{displayPrompt(current.question)}
					</p>
					{!revealed ? (
						<Button type="button" variant="outline" className="self-start" data-testid="review-reveal" onClick={() => setRevealed(true)}>
							Reveal <kbd className="text-xs text-muted-foreground">Space</kbd>
						</Button>
					) : (
						<>
							<p className="lh-fade-in lh-prose whitespace-pre-wrap border-t pt-6 text-foreground" data-testid="review-answer">
								{current.question.answer}
							</p>
							<div className="lh-fade-in flex flex-wrap gap-2" role="group" aria-label="Rate your recall">
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
