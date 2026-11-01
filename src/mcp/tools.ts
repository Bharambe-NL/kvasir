/**
 * THE KVASIR MCP TOOLS (Kvasir P6-2, D090 to D092): six read-only tools that
 * let Claude use Kvasir as context. Pure functions over a KvasirReadContext
 * of read functions only, so nothing here can write; the stdio server
 * (src/mcp/server.ts) registers them and the entry point
 * (scripts/mcp-server.ts) wires the fs readers. This folder imports core
 * only (its own ESLint zone).
 */

import type { ChatSummary, GraphNode, NotesSource } from "../core/contracts.ts";
import type { Citation, DocumentVersion, SourceUnit } from "../core/contracts/sources.ts";
import type { ReviewEntry, ReviewExclusion } from "../core/contracts/learner.ts";
import { getGraph, graphSessionIndex, graphSessionPropositions, type GraphDeps } from "../core/graph.ts";
import { formatChainLine } from "../core/chains.ts";
import { birthSessionOf } from "../core/session-clusters.ts";
import { citationLabel, documentShortName, sourceDocuments, versionLabel } from "../core/sources.ts";
import { citationStatus } from "../core/source-diff.ts";
import { readSource } from "../core/source-read.ts";
import { deriveCards } from "../core/cards.ts";
import { excludedSessions } from "../core/learner.ts";
import { retrievability } from "../core/schedule.ts";
import { buildQueue, measuredRetention, REVIEW_LIMITS } from "../core/review-queue.ts";

/** Everything the tools may read. Read functions only. */
export interface KvasirReadContext {
	readNodes: () => GraphNode[];
	readChains: () => ReturnType<GraphDeps["graphStore"]["readChains"]>;
	readCitations: () => Citation[];
	readDocumentVersions: () => DocumentVersion[];
	readDocumentUnits: (versionId: string) => SourceUnit[] | null;
	readSources: () => NotesSource[];
	readReviews: () => ReviewEntry[];
	readExclusions: () => ReviewExclusion[];
	listChats: () => ChatSummary[];
	/** ISO now, and the local day's start (the review limits count per day). */
	now: () => string;
	dayStart: () => string;
}

export const SEARCH_DEFAULT = 10;
export const SEARCH_MAX = 25;
const WEAK_RECALL = 0.8;
const WEAK_MAX = 15;

const pct = (x: number) => `${Math.round(x * 100)}%`;
const day = (iso: string | undefined | null) => (iso ? iso.slice(0, 10) : "unknown");

/** The read-only graph view core's derivations take. */
function deps(ctx: KvasirReadContext): GraphDeps {
	return {
		graphStore: { readNodes: ctx.readNodes, readChains: ctx.readChains, readSources: ctx.readSources },
		chatStore: { listChats: ctx.listChats },
	} as unknown as GraphDeps;
}

/** Each birth session's display name: a chat title, a document title or a
 *  notes file. */
function sessionNames(ctx: KvasirReadContext): Map<string, string> {
	const names = new Map<string, string>();
	for (const s of ctx.readSources()) names.set(s.id, s.filePath);
	for (const c of ctx.listChats()) names.set(c.id, c.title);
	return names;
}

export function searchGraph(ctx: KvasirReadContext, input: { query?: string; limit?: number }): string {
	const words = (input.query ?? "").toLowerCase().split(/\s+/).filter((w) => w.length > 1);
	if (words.length === 0) return "Give some words to search for.";
	const limit = Math.min(SEARCH_MAX, Math.max(1, Math.floor(input.limit ?? SEARCH_DEFAULT)));
	const nodes = getGraph(deps(ctx).graphStore).nodes;
	const versions = ctx.readDocumentVersions();
	const byVersion = new Map(versions.map((v) => [v.versionId, v]));
	const labels = new Map<string, string[]>();
	for (const c of ctx.readCitations()) {
		const v = byVersion.get(c.version);
		if (v) labels.set(c.nodeId, [...(labels.get(c.nodeId) ?? []), citationLabel(v, c.path)]);
	}
	const scored = nodes
		.map((n) => {
			const name = n.name.toLowerCase();
			const all = [n.name, n.statement, ...n.aliases].join(" ").toLowerCase();
			if (!words.every((w) => all.includes(w))) return null;
			return { n, score: words.filter((w) => name.includes(w)).length };
		})
		.filter((x): x is { n: GraphNode; score: number } => x !== null)
		.sort((a, b) => b.score - a.score || a.n.name.localeCompare(b.n.name));
	if (scored.length === 0) return "No proposition matched. Try fewer or different words.";
	const shown = scored.slice(0, limit);
	const lines = [`${scored.length} proposition${scored.length === 1 ? "" : "s"} matched${scored.length > shown.length ? `, showing ${shown.length}` : ""}:`];
	for (const { n } of shown) {
		const cited = labels.get(n.id);
		lines.push(`${n.id} | ${n.name} | ${n.statement}${cited ? ` | sources: ${[...new Set(cited)].join("; ")}` : ""}`);
	}
	return lines.join("\n");
}

