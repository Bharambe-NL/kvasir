/**
 * The citation views (Kvasir P2-4, D077, D078): a node's citations as the
 * chip and the side panel show them, with each cited unit's full text read
 * from the version's stored units (D076). A pure read of the graph store.
 */

import { citationLabel, sourceDocuments, versionLabel, type CitationView } from "../core/sources.ts";
import type { SourceUnit } from "../core/contracts.ts";
import { stores } from "./stores.ts";

export type { CitationView };

/** Every citation of the given nodes, grouped by node id, in citation
 *  order. Nodes without citations are absent. */
export function citationViews(nodeIds: readonly string[]): Record<string, CitationView[]> {
	const wanted = new Set(nodeIds);
	const versions = stores.graphStore.readDocumentVersions();
	const byVersion = new Map(versions.map((v) => [v.versionId, v]));
	const titleOf = new Map(sourceDocuments(versions).map((d) => [d.id, d.title]));
	const units = new Map<string, Map<string, SourceUnit> | null>();
	const unitsOf = (versionId: string) => {
		if (!units.has(versionId)) {
			const list = stores.graphStore.readDocumentUnits(versionId);
			units.set(versionId, list ? new Map(list.map((u) => [u.path.join("\u0000"), u])) : null);
		}
		return units.get(versionId)!;
	};
	const out: Record<string, CitationView[]> = {};
	const seen = new Set<string>();
	for (const c of stores.graphStore.readCitations()) {
		if (!wanted.has(c.nodeId) || seen.has(c.id)) continue;
		seen.add(c.id);
		const version = byVersion.get(c.version);
		if (!version) continue;
		const unit = unitsOf(c.version)?.get(c.path.join("\u0000")) ?? null;
		(out[c.nodeId] ??= []).push({
			id: c.id,
			nodeId: c.nodeId,
			label: citationLabel(version, c.path),
			documentTitle: titleOf.get(version.sourceId) ?? version.title,
			versionLabel: versionLabel(version),
			path: [...c.path],
			...(unit?.heading ? { heading: unit.heading } : {}),
			quote: c.quote,
			unitText: unit ? unit.text : null,
		});
	}
	return out;
}
