/**
 * The Kvasir MCP server (Kvasir P6-2, D090 to D093): the six read-only tools
 * on the MCP SDK's low-level Server. The transport is the caller's
 * (scripts/mcp-server.ts connects stdio). A tool failure comes back as a
 * tool error, never a crash.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolRequestSchema, ListToolsRequestSchema, type CallToolResult, type Tool } from "@modelcontextprotocol/sdk/types.js";
import { getProposition, listSessions, listSources, readSourceText, reviewStatus, searchGraph, SEARCH_DEFAULT, SEARCH_MAX, type KvasirReadContext } from "./tools.ts";

const str = (description: string) => ({ type: "string", description });

/** The tool list Claude sees (D090). */
export const KVASIR_TOOLS: Tool[] = [
	{
		name: "search_graph",
		description:
			"Read-only. Search Sagar's Kvasir knowledge graph for propositions whose name, statement or aliases contain all the given words. Returns each match's id, name and statement, and its source citations when it has any.",
		inputSchema: {
			type: "object",
			properties: { query: str("Words to look for."), limit: { type: "number", description: `How many to return (default ${SEARCH_DEFAULT}, at most ${SEARCH_MAX}).` } },
			required: ["query"],
		},
	},
	{
		name: "get_proposition",
		description:
			"Read-only. One proposition from Sagar's Kvasir graph by id: its statement, where it was learned, the reasoning chains it is part of, its source citations (marked when a newer version changed them), and his review state for it.",
		inputSchema: { type: "object", properties: { id: str('The proposition id, such as "n_9b19474daaf7", from search_graph or list_sessions.') }, required: ["id"] },
	},
	{
		name: "list_sources",
		description: "Read-only. The source documents imported into Kvasir (regulations, guidelines, papers), with their versions and how many propositions cite each.",
		inputSchema: { type: "object", properties: {} },
	},
	{
		name: "read_source",
		description:
			"Read-only. Read an imported source document's text by address, such as Art. 28(2), Recital 12 or 3.3.3 para 17, or by words it contains. Reads the newest version; returns at most 12 paragraphs, each with its citation label.",
		inputSchema: {
			type: "object",
			properties: {
				document: str("Which document: words from its title or short name, or its CELEX number. Omit to search every document."),
				address: str('Where in it, for example "Art. 28", "Art. 28(2)" or "Recital 12".'),
				words: str("Words the paragraph must contain, all of them."),
			},
		},
	},
	{
		name: "list_sessions",
		description:
			"Read-only. The teaching sessions, notes imports and documents that produced propositions in Sagar's Kvasir graph, most recent first. Give a session id or name to list the propositions it produced.",
		inputSchema: { type: "object", properties: { session: str("A session id or exact name, to list its propositions.") } },
	},
	{
		name: "review_status",
		description:
			"Read-only. Sagar's spaced-review state in Kvasir: what is due today, his weakest propositions (recall below 80%) and his measured retention over the last 30 days.",
		inputSchema: { type: "object", properties: {} },
	},
];

type Args = Record<string, unknown>;
const s = (a: Args, k: string) => (typeof a[k] === "string" ? (a[k] as string) : undefined);

/** Run one tool by name. Exported for tests. */
export function callKvasirTool(ctx: KvasirReadContext, name: string, args: Args = {}): string {
	switch (name) {
		case "search_graph":
			return searchGraph(ctx, { query: s(args, "query"), limit: typeof args.limit === "number" ? args.limit : undefined });
		case "get_proposition":
			return getProposition(ctx, { id: s(args, "id") });
		case "list_sources":
			return listSources(ctx);
		case "read_source":
			return readSourceText(ctx, { document: s(args, "document"), address: s(args, "address"), words: s(args, "words") });
		case "list_sessions":
			return listSessions(ctx, { session: s(args, "session") });
		case "review_status":
			return reviewStatus(ctx);
		default:
			throw new Error(`Unknown tool: ${name}`);
	}
}

export function createKvasirMcpServer(ctx: KvasirReadContext, version: string): Server {
	const server = new Server({ name: "kvasir", version }, { capabilities: { tools: {} } });
	server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: KVASIR_TOOLS }));
	server.setRequestHandler(CallToolRequestSchema, async (request): Promise<CallToolResult> => {
		try {
			const text = callKvasirTool(ctx, request.params.name, (request.params.arguments ?? {}) as Args);
			return { content: [{ type: "text", text }] };
		} catch (err) {
			return { content: [{ type: "text", text: err instanceof Error ? err.message : String(err) }], isError: true };
		}
	});
	return server;
}
