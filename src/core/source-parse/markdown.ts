/**
 * The Markdown structure parser (Kvasir P2-2): headings and paragraphs into
 * addressable units (D066). Deterministic, no model.
 *
 * A heading opens a unit whose path is the heading path, for example
 * ["Risk appetite", "Limits"]. Each paragraph or list item under it is
 * ["Risk appetite", "Limits", "paragraph 3"], counted per heading. Text
 * before the first heading is ["paragraph k"]. Unit text is the plain text
 * (inline formatting dropped), with whitespace normalised.
 */

import { fromMarkdown } from "mdast-util-from-markdown";
import type { ParsedSource, SourceUnit } from "../contracts/sources.ts";

interface MdNode {
	type: string;
	depth?: number;
	value?: string;
	children?: MdNode[];
}

export function parseMarkdown(markdown: string, fileName: string): ParsedSource {
	const root = fromMarkdown(markdown) as unknown as MdNode;
	const units: SourceUnit[] = [];
	const headings: { depth: number; text: string }[] = [];
	const counts = new Map<string, number>();
	let title: string | null = null;

	const paragraph = (text: string) => {
		if (!text) return;
		const base = headings.map((h) => h.text);
		const k = (counts.get(base.join("\u0000")) ?? 0) + 1;
		counts.set(base.join("\u0000"), k);
		units.push({ path: [...base, `paragraph ${k}`], text });
	};

	for (const node of root.children ?? []) {
		if (node.type === "heading") {
			const text = plain(node);
			if (!text) continue;
			while (headings.length && headings.at(-1)!.depth >= (node.depth ?? 1)) headings.pop();
			headings.push({ depth: node.depth ?? 1, text });
			title ??= node.depth === 1 ? text : null;
			units.push({ path: headings.map((h) => h.text), text: "" });
		} else if (node.type === "list") {
			for (const item of node.children ?? []) paragraph(plain(item));
		} else if (node.type !== "thematicBreak" && node.type !== "html" && node.type !== "definition") {
			paragraph(plain(node));
		}
	}
	return { format: "markdown", title: title ?? fileName.replace(/\.[^.]+$/, ""), units: dedupe(units) };
}

/** Two headings with the same text at the same place would share a path;
 *  the later one gets " (2)", so every path stays unique. */
function dedupe(units: SourceUnit[]): SourceUnit[] {
	const seen = new Map<string, number>();
	return units.map((u) => {
		const k = u.path.join("\u0000");
		const n = (seen.get(k) ?? 0) + 1;
		seen.set(k, n);
		return n === 1 ? u : { ...u, path: [...u.path.slice(0, -1), `${u.path.at(-1)} (${n})`] };
	});
}

function plain(node: MdNode): string {
	const parts: string[] = [];
	const walk = (n: MdNode) => {
		if (typeof n.value === "string" && n.type !== "html") parts.push(n.value);
		for (const c of n.children ?? []) walk(c);
		if (n.type === "paragraph" || n.type === "listItem") parts.push(" ");
	};
	walk(node);
	return parts.join("").replace(/\s+/g, " ").trim();
}