export function getProposition(ctx: KvasirReadContext, input: { id?: string }): string {
	const id = (input.id ?? "").trim();
	const graph = getGraph(deps(ctx).graphStore);
	const node = graph.nodes.find((n) => n.id === id);
	if (!node) return `No proposition with id "${id}". Use search_graph to find ids.`;
	const byId = Object.fromEntries(graph.nodes.map((n) => [n.id, { name: n.name }]));
	const lines = [`${node.name} (${node.id})`, node.statement];
	if (node.aliases.length) lines.push(`Also phrased as: ${node.aliases.join("; ")}`);
	const birth = birthSessionOf(node);
	if (birth) lines.push(`Born in: ${sessionNames(ctx).get(birth) ?? birth}`);

	const asConclusion = graph.chains.filter((c) => c.conclusion === node.id);
	const asPremise = graph.chains.filter((c) => c.premises.includes(node.id));
	if (asConclusion.length) lines.push("", "Derived by:", ...asConclusion.map((c) => `- ${formatChainLine(c, byId)}`));
	if (asPremise.length) lines.push("", "Used as a premise in:", ...asPremise.map((c) => `- ${formatChainLine(c, byId)}`));

	const versions = ctx.readDocumentVersions();
	const byVersion = new Map(versions.map((v) => [v.versionId, v]));
	const ordered = new Map(sourceDocuments(versions).map((d) => [d.id, d.versions]));
	const cites = ctx.readCitations().filter((c) => c.nodeId === node.id);
	if (cites.length) {
		lines.push("", "Citations:");
		for (const c of cites) {
			const v = byVersion.get(c.version);
			if (!v) continue;
			const status = citationStatus(c, ordered.get(c.sourceId) ?? [], ctx.readDocumentUnits);
			lines.push(
				`- ${citationLabel(v, c.path)} (version ${versionLabel(v)}): "${c.quote}"` +
					(status ? ` (outdated: ${status.kind} in version ${status.versionLabel})` : ""),
			);
		}
	}

	lines.push("", reviewLine(ctx, node));
	return lines.join("\n");
}

function reviewLine(ctx: KvasirReadContext, node: GraphNode): string {
	const excluded = excludedSessions(ctx.readExclusions());
	const birth = birthSessionOf(node);
	if (birth && excluded.has(birth)) return "Review: excluded from review.";
	const reviews = ctx.readReviews();
	const card = deriveCards({ readNodes: ctx.readNodes, readChains: ctx.readChains }, reviews, excluded).cards.find((c) => c.nodeId === node.id);
	if (!card || card.state.reps === 0) return "Review: not reviewed yet.";
	const r = retrievability(card.nodeId, reviews, card.introducedAt, ctx.now());
	return (
		`Review: ${card.state.reps} review${card.state.reps === 1 ? "" : "s"}, recall ${r === null ? "unknown" : pct(r)}, ` +
		`next due ${day(card.state.due)}, forgotten ${card.state.lapses} time${card.state.lapses === 1 ? "" : "s"}.`
	);
}

