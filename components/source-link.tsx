"use client";
/**
 * Citation links in lessons (Kvasir P2-6, D084). A rehype step, run after
 * Streamdown's own sanitising and hardening, turns only `#src-ver_…-U412`
 * links into a `kv-source-cite` element; the markdown components map
 * renders that as the citation chip, and a click opens the source panel on
 * the unit (GET /api/graph/source-unit). Every other link is untouched, so
 * Streamdown's link handling (its safety prompt) stays as it is. A link
 * that does not resolve shows as plain text.
 */
import { useState, type ReactNode } from "react";
import { defaultRehypePlugins } from "streamdown";
import { parseSourceRef, type CitationView, type SourceUnitView } from "@/src/core";
import { CitationChip, CitationPanel } from "@/components/citation-chip";

interface HastNode {
	type: string;
	tagName?: string;
	properties?: Record<string, unknown>;
	children?: HastNode[];
}

const textOf = (n: HastNode): string =>
	n.type === "text" ? String((n as unknown as { value: string }).value) : (n.children ?? []).map(textOf).join("");

/** The rehype step: `a[href=#src-…]` becomes `kv-source-cite`. */
export function rehypeSourceCite() {
	return (tree: HastNode) => {
		const walk = (node: HastNode) => {
			for (const child of node.children ?? []) {
				if (child.type === "element" && child.tagName === "a") {
					const ref = parseSourceRef(typeof child.properties?.href === "string" ? child.properties.href : null);
					if (ref) {
						child.tagName = "kv-source-cite";
						child.properties = { dataRef: `${ref.versionId}-${ref.label}`, dataLabel: textOf(child) };
						continue;
					}
				}
				walk(child);
			}
		};
		walk(tree);
	};
}

/** Streamdown's default rehype steps, then the citation step. */
export const lessonRehypePlugins = [...Object.values(defaultRehypePlugins), rehypeSourceCite];

/** The chip for one lesson citation; opens the panel on its unit. */
export function SourceCite({ "data-ref": ref, "data-label": label, children }: { "data-ref"?: string; "data-label"?: string; children?: ReactNode }) {
	const [views, setViews] = useState<CitationView[]>([]);
	const [missing, setMissing] = useState(false);
	if (!ref || missing) return <>{children}</>;
	const open = () => {
		fetch(`/api/graph/source-unit?ref=${encodeURIComponent(ref)}`, { cache: "no-store" })
			.then(async (res) => {
				if (!res.ok) {
					setMissing(true);
					return;
				}
				const v = (await res.json()) as SourceUnitView;
				setViews([{ id: ref, nodeId: "", label: v.label, documentTitle: v.documentTitle, versionLabel: v.versionLabel, path: v.path, ...(v.heading ? { heading: v.heading } : {}), quote: "", unitText: v.unitText, ...(v.outdated ? { outdated: v.outdated } : {}) }]);
			})
			.catch(() => setMissing(true));
	};
	return (
		<>
			<CitationChip labels={[label || ref]} onOpen={open} testid="source-cite" />
			<CitationPanel views={views} onClose={() => setViews([])} />
		</>
	);
}
