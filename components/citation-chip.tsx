"use client";
/**
 * Citations in the UI (Kvasir P2-4, D077, D078): the chip on a cited
 * proposition and the right-side panel that shows its source unit with the
 * quote highlighted. The chip's labels come from the graph snapshot (or, in
 * a transcript, from GET /api/graph/citations); the panel fetches the full
 * views, unit text included, when it opens.
 */
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { FileTextIcon, XIcon } from "lucide-react";
import { chipText, type CitationView } from "@/src/core";

export function CitationChip({
	labels,
	onOpen,
	outdated = false,
	testid = "citation-chip",
}: {
	labels: readonly string[] | undefined;
	onOpen: () => void;
	/** Kvasir P2-5 (D083): a newer version dropped a cited quote. */
	outdated?: boolean;
	testid?: string;
}) {
	if (!labels || labels.length === 0) return null;
	return (
		<button
			type="button"
			data-testid={testid}
			title="Open the source"
			onClick={(e) => {
				e.stopPropagation();
				onOpen();
			}}
			className="inline-flex max-w-full cursor-pointer items-center gap-1 rounded-md border border-border/70 px-1.5 py-0.5 text-[11px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
		>
			<FileTextIcon aria-hidden="true" className="size-3 shrink-0" />
			<span className="truncate">{chipText(labels)}</span>
			{outdated && (
				<span data-testid="citation-outdated" className="shrink-0 rounded-sm bg-amber-400/15 px-1 text-[10px] font-medium text-amber-500">
					Outdated
				</span>
			)}
		</button>
	);
}

/** The unit text with every occurrence of the quote marked. */
export function highlight(text: string, quote: string): ReactNode[] {
	if (!quote) return [text];
	const out: ReactNode[] = [];
	let from = 0;
	for (let at = text.indexOf(quote); at >= 0; at = text.indexOf(quote, from)) {
		if (at > from) out.push(text.slice(from, at));
		out.push(<mark key={at} className="rounded-sm bg-amber-300/30 px-0.5 text-foreground">{quote}</mark>);
		from = at + quote.length;
	}
	if (from < text.length) out.push(text.slice(from));
	return out;
}

export function CitationPanel({ views, onClose }: { views: readonly CitationView[]; onClose: () => void }) {
	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (e.key !== "Escape") return;
			e.stopPropagation();
			onClose();
		};
		window.addEventListener("keydown", onKey, true);
		return () => window.removeEventListener("keydown", onKey, true);
	}, [onClose]);
	if (views.length === 0 || typeof document === "undefined") return null;
	return createPortal(
		<aside
			role="dialog"
			aria-label={views[0]!.documentTitle}
			data-testid="citation-panel"
			className="lh-no-drag fixed inset-y-0 right-0 z-40 flex w-[28rem] max-w-full flex-col border-l bg-card shadow-xl"
		>
			<div className="flex items-start gap-2 border-b px-4 py-3">
				<div className="min-w-0 flex-1 text-sm font-medium leading-snug">{views[0]!.documentTitle}</div>
				<button type="button" aria-label="Close source" data-testid="citation-close" onClick={onClose} className="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground">
					<XIcon className="size-4" />
				</button>
			</div>
			<div className="flex-1 overflow-y-auto px-4 py-3">
				{views.map((v, i) => (
					<section key={v.id} data-testid="citation-view" className={i > 0 ? "mt-4 border-t border-border/60 pt-4" : ""}>
						{i > 0 && v.documentTitle !== views[0]!.documentTitle && <div className="mb-1 text-sm font-medium">{v.documentTitle}</div>}
						<div className="text-xs text-muted-foreground">Version {v.versionLabel}</div>
						<div className="mt-1 text-xs text-foreground/80">{v.path.join(" > ")}</div>
						{v.heading && <div className="mt-1 text-sm font-medium">{v.heading}</div>}
						{v.unitText !== null ? (
							<p data-testid="citation-unit-text" className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">
								{highlight(v.unitText, v.quote)}
							</p>
						) : (
							<>
								<p className="mt-2 text-sm leading-relaxed">
									<mark className="rounded-sm bg-amber-300/30 px-0.5">{v.quote}</mark>
								</p>
								<p className="mt-1 text-xs text-muted-foreground">The source text for this version is not stored.</p>
							</>
						)}
						{v.outdated && (
							<div data-testid="citation-outdated-note" className="mt-3 rounded-md border border-amber-400/40 bg-amber-400/5 px-3 py-2">
								<div className="text-xs font-medium text-amber-500">
									{v.outdated.kind === "changed" ? `Changed in version ${v.outdated.versionLabel}` : `Removed in version ${v.outdated.versionLabel}`}
								</div>
								{v.outdated.text !== undefined && <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed">{v.outdated.text}</p>}
							</div>
						)}
					</section>
				))}
			</div>
		</aside>,
		document.body,
	);
}

async function fetchViews(nodeIds: readonly string[]): Promise<Record<string, CitationView[]>> {
	const res = await fetch(`/api/graph/citations?nodeIds=${encodeURIComponent(nodeIds.join(","))}`, { cache: "no-store" });
	if (!res.ok) throw new Error(`citations failed: ${res.status}`);
	return (await res.json()) as Record<string, CitationView[]>;
}

/** Open the panel for one proposition; render `panel` anywhere. */
export function useCitationPanel(): { open: (nodeId: string) => void; panel: ReactNode } {
	const [views, setViews] = useState<CitationView[]>([]);
	const close = useCallback(() => setViews([]), []);
	const open = useCallback((nodeId: string) => {
		fetchViews([nodeId])
			.then((byNode) => setViews(byNode[nodeId] ?? []))
			.catch((err) => console.error("citation panel failed:", err));
	}, []);
	return { open, panel: <CitationPanel views={views} onClose={close} /> };
}

/** Chip labels for a list of propositions (the transcript's graph context
 *  card, which has no snapshot), fetched once while `enabled`, with the
 *  nodes that have an outdated citation (Kvasir P2-5). */
export function useCitationLabels(nodeIds: readonly string[], enabled: boolean): { labels: Record<string, string[]>; outdated: ReadonlySet<string> } {
	const [state, setState] = useState<{ labels: Record<string, string[]>; outdated: ReadonlySet<string> }>({ labels: {}, outdated: new Set() });
	const key = nodeIds.join(",");
	useEffect(() => {
		if (!enabled || !key) return;
		let live = true;
		fetchViews(key.split(","))
			.then((byNode) => {
				if (!live) return;
				setState({
					labels: Object.fromEntries(Object.entries(byNode).map(([id, vs]) => [id, vs.map((v) => v.label)])),
					outdated: new Set(Object.entries(byNode).filter(([, vs]) => vs.some((v) => v.outdated)).map(([id]) => id)),
				});
			})
			.catch(() => {});
		return () => {
			live = false;
		};
	}, [key, enabled]);
	return state;
}
