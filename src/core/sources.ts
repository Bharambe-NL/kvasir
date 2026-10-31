/**
 * Pure reader-side helpers over the sources ledgers (Kvasir P2): group
 * document versions into documents, find a node's citations, label a
 * version. The store never decides: it returns raw lines in append order.
 * Browser-safe (no node builtins); the id functions live in
 * core/source-ids.ts because they hash.
 */

import type { Citation, DocumentVersion, SourceDocument } from "./contracts/sources.ts";

/** Every document, oldest first by its first version, each with its
 *  versions in order (EUR-Lex by consolidation date, others by import time;
 *  ties by import time). A repeated versionId counts once: the first line
 *  wins. */
export function sourceDocuments(lines: readonly DocumentVersion[]): SourceDocument[] {
	const seen = new Set<string>();
	const bySource = new Map<string, DocumentVersion[]>();
	for (const line of lines) {
		if (seen.has(line.versionId)) continue;
		seen.add(line.versionId);
		const list = bySource.get(line.sourceId);
		if (list) list.push(line);
		else bySource.set(line.sourceId, [line]);
	}
	const docs: SourceDocument[] = [];
	for (const [id, versions] of bySource) {
		versions.sort((a, b) => versionTime(a) - versionTime(b) || Date.parse(a.importedAt) - Date.parse(b.importedAt));
		const latest = versions[versions.length - 1]!;
		docs.push({
			id,
			format: latest.format,
			title: latest.title,
			...(latest.celex ? { celex: latest.celex } : {}),
			versions,
		});
	}
	return docs.sort((a, b) => Date.parse(a.versions[0]!.importedAt) - Date.parse(b.versions[0]!.importedAt) || (a.id < b.id ? -1 : 1));
}

function versionTime(v: DocumentVersion): number {
	return Date.parse(v.consolidatedAt ?? v.importedAt);
}

/** A node's citations in append order, a repeated id counted once.
 *  Citations of nodes that no longer exist are simply never asked for. */
export function citationsFor(nodeId: string, citations: readonly Citation[]): Citation[] {
	const seen = new Set<string>();
	const out: Citation[] = [];
	for (const c of citations) {
		if (c.nodeId !== nodeId || seen.has(c.id)) continue;
		seen.add(c.id);
		out.push(c);
	}
	return out;
}

/** How a version is named to Sagar (D060): the consolidation date for
 *  EUR-Lex, the given label otherwise. */
export function versionLabel(v: Pick<DocumentVersion, "consolidatedAt" | "label" | "versionId">): string {
	return v.consolidatedAt ?? v.label ?? v.versionId;
}
