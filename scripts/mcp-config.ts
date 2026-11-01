/**
 * Prints the Claude Desktop config entry for the Kvasir MCP server (Kvasir
 * P6-2, D093), with absolute paths for this machine. Add the "kvasir" entry
 * under "mcpServers" in Claude Desktop's claude_desktop_config.json and
 * restart Claude Desktop.
 */

import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { defaultDataDir } from "./mcp-server-paths.ts";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const entry = {
	mcpServers: {
		kvasir: {
			command: process.execPath,
			args: [path.join(repo, "node_modules", "tsx", "dist", "cli.mjs"), path.join(repo, "scripts", "mcp-server.ts")],
			env: { KV_DATA_DIR: process.env.KV_DATA_DIR || defaultDataDir() },
		},
	},
};
console.log(JSON.stringify(entry, null, 2));
