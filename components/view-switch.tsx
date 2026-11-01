"use client";

/**
 * The Graph and Chains switch (Kvasir P7-5): one segmented control in the
 * graph's top bar and in the chain table's header, so the two views read
 * as two sides of one place. The current side is pressed.
 */

import { ListTreeIcon, WaypointsIcon } from "lucide-react";

const SEGMENT = "flex h-7 items-center gap-1.5 rounded-lg px-2.5 text-xs transition-colors";

export function ViewSwitch({ value, onGraph, onChains }: { value: "graph" | "chains"; onGraph: () => void; onChains: () => void }) {
	const segment = (side: "graph" | "chains") =>
		`${SEGMENT} ${value === side ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"}`;
	return (
		<div role="group" aria-label="View" className="lh-no-drag flex shrink-0 items-center gap-0.5 rounded-xl border bg-card/85 px-1 py-[3px] shadow-lg backdrop-blur">
			<button type="button" aria-pressed={value === "graph"} onClick={onGraph} data-testid="view-switch-graph" className={segment("graph")}>
				<WaypointsIcon className="size-3" />
				Graph
			</button>
			<button type="button" aria-pressed={value === "chains"} onClick={onChains} data-testid="open-chain-table" className={segment("chains")}>
				<ListTreeIcon className="size-3" />
				Chains
			</button>
		</div>
	);
}
