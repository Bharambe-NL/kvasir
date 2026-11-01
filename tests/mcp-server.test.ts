/**
 * The Kvasir MCP server end to end (Kvasir P6-2, D091, D093): the SDK's own
 * Client spawns the real entry point over stdio, as Claude Desktop does
 * (node + the tsx CLI + scripts/mcp-server.ts, KV_DATA_DIR set), lists the
 * tools and calls them against a temp copy of the golden data. Also: the
 * src/mcp ESLint zone. No network, no model.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { after, describe, it } from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { ESLint } from "eslint";

const REPO = fileURLToPath(new URL("..", import.meta.url));
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "kv-mcp-server-"));
fs.cpSync(path.join(REPO, "tests", "fixtures", "golden-data"), TMP, { recursive: true });
after(() => fs.rmSync(TMP, { recursive: true, force: true }));

const text = (r: unknown) => ((r as { content: { type: string; text: string }[] }).content[0]!.text);

describe("the stdio server (D091)", () => {
	it("lists the six tools and answers from the data folder; an unknown tool is an error", async () => {
		const stderr: string[] = [];
		const transport = new StdioClientTransport({
			command: process.execPath,
			args: [path.join(REPO, "node_modules", "tsx", "dist", "cli.mjs"), path.join(REPO, "scripts", "mcp-server.ts")],
			env: { ...(process.env as Record<string, string>), KV_DATA_DIR: TMP },
			stderr: "pipe",
		});
		transport.stderr?.on("data", (d) => stderr.push(String(d)));
		const client = new Client({ name: "kvasir-test", version: "0.0.0" });
		await client.connect(transport);
		try {
			const { tools } = await client.listTools();
			assert.deepEqual(tools.map((t) => t.name), ["search_graph", "get_proposition", "list_sources", "read_source", "list_sessions", "review_status"]);

			const found = text(await client.callTool({ name: "search_graph", arguments: { query: "knowledge tracing" } }));
			assert.match(found.split("\n")[1]!, /^n_9b19474daaf7 \| Knowledge tracing \| /);
			const prop = text(await client.callTool({ name: "get_proposition", arguments: { id: "n_9b19474daaf7" } }));
			assert.match(prop, /^Knowledge tracing \(n_9b19474daaf7\)/);
			assert.equal(text(await client.callTool({ name: "list_sources", arguments: {} })), "No source document is imported yet.");

			const bad = await client.callTool({ name: "write_graph", arguments: {} });
			assert.equal(bad.isError, true);
			assert.equal(text(bad), "Unknown tool: write_graph");
		} finally {
			await client.close();
		}
		assert.match(stderr.join(""), new RegExp(`\\[kvasir-mcp\\] serving ${TMP.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} \\(read-only\\)`), "logs go to stderr; stdout stayed clean enough for the client to parse every message");
	});
});

describe("the src/mcp lint zone", () => {
	it("refuses an import of the store, the server or the agent from src/mcp", async () => {
		const eslint = new ESLint({ cwd: REPO });
		const [res] = await eslint.lintText('import { graphStore } from "../store/graph.ts";\nexport const x = graphStore;\n', { filePath: path.join(REPO, "src", "mcp", "zz-probe.ts") });
		assert.ok(res!.messages.some((m) => /read-only by construction/.test(m.message)), JSON.stringify(res!.messages.map((m) => m.message)));
	});
});
