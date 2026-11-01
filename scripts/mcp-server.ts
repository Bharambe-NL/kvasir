/**
 * The Kvasir MCP server's entry point (Kvasir P6-2, D091): Claude Desktop
 * starts this over stdio. It reads the Kvasir data folder directly and never
 * writes. The folder is KV_DATA_DIR, or the desktop app's folder when unset.
 *
 * Stdout carries the protocol, so every log line goes to stderr, set up
 * before anything else is imported.
 */

import fs from "node:fs";
import { defaultDataDir } from "./mcp-server-paths.ts";

console.log = console.error;
console.info = console.error;
console.debug = console.error;

process.env.KV_DATA_DIR ||= defaultDataDir();

const { graphStore } = await import("../src/store/graph.ts");
const { learnerStore } = await import("../src/store/learner.ts");
const { chatStore } = await import("../src/store/chats.ts");
const { PATHS } = await import("../config.ts");
const { createKvasirMcpServer } = await import("../src/mcp/server.ts");
const { StdioServerTransport } = await import("@modelcontextprotocol/sdk/server/stdio.js");
type ChatSummary = import("../src/core/contracts.ts").ChatSummary;

/** Chats without creating the chats folder (chatStore.listChats may). */
function listChatsReadOnly(): ChatSummary[] {
	if (!fs.existsSync(PATHS.chats)) return [];
	return fs
		.readdirSync(PATHS.chats)
		.filter((f) => f.endsWith(".json"))
		.map((f) => chatStore.getChat(f.slice(0, -5)))
		.filter((c): c is NonNullable<typeof c> => c !== null)
		.map((c) => ({ id: c.id, title: c.title, createdAt: c.createdAt, updatedAt: c.updatedAt }) as ChatSummary);
}

const localDayStart = () => {
	const d = new Date();
	d.setHours(0, 0, 0, 0);
	return d.toISOString();
};

const version = JSON.parse(fs.readFileSync(new URL("../package.json", import.meta.url), "utf8")).version as string;
const server = createKvasirMcpServer(
	{
		readNodes: () => graphStore.readNodes(),
		readChains: () => graphStore.readChains(),
		readCitations: () => graphStore.readCitations(),
		readDocumentVersions: () => graphStore.readDocumentVersions(),
		readDocumentUnits: (v) => graphStore.readDocumentUnits(v),
		readSources: () => graphStore.readSources(),
		readReviews: () => learnerStore.readReviews(),
		readExclusions: () => learnerStore.readExclusions(),
		listChats: listChatsReadOnly,
		now: () => new Date().toISOString(),
		dayStart: localDayStart,
	},
	version,
);
await server.connect(new StdioServerTransport());
console.error(`[kvasir-mcp] serving ${PATHS.data} (read-only)`);
