"use client";

/**
 * The graph toolbar's Export menu (Kvasir P6-3, D100, D105): Obsidian vault
 * or Anki deck, written by POST /api/graph/export into a new dated folder.
 * The done line shows where, with Show in Finder when the desktop bridge is
 * there. `ExportMenuView` is presentational so tests render each state.
 */

import { useEffect, useRef, useState } from "react";
import { Hint } from "@/components/ui/hint";

const PILL = "graph-chrome-fade-in relative shrink-0 rounded-xl border bg-card/85 px-1 py-[3px] shadow-lg backdrop-blur";
const BUTTON = "flex h-7 items-center gap-1.5 rounded-lg px-2.5 text-xs text-muted-foreground transition-colors hover:bg-accent";
const ITEM = "flex w-full items-center rounded-lg px-2.5 py-1.5 text-left text-xs text-foreground transition-colors hover:bg-accent disabled:opacity-50";

export type ExportKind = "obsidian" | "anki";

export type ExportState =
	| { status: "idle" }
	| { status: "exporting"; kind: ExportKind }
	| { status: "done"; kind: ExportKind; path: string; display: string; propositions: number }
	| { status: "error"; message: string };

export function ExportMenuView({
	open,
	onToggle,
	state,
	onExport,
	onReveal,
}: {
	open: boolean;
	onToggle: () => void;
	state: ExportState;
	onExport: (kind: ExportKind) => void;
	/** Absent outside the desktop app: no Show in Finder button. */
	onReveal?: (path: string) => void;
}) {
	const busy = state.status === "exporting";
	return (
		<div className={PILL}>
			<Hint label="Export the graph" side="bottom">
				<button type="button" aria-expanded={open} aria-haspopup="menu" onClick={onToggle} data-testid="graph-export-button" className={`${BUTTON} ${open ? "bg-accent text-foreground" : ""}`}>
					Export
				</button>
			</Hint>
			{open && (
				<div role="menu" data-testid="graph-export-menu" className="absolute right-0 top-full z-20 mt-2 w-72 rounded-xl border bg-card p-1 shadow-lg">
					<button type="button" role="menuitem" disabled={busy} onClick={() => onExport("obsidian")} className={ITEM}>
						Obsidian vault
					</button>
					<button type="button" role="menuitem" disabled={busy} onClick={() => onExport("anki")} className={ITEM}>
						Anki deck
					</button>
					{state.status !== "idle" && (
						<div className="mt-1 border-t px-2.5 pb-1.5 pt-2 text-xs text-muted-foreground" data-testid="graph-export-status" aria-live="polite">
							{state.status === "exporting" && "Exporting..."}
							{state.status === "error" && `Export failed: ${state.message}`}
							{state.status === "done" && (
								<>
									<p className="break-words">
										Exported {state.propositions} propositions to {state.display}/
									</p>
									{state.kind === "anki" && <p className="mt-1">Import it in Anki with File &gt; Import.</p>}
									{onReveal && (
										<button type="button" onClick={() => onReveal(state.path)} className={`${BUTTON} mt-1.5 -ml-2.5 text-foreground`}>
											Show in Finder
										</button>
									)}
								</>
							)}
						</div>
					)}
				</div>
			)}
		</div>
	);
}

/** The menu with its state, the request and the desktop bridge. */
export function GraphExportMenu() {
	const [open, setOpen] = useState(false);
	const [state, setState] = useState<ExportState>({ status: "idle" });
	const ref = useRef<HTMLDivElement>(null);
	const [reveal, setReveal] = useState<((path: string) => void) | undefined>(undefined);
	useEffect(() => {
		const bridge = window.lh?.revealExport;
		if (bridge) setReveal(() => (p: string) => void bridge(p));
	}, []);
	useEffect(() => {
		if (!open) return;
		const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
		const onDown = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
		window.addEventListener("keydown", onKey);
		window.addEventListener("mousedown", onDown);
		return () => {
			window.removeEventListener("keydown", onKey);
			window.removeEventListener("mousedown", onDown);
		};
	}, [open]);
	const onExport = async (kind: ExportKind) => {
		setState({ status: "exporting", kind });
		try {
			const res = await fetch("/api/graph/export", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind }) });
			const body = await res.json();
			if (!res.ok) throw new Error(typeof body?.error === "string" ? body.error : `HTTP ${res.status}`);
			setState({ status: "done", kind, path: body.path, display: body.display, propositions: body.propositions });
		} catch (err) {
			setState({ status: "error", message: err instanceof Error ? err.message : String(err) });
		}
	};
	return (
		<div ref={ref}>
			<ExportMenuView open={open} onToggle={() => setOpen((o) => !o)} state={state} onExport={onExport} onReveal={reveal} />
		</div>
	);
}
