"use client";

/**
 * Home signals (P1-6): the review summary (due count and recall chance per
 * reviewed card) and the remembered retention-overlay switch. The summary
 * refetches on "reviews-changed" and on every events reconnect.
 */

import { useCallback, useEffect, useState } from "react";
import type { ReviewSummary } from "@/src/core";
import { useServerEvent, useServerResync } from "@/components/server-events";

export function useReviewSummary(): ReviewSummary | null {
	const [summary, setSummary] = useState<ReviewSummary | null>(null);
	const load = useCallback(async () => {
		try {
			const res = await fetch("/api/review/summary", { cache: "no-store" });
			if (res.ok) setSummary((await res.json()) as ReviewSummary);
		} catch {
			// best-effort: the signals simply stay as they were
		}
	}, []);
	useEffect(() => {
		void load();
	}, [load]);
	useServerEvent("reviews-changed", () => void load());
	useServerResync(() => void load());
	return summary;
}

/** The overlay switch's local-storage key (D047): per window, never in
 *  data/graph/. */
export const RETENTION_OVERLAY_KEY = "kv.retentionOverlay";

/** The retention overlay switch: off by default, remembered in this
 *  window's local storage (D047). */
export function useRetentionOverlay(): [boolean, (on: boolean) => void] {
	const [on, setOn] = useState(false);
	useEffect(() => {
		try {
			setOn(localStorage.getItem(RETENTION_OVERLAY_KEY) === "on");
		} catch {
			// storage unavailable: stay off
		}
	}, []);
	const change = useCallback((next: boolean) => {
		setOn(next);
		try {
			localStorage.setItem(RETENTION_OVERLAY_KEY, next ? "on" : "off");
		} catch {
			// best-effort
		}
	}, []);
	return [on, change];
}
