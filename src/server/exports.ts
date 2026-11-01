/**
 * Graph exports (Kvasir P6-3, D100 to D105): reads the stores, builds the
 * Obsidian vault or the Anki file (src/core/exports.ts) and writes it into
 * a new dated folder under the export root. Never overwrites; never writes
 * the data folder.
 */

import fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { ankiDeck, obsidianVault, type ExportInput } from "../core/exports.ts";
import { excludedSessions } from "../core/learner.ts";
import { getGraph } from "../core/graph.ts";
import { stores } from "./stores.ts";

export type ExportKind = "obsidian" | "anki";

export interface ExportResult {
	/** The folder written, absolute. */
	path: string;
	/** The same, with the home folder shown as "~", for the done line. */
	display: string;
	/** Propositions in the export. */
	propositions: number;
}

const shown = (p: string) => {
	const home = os.homedir();
	return p === home || p.startsWith(home + path.sep) ? `~${p.slice(home.length)}` : p;
};

/** Where exports go: KV_EXPORT_DIR, else ~/Documents/Kvasir exports (D105). */
export function exportRoot(): string {
	return process.env.KV_EXPORT_DIR || path.join(os.homedir(), "Documents", "Kvasir exports");
}

const pad = (n: number) => String(n).padStart(2, "0");
/** "2026-11-01 1030" in local time. */
export function exportStamp(now: Date): string {
	return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}${pad(now.getMinutes())}`;
}

/** A new folder under the root: the stamp, then " 2", " 3" when taken. */
function newFolder(root: string, stamp: string): string {
	fs.mkdirSync(root, { recursive: true });
	for (let n = 1; ; n++) {
		const dir = path.join(root, n === 1 ? stamp : `${stamp} ${n}`);
		try {
			fs.mkdirSync(dir);
			return dir;
		} catch (err) {
			if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
		}
	}
}

function exportInput(): ExportInput {
	const g = stores.graphStore;
	const graph = getGraph(g);
	const sessionNames = new Map<string, string>();
	for (const s of g.readSources()) sessionNames.set(s.id, s.filePath);
	for (const c of stores.chatStore.listChats()) sessionNames.set(c.id, c.title);
	return { nodes: graph.nodes, chains: graph.chains, citations: g.readCitations(), versions: g.readDocumentVersions(), sessionNames };
}

export function exportGraph(kind: ExportKind, now: Date = new Date()): ExportResult {
	const input = exportInput();
	const dir = newFolder(exportRoot(), exportStamp(now));
	if (kind === "obsidian") {
		const vault = path.join(dir, "Kvasir vault");
		fs.mkdirSync(vault);
		for (const file of obsidianVault(input)) fs.writeFileSync(path.join(vault, file.path), file.text, { flag: "wx" });
		return { path: dir, display: shown(dir), propositions: input.nodes.length };
	}
	const deck = ankiDeck(input, excludedSessions(stores.learnerStore.readExclusions()));
	fs.writeFileSync(path.join(dir, "kvasir-anki.txt"), deck.text, { flag: "wx" });
	return { path: dir, display: shown(dir), propositions: deck.notes };
}

/** Whether a path is inside the export root (the Show in Finder guard). */
export function insideExportRoot(p: string): boolean {
	const rel = path.relative(path.resolve(exportRoot()), path.resolve(p));
	return rel !== "" && !rel.startsWith("..") && !path.isAbsolute(rel);
}
