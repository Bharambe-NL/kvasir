# P6: Platform hardening

## Goal

Make Kvasir faster, safer to change and open to Sagar's other tools. Tasks here are independent. Each can land at any time after P0, in any order, when it unblocks other work. The one exception is P6-7, which starts after P6-4 merges.

## Tasks

| ID | Branch | Scope | Done when |
|---|---|---|---|
| P6-1 | `p6/sqlite-stores` | SQLite adapters behind the existing ports, switched in `src/server/stores.ts` only. Ledgers stay append-only tables. One-shot migration script | All store tests pass against both adapters; migration is reversible |
| P6-2 | `p6/mcp-server` | A read-only MCP server over the graph, citations and learner state, so Claude can use Kvasir as context | Claude Desktop lists the tools and answers a question from Sagar's graph |
| P6-3 | `p6/exports` | Obsidian vault export (one note per proposition, chains as links) and Anki deck export | Exports open cleanly in both apps |
| P6-4 | `p6/teaching-evals` | An eval harness that replays scripted learners against the prober and teacher and scores the transcripts with rubrics | Runs from one command; results stored per commit; used by P3-1 |
| P6-5 | `p6/model-tiering` | Per-role model routing with local models (Ollama) for extraction audit and grading | Cost per session drops with no eval regression |
| P6-6 | `p6/encryption-at-rest` | Optional encryption of `data/` with a key in the OS keychain | Data folder unreadable without the key; tests cover unlock failure |
| P6-7 | `p6/house-style-prompts` | Deferred from P0-5 (D026). Rewrite the upstream prompts in `src/agent/prompts/` and `src/agent/system-prompt.md` to house style without changing teaching behaviour, including the two that call the agent "a learning harness". Then add `README.md`, `src/agent/system-prompt.md` and `src/agent/prompts` to `DEFAULT_PATHS` in `scripts/house-style-check.mjs`. Starts after P6-4. Sagar reviews the PR | House-style check passes with the wider paths; the P6-4 evals show no teaching regression |

## Open decisions

Each task asks its own questions at the start of the task. P6-2 must confirm the tool list. P6-6 must confirm the key recovery method.

## Gate acceptance checks

Each task's "Done when" column. The phase gate passes when all seven are merged.

## Gate results

(record here)