export function listSources(ctx: KvasirReadContext): string {
	const docs = sourceDocuments(ctx.readDocumentVersions());
	if (docs.length === 0) return "No source document is imported yet.";
	const live = new Set(getGraph(deps(ctx).graphStore).nodes.map((n) => n.id));
	const citedBy = new Map<string, Set<string>>();
	for (const c of ctx.readCitations()) {
		if (!live.has(c.nodeId)) continue;
		citedBy.set(c.sourceId, (citedBy.get(c.sourceId) ?? new Set()).add(c.nodeId));
	}
	const lines = [`${docs.length} imported document${docs.length === 1 ? "" : "s"}:`];
	for (const d of docs) {
		const latest = d.versions.at(-1)!;
		lines.push(
			"",
			`${documentShortName(latest)}: ${d.title}`,
			`Versions: ${d.versions.map((v) => `${versionLabel(v)} (imported ${day(v.importedAt)})`).join(", ")}`,
			`Propositions citing it: ${citedBy.get(d.id)?.size ?? 0}`,
		);
	}
	return lines.join("\n");
}

export function readSourceText(ctx: KvasirReadContext, input: { document?: string; address?: string; words?: string }): string {
	// The teacher's lookup; the citation links are lesson markup, so here
	// only their label is kept.
	return readSource(ctx, input).replace(/\[([^\]]+)\]\(#src-[^)]+\)/g, "$1");
}

export function listSessions(ctx: KvasirReadContext, input: { session?: string }): string {
	const sessions = graphSessionIndex(deps(ctx));
	const names = sessionNames(ctx);
	const docs = new Set(ctx.readDocumentVersions().map((v) => v.sourceId));
	const kindOf = (id: string, kind: "chat" | "file") => (kind === "chat" ? "session" : docs.has(id) ? "document" : "notes");
	const wanted = input.session?.trim();
	if (wanted) {
		const entry = sessions.find((s) => s.id === wanted || s.name.toLowerCase() === wanted.toLowerCase());
		if (!entry) return `No session "${wanted}". Call list_sessions without a session to see them.`;
		const props = graphSessionPropositions(deps(ctx), entry.id);
		return [`${props.length} proposition${props.length === 1 ? "" : "s"} from ${names.get(entry.id) ?? entry.name}:`, ...props.map((p) => `${p.nodeId} | ${p.name}`)].join("\n");
	}
	if (sessions.length === 0) return "No session has produced propositions yet.";
	return [
		`${sessions.length} session${sessions.length === 1 ? "" : "s"} produced propositions, most recent first:`,
		...sessions.map((s) => `${s.id} | ${kindOf(s.id, s.kind)} | ${s.name} | ${day(s.updatedAt ?? s.createdAt)} | ${s.propositions} proposition${s.propositions === 1 ? "" : "s"}`),
	].join("\n");
}

export function reviewStatus(ctx: KvasirReadContext): string {
	const reviews = ctx.readReviews();
	const now = ctx.now();
	const { cards } = deriveCards({ readNodes: ctx.readNodes, readChains: ctx.readChains }, reviews, excludedSessions(ctx.readExclusions()));
	const { queue, stats } = buildQueue(cards, reviews, now, ctx.dayStart());
	const reviewed = cards.filter((c) => c.state.reps > 0);
	const weak = reviewed
		.map((c) => ({ c, r: retrievability(c.nodeId, reviews, c.introducedAt, now) }))
		.filter((x): x is { c: (typeof reviewed)[number]; r: number } => x.r !== null && x.r < WEAK_RECALL)
		.sort((a, b) => a.r - b.r)
		.slice(0, WEAK_MAX);
	const retention = measuredRetention(cards, reviews, now);
	const lines = [
		`Due today: ${queue.length} (limits: ${REVIEW_LIMITS.newPerDay} new and ${REVIEW_LIMITS.totalPerDay} reviews a day; ${stats.newLeft} new left).`,
		`Cards: ${cards.length}, of which ${reviewed.length} reviewed at least once.`,
		retention && retention.total > 0
			? `Measured retention, last 30 days: ${pct(retention.recalled / retention.total)} (${retention.recalled} of ${retention.total} scheduled reviews recalled).`
			: "Measured retention, last 30 days: no scheduled reviews yet.",
	];
	if (weak.length) {
		lines.push("", `Weakest propositions (recall below ${pct(WEAK_RECALL)}):`, ...weak.map(({ c, r }) => `- ${c.name}: recall ${pct(r)} (${c.nodeId})`));
	} else if (reviewed.length) {
		lines.push("", `No proposition is below ${pct(WEAK_RECALL)} recall.`);
	}
	return lines.join("\n");
}
