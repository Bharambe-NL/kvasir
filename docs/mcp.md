# Kvasir MCP server

Kvasir can give Claude read-only access to your knowledge graph, your imported sources and your review state, through an MCP server that Claude Desktop starts (Kvasir P6-2, D090 to D093). It reads the Kvasir data folder directly, so it works whether or not the Kvasir app is open, and it never writes anything.

## Tools

| Tool | What it returns |
|---|---|
| `search_graph` | Propositions whose name, statement or aliases contain all the given words, with their ids and source citations |
| `get_proposition` | One proposition: statement, where it was learned, its reasoning chains, citations (marked when a newer version changed them) and review state |
| `list_sources` | Imported documents, their versions and how many propositions cite each |
| `read_source` | A document's text by address (`Art. 28(2)`, `Recital 12`, `3.3.3 para 17`) or by words, from the newest version |
| `list_sessions` | Sessions, notes imports and documents that produced propositions; with a session id or name, its propositions |
| `review_status` | What is due today, the weakest propositions (recall below 80%) and measured retention over 30 days |

## Set it up in Claude Desktop

1. In the Kvasir checkout, print the config entry for this machine:

   ```bash
   npm run -s mcp:config
   ```

   It prints a `mcpServers.kvasir` entry with absolute paths:
   - the `node` that runs it
   - the `tsx` command line tool in `node_modules`
   - `scripts/mcp-server.ts`
   - `KV_DATA_DIR`, which defaults to the desktop app's data folder (`~/Library/Application Support/Kvasir/data` on macOS)
2. Open Claude Desktop's config file, `~/Library/Application Support/Claude/claude_desktop_config.json` on macOS, and add the `kvasir` entry under `mcpServers`. Keep any servers already there.
3. Restart Claude Desktop. The six Kvasir tools appear in its tools list.

## Try it in a terminal

```bash
npm run mcp
```

It runs the server on stdio against the same data folder, and logs go to stderr. Set `KV_DATA_DIR` to point it at another folder.
