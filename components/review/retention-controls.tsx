"use client";

/**
 * Home signals (P1-6): the "{n} due" chip that opens the review page (D048)
 * and the "Retention" overlay toggle with its legend (D046, D047). Pure
 * presentational components: state and navigation arrive as props, so they
 * render the same in the graph toolbar, the minimal home and tests.
 */

import { HEAT_COLORS } from "@/components/graph-canvas";
import { Hint } from "@/components/ui/hint";

const PILL = "graph-chrome-fade-in shrink-0 rounded-xl border bg-card/85 px-1 py-[3px] shadow-lg backdrop-blur";
const BUTTON = "flex h-7 items-center gap-1.5 rounded-lg px-2.5 text-xs text-muted-foreground transition-colors hover:bg-accent";

/** "{n} due", opening /review. Hidden when nothing is due (D048). A count
 *  you can follow, not another pill (Kvasir P7-5). */
export function DueChip({ due, onOpen }: { due: number; onOpen: () => void }) {
	if (due <= 0) return null;
	return (
		<div className="graph-chrome-fade-in flex h-[36px] shrink-0 items-center">
			<Hint label="Open spaced review" side="bottom">
				<button
					type="button"
					onClick={onOpen}
					data-testid="review-due-chip"
					className="rounded-md px-1.5 py-1 text-xs text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
				>
					<span className="tabular-nums font-semibold text-highlight">{due}</span> due
				</button>
			</Hint>
		</div>
	);
}

const LEGEND: { band: keyof typeof HEAT_COLORS; label: string }[] = [
	{ band: "high", label: "Strong ≥ 90%" },
	{ band: "mid", label: "Fading 70 to 90%" },
	{ band: "low", label: "Slipping < 70%" },
];

/** The overlay toggle (off by default, D047) and, while on, the legend. */
export function RetentionToggle({ on, onChange }: { on: boolean; onChange: (on: boolean) => void }) {
	return (
		<div className={`${PILL} flex items-center`}>
			<Hint label="Show retention heat on the graph" side="bottom">
				<button
					type="button"
					aria-pressed={on}
					aria-label="Show retention heat on the graph"
					onClick={() => onChange(!on)}
					data-testid="retention-toggle"
					className={`${BUTTON} ${on ? "bg-accent text-foreground" : ""}`}
				>
					Retention
				</button>
			</Hint>
			{on && (
				<div className="flex items-center gap-2.5 pl-1 pr-2" data-testid="retention-legend">
					{LEGEND.map(({ band, label }) => (
						<span key={band} className="flex items-center gap-1 text-[11px] text-muted-foreground">
							<span aria-hidden className="inline-block size-2 rounded-full" style={{ backgroundColor: HEAT_COLORS[band] }} />
							{label}
						</span>
					))}
				</div>
			)}
		</div>
	);
}
