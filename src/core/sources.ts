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

/** A citation as the chip and panel show it (Kvasir P2-4, D077, D078). */
export interface CitationView {
	id: string;
	nodeId: string;
	/** The chip's short form, for example "Regulation (EU) 2022/2554, Art. 28(2)(a)". */
	label: string;
	documentTitle: string;
	versionLabel: string;
	path: string[];
	heading?: string;
	quote: string;
	/** The cited unit's full text; null when the version's units are not stored. */
	unitText: string | null;
	/** Kvasir P2-5 (D080, D083): present when a newer version dropped the unit
	 *  or the quote: the first such version, and its text for the unit. */
	outdated?: { versionLabel: string; kind: "removed" | "changed"; text?: string };
}

/** A document's short name (D077): the act's type and number for EUR-Lex
 *  ("Regulation (EU) 2022/2554", "Commission Delegated Regulation (EU)
 *  2024/1772"), the version label without a file extension otherwise. */
export function documentShortName(version: Pick<DocumentVersion, "format" | "title" | "label">): string {
	if (version.format === "eurlex-html") {
		const m = /\b((?:(?:COMMISSION|COUNCIL)\s+)?(?:(?:DELEGATED|IMPLEMENTING)\s+)?(?:REGULATION|DIRECTIVE|DECISION))\s+(\((?:EU|EC|EU, Euratom)\))\s+(?:No\s+)?(\d+\/\d+)/i.exec(version.title);
		if (m) return `${titleCase(m[1]!)} ${m[2]} ${m[3]}`;
		return version.title.length > 40 ? `${version.title.slice(0, 40).trimEnd()}…` : version.title;
	}
	return (version.label ?? version.title).replace(/\.(pdf|md|markdown)$/i, "");
}

function titleCase(s: string): string {
	return s.toLowerCase().replace(/\s+/g, " ").replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

/** A unit address in the short form (D077): "Art. 28(2)(a)", "Recital 12",
 *  "Annex I, point 3(a)", "3.3.3 para 17", "p. 1 para 2", "Risk appetite para 3". */
export function shortPath(format: DocumentVersion["format"], path: readonly string[]): string {
	const sub = (segs: readonly string[]) =>
		segs
			.map((s) => {
				const para = /^paragraph (\S+)$/.exec(s);
				if (para) return `(${para[1]})`;
				const point = /^point (\S+)$/.exec(s);
				if (point) return point[1]!.startsWith("(") ? point[1] : `(${point[1]})`;
				const indent = /^indent (\d+)$/.exec(s);
				if (indent) return ` indent ${indent[1]}`;
				return ` ${s}`;
			})
			.join("");
	if (format === "eurlex-html") {
		const art = path.findIndex((p) => /^Article /.test(p));
		if (art >= 0) return `Art. ${path[art]!.slice("Article ".length)}${sub(path.slice(art + 1))}`;
		if (/^Recital /.test(path[0] ?? "")) return path[0]!;
		const anx = path.findIndex((p) => /^Annex /.test(p));
		if (anx >= 0) {
			const rest = path.slice(anx + 1);
			if (rest.length === 0) return path[anx]!;
			const first = /^point (\S+)$/.exec(rest[0]!);
			return first ? `${path[anx]}, point ${first[1]}${sub(rest.slice(1))}` : `${path[anx]},${sub(rest)}`;
		}
		return path.at(-1) ?? "";
	}
	const parts = path.map((s) => s.replace(/^Section /, "").replace(/^paragraph /, "para ").replace(/^page /, "p. "));
	if (format === "markdown" && parts.length > 2) return parts.slice(-2).join(" ");
	return parts.join(" ");
}

/** The chip's label for one citation (D077). */
export function citationLabel(version: Pick<DocumentVersion, "format" | "title" | "label">, path: readonly string[]): string {
	return `${documentShortName(version)}, ${shortPath(version.format, path)}`;
}

/** The chip's text: the first label, plus " +N" for the rest (D077). */
export function chipText(labels: readonly string[]): string {
	if (labels.length === 0) return "";
	return labels.length === 1 ? labels[0]! : `${labels[0]} +${labels.length - 1}`;
}

/** Every cited node's chip labels, in citation order (the snapshot's
 *  `citations` map). Citations of unknown versions are skipped. */
export function citationLabels(citations: readonly Citation[], versions: readonly DocumentVersion[]): Record<string, string[]> {
	const byVersion = new Map(versions.map((v) => [v.versionId, v]));
	const seen = new Set<string>();
	const out: Record<string, string[]> = {};
	for (const c of citations) {
		if (seen.has(c.id)) continue;
		seen.add(c.id);
		const v = byVersion.get(c.version);
		if (!v) continue;
		(out[c.nodeId] ??= []).push(citationLabel(v, c.path));
	}
	return out;
}
