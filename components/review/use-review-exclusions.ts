"use client";

/**
 * The review opt-out (P1-8, D053 to D056): which birth sessions are out of
 * review, and the toggle the Chains table and the sidebar menu share. The
 * list refetches on "reviews-changed" and on every events reconnect.
 */

import { useCallback, useEffect, useState } from "react";
import type { ReviewExclusionsView } from "@/src/core";
import { useServerEvent, useServerResync } from "@/components/server-events";

/** The control's wording (D056). */
export const EXCLUDE_LABEL = "Exclude from review";
export const INCLUDE_LABEL = "Include in review";
export const EXCLUDED_TAG = "Not in review";

export interface ReviewExclusions {
	excluded: ReadonlySet<string>;
	setExcluded: (sessionId: string, excluded: boolean) => Promise<void>;
}

export function useReviewExclusions(): ReviewExclusions {
	const [excluded, setList] = useState<ReadonlySet<string>>(() => new Set());
	const load = useCallback(async () => {
		try {
			const res = await fetch("/api/review/exclusions", { cache: "no-store" });
			if (res.ok) setList(new Set(((await res.json()) as ReviewExclusionsView).excluded));
		} catch {
			// best-effort: the list stays as it was
		}
	}, []);
	useEffect(() => {
		void load();
	}, [load]);
	useServerEvent("reviews-changed", () => void load());
	useServerResync(() => void load());

	const setExcluded = useCallback(
		async (sessionId: string, next: boolean) => {
			try {
				const res = await fetch("/api/review/exclusions", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ sessionId, excluded: next }),
				});
				if (!res.ok) throw new Error(`exclusion failed: ${res.status}`);
				setList((prev) => {
					const out = new Set(prev);
					if (next) out.add(sessionId);
					else out.delete(sessionId);
					return out;
				});
			} catch (err) {
				console.error("review exclusion failed:", err);
				void load();
			}
		},
		[load],
	);
	return { excluded, setExcluded };
}
