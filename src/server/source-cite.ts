/**
 * The server side of lesson citations (Kvasir P2-6, D084, D085): resolve a
 * `#src-` link to its unit for the panel, and the source lines a cited
 * proposition gets in a session's graph-context marker. Pure reads of the
 * graph store.
 */

import type { DocumentVersion, SourceUnit } from "../core/contracts.ts";
import { labelUnits } from "../core/source-extract.ts";
import { citationStatus } from "../core/source-diff.ts";
import { sourceLink, type SourceRef, type SourceUnitView } from "../core/source-cite.ts";
import { citationLabel, sourceDocuments, versionLabel } from "../core/sources.ts";
import { stores } from "./stores.ts";

export type { SourceUnitView };

/** Unit label ("U412") of each path in a version, from its stored units. */
export function labelsOf(units: readonly SourceUnit[]): Map<string, string> {
	const out = new Map<string, string>();
	for (const l of labelUnits(units)) if (l.label) out.set(l.unit.path.join("\u0000"), l.label);
	return out;
}

/** The unit a lesson link points at, or null when the version, its units
 *  or the label are unknown. */
export function sourceUnitView(ref: SourceRef): SourceUnitView | null {
	const versions = stores.graphStore.readDocumentVersions();
	const version = versions.find((v) => v.versionId === ref.versionId);
	if (!version) return null;
	const units = stores.graphStore.readDocumentUnits(version.versionId);
	if (!units) return null;
	const unit = labelUnits(units).find((l) => l.label === ref.label)?.unit;
	if (!unit) return null;
	const doc = sourceDocuments(versions).find((d) => d.id === version.sourceId)!;
	const status = citationStatus({ version: version.versionId, path: unit.path, quote: unit.text }, doc.versions, (v) => stores.graphStore.readDocumentUnits(v));
	return {
		label: citationLabel(version, unit.path),
		documentTitle: doc.title,
		versionLabel: versionLabel(version),
		path: [...unit.path],
		...(unit.heading ? { heading: unit.heading } : {}),
		unitText: unit.text,
		...(status ? { outdated: { versionLabel: status.versionLabel, kind: status.kind, ...(status.text !== undefined ? { text: status.text } : {}) } } : {}),
	};
}

/** For each cited node, its marker lines: one per citation, the link and
 *  the quote (D085). Citations whose version units are missing get the
 *  label without a link. */
export function citationSourceLines(nodeIds: readonly string[]): Map<string, string[]> {
	const wanted = new Set(nodeIds);
	const byVersion = new Map<string, DocumentVersion>(stores.graphStore.readDocumentVersions().map((v) => [v.versionId, v]));
	const labelsByVersion = new Map<string, Map<string, string> | null>();
	const out = new Map<string, string[]>();
	const seen = new Set<string>();
	for (const c of stores.graphStore.readCitations()) {
		if (!wanted.has(c.nodeId) || seen.has(c.id)) continue;
		seen.add(c.id);
		const version = byVersion.get(c.version);
		if (!version) continue;
		if (!labelsByVersion.has(c.version)) {
			const units = stores.graphStore.readDocumentUnits(c.version);
			labelsByVersion.set(c.version, units ? labelsOf(units) : null);
		}
		const text = citationLabel(version, c.path);
		const unitLabel = labelsByVersion.get(c.version)?.get(c.path.join("\u0000"));
		const link = unitLabel ? sourceLink(text, c.version, unitLabel) : text;
		const lines = out.get(c.nodeId) ?? [];
		lines.push(`source: ${link} "${c.quote}"`);
		out.set(c.nodeId, lines);
	}
	return out;
}
