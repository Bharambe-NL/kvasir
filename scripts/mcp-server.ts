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

const { activeBackend } = await import("../src/store/active.ts");
const { createGraphStore } = await import("../src/store/graph.ts");
const { createLearnerStore } = await import("../src/store/learner.ts");
const { createChatStore } = await import("../src/store/chats.ts");
const { PATHS } = await import("../config.ts");
// The same choice as the app (D108); a database is opened read-only.
const backend = activeBackend({ readOnly: true });
const graphStore = createGraphStore(backend);
const learnerStore = createLearnerStore(backend);
const chatStore = createChatStore(backend);
const { createKvasirMcpServer } = await import("../src/mcp/server.ts");
const { StdioServerTransport } = await import("@modelcontextprotocol/sdk/server/stdio.js");
type ChatSummary = import("../src/core/contracts.ts").ChatSummary;

/** Chats by id and record, without building the sidebar summary. */
function listChatsReadOnly(): ChatSummary[] {
	return backend
		.recordIds("chats")
		.map((id) => chatStore.getChat(id))
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
console.error(`[kvasir-mcp] serving ${PATHS.data}${backend.kind === "sqlite" ? " from kvasir.db" : ""} (read-only)`);
