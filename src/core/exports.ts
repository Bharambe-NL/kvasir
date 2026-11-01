/**
 * Graph exports (Kvasir P6-3, D100 to D105): the graph as an Obsidian vault
 * (one note per proposition, chains as links, D103) and as an Anki text
 * import file (one Basic note per proposition, D101, D102). Pure and
 * browser-safe; both are derived from the ledgers at export time and
 * nothing is stored.
 */

import type { GraphChain, GraphNode } from "./contracts.ts";
import type { Citation, DocumentVersion } from "./contracts/sources.ts";
import { birthSessionOf } from "./session-clusters.ts";
import { citationLabel, citationsFor } from "./sources.ts";

export interface ExportInput {
	nodes: readonly GraphNode[];
	chains: readonly GraphChain[];
	citations: readonly Citation[];
	versions: readonly DocumentVersion[];
	/** Birth session id to its name (chat title or notes file). */
	sessionNames: ReadonlyMap<string, string>;
}

export interface ExportFile {
	/** Relative to the export folder, with "/" separators. */
	path: string;
	text: string;
}

/** Chains whose every member is a live node (deriveView's rule). */
function liveChains(input: ExportInput): GraphChain[] {
	const live = new Set(input.nodes.map((n) => n.id));
	return input.chains.filter((c) => live.has(c.conclusion) && c.premises.length > 0 && c.premises.every((p) => live.has(p)));
}

function sourceLines(nodeId: string, input: ExportInput): { label: string; quote: string }[] {
	const byVersion = new Map(input.versions.map((v) => [v.versionId, v]));
	return citationsFor(nodeId, input.citations).flatMap((c) => {
		const version = byVersion.get(c.version);
		return version ? [{ label: citationLabel(version, c.path), quote: c.quote }] : [];
	});
}

const sessionName = (node: GraphNode, input: ExportInput): string | null => {
	const birth = birthSessionOf(node);
	return birth ? (input.sessionNames.get(birth) ?? birth) : null;
};

// ─── Obsidian (D103) ─────────────────────────────────────────────────────────

/** A proposition name made safe as an Obsidian note name: no characters that
 *  break file names or wiki links, no leading dot, at most 120 characters. */
export function noteName(name: string): string {
	const safe = name
		.replace(/[\\/:*?"<>|#^[\]]/g, " ")
		.replace(/\s+/g, " ")
		.trim()
		.replace(/^\.+/, "")
		.slice(0, 120)
		.trim();
	return safe || "Untitled";
}

/** Note names for every node. Names that clash (ignoring case, as macOS
 *  does) all get a short id suffix such as "Strategy (a1b2c3)". */
export function noteNames(nodes: readonly Pick<GraphNode, "id" | "name">[]): Map<string, string> {
	const base = new Map(nodes.map((n) => [n.id, noteName(n.name)]));
	const count = new Map<string, number>();
	for (const name of base.values()) count.set(name.toLowerCase(), (count.get(name.toLowerCase()) ?? 0) + 1);
	const out = new Map<string, string>();
	const taken = new Set<string>();
	for (const n of nodes) {
		const name = base.get(n.id)!;
		const short = n.id.replace(/^n_/, "");
		let final = count.get(name.toLowerCase())! > 1 ? `${name} (${short.slice(0, 6)})` : name;
		if (taken.has(final.toLowerCase())) final = `${name} (${short})`;
		taken.add(final.toLowerCase());
		out.set(n.id, final);
	}
	return out;
}

const yaml = (s: string) => JSON.stringify(s);

/** The vault's files: `<name>.md` per proposition and `index.md`. */
export function obsidianVault(input: ExportInput): ExportFile[] {
	const names = noteNames(input.nodes);
	const link = (id: string) => `[[${names.get(id)}]]`;
	const chains = liveChains(input);
	const files: ExportFile[] = [];
	const bySession = new Map<string, string[]>();
	for (const node of input.nodes) {
		const session = sessionName(node, input);
		const front = ["---", `kvasir-id: ${yaml(node.id)}`];
		if (node.aliases.length) front.push("aliases:", ...node.aliases.map((a) => `  - ${yaml(a)}`));
		if (session) front.push(`session: ${yaml(session)}`);
		front.push("---");
		const body = [`# ${node.name}`, "", node.statement];
		const because = chains.filter((c) => c.conclusion === node.id).map((c) => `- ${[...c.premises].sort().map(link).join(" + ")}`);
		if (because.length) body.push("", "## Because", "", ...because);
		const leadsTo = [...new Set(chains.filter((c) => c.premises.includes(node.id)).map((c) => c.conclusion))].map((id) => `- ${link(id)}`);
		if (leadsTo.length) body.push("", "## Leads to", "", ...leadsTo);
		const sources = sourceLines(node.id, input).map((s) => `- ${s.label}: "${s.quote}"`);
		if (sources.length) body.push("", "## Sources", "", ...sources);
		files.push({ path: `${names.get(node.id)}.md`, text: `${[...front, "", ...body].join("\n")}\n` });
		const key = session ?? "No session";
		bySession.set(key, [...(bySession.get(key) ?? []), node.id]);
	}
	const index = ["# Kvasir", "", `${input.nodes.length} propositions from ${bySession.size} sessions, exported from Kvasir.`];
	for (const [session, ids] of [...bySession].sort(([a], [b]) => a.localeCompare(b))) {
		index.push("", `## ${session}`, "", ...ids.map((id) => `- ${link(id)}`));
	}
	files.push({ path: "index.md", text: `${index.join("\n")}\n` });
	return files;
}

// ─── Anki (D101, D102, D104) ─────────────────────────────────────────────────

const html = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
/** A field never carries a raw tab or newline (the file's separators). */
const field = (s: string) => s.replace(/\t/g, " ").replace(/\r?\n/g, "<br>");

/** An Anki tag from a session name: no spaces (Anki splits tags on them). */
export function ankiTag(session: string): string {
	return `kvasir::${session.replace(/[\s"]+/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "") || "session"}`;
}

/** The Anki text import file (File > Import). Leaves out propositions whose
 *  birth session is in `excluded` (D104). */
export function ankiDeck(input: ExportInput, excluded: ReadonlySet<string>): { text: string; notes: number } {
	const names = new Map(input.nodes.map((n) => [n.id, n.name]));
	const chains = liveChains(input);
	const rows: string[] = [];
	for (const node of input.nodes) {
		const birth = birthSessionOf(node);
		if (birth && excluded.has(birth)) continue;
		const back = [html(node.statement)];
		const because = chains.filter((c) => c.conclusion === node.id);
		if (because.length) {
			back.push("<br><br><b>Because</b>", ...because.map((c) => `<br>${[...c.premises].sort().map((p) => html(names.get(p)!)).join(" + ")}`));
		}
		const sources = sourceLines(node.id, input);
		if (sources.length) back.push("<br><br><b>Sources</b>", ...sources.map((s) => `<br>${html(s.label)}: &quot;${html(s.quote)}&quot;`));
		const session = sessionName(node, input);
		rows.push([node.id, html(node.name), back.join(""), session ? ankiTag(session) : ""].map(field).join("\t"));
	}
	const header = ["#separator:tab", "#html:true", "#notetype:Basic", "#deck:Kvasir", "#guid column:1", "#tags column:4"];
	return { text: `${[...header, ...rows].join("\n")}\n`, notes: rows.length };
}
