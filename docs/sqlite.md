# Kvasir on SQLite

Kvasir can keep its data in one SQLite database, `data/kvasir.db`, instead of the folders of JSON files it has always used (Kvasir P6-1, D106 to D111). Both work the same way: the app picks SQLite when `kvasir.db` exists in the data folder and the files otherwise. A new install starts on files.

## What moves into the database

| Moves into `kvasir.db` | Stays a file |
|---|---|
| The graph ledgers: nodes, chains, sessions, coverage, documents, citations | `settings.json` |
| Imported notes (`sources.json`) and graph positions (`positions.json`) | `auth.json` (your keys) |
| Source document units (`graph/document-units/`) | Prompt overrides |
| The learner ledgers: reviews, questions, exclusions | `graph/render-settings.json` |
| Chats and background jobs | `graph/format.json` (the graph format stamp) |

Each record is stored as the same JSON the files hold, so nothing is reinterpreted.

## Move to SQLite

1. Quit the Kvasir app.
2. In the Kvasir checkout, run the migration on the app's data folder:

   ```bash
   KV_DATA_DIR="$HOME/Library/Application Support/Kvasir/data" npm run migrate:sqlite
   ```

   Without `KV_DATA_DIR` it migrates the checkout's own `data/` folder, which `npm run dev` uses.
3. Open the app again.

The migration:

- copies every record into a new database
- checks that both sides read back the same
- renames the database into place
- moves the old files into `data/pre-sqlite-<date>-<time>/`

It prints the counts per ledger and the folder the files went to. Nothing is deleted. If the check fails, no database is left behind and the files stay where they were.

It refuses when:

- `kvasir.db` already exists
- the folder is encrypted (`docs/encryption.md`): turn encryption off, migrate, then turn it on again
- the Kvasir app is running and the folder is the app's own

## Move back to files

```bash
KV_DATA_DIR="$HOME/Library/Application Support/Kvasir/data" npm run migrate:files
```

This writes the files back out from the database, checks them, and moves `kvasir.db` (with its `-wal` and `-shm` files) into `data/pre-files-<date>-<time>/`. It refuses when files already sit where it would write them. After a round trip the ledger files are byte for byte what they were, plus anything the app wrote while on SQLite.

## Notes

- The MCP server (`docs/mcp.md`) makes the same choice and opens the database read-only, so Claude Desktop can read while the app writes.
- The database uses WAL mode, so you may see `kvasir.db-wal` and `kvasir.db-shm` beside it while the app runs. Keep them with the database if you copy it.
- `node:sqlite` is built into Node, so there is nothing to install. Node may print an experimental warning when it loads.

## Code

| File | What it holds |
|---|---|
| `src/store/backend.ts` | `StoreBackend`: ledgers, records and singles as raw JSON |
| `src/store/file-backend.ts` | The data folder layout |
| `src/store/sqlite/db.ts`, `src/store/sqlite/backend.ts` | The database, its tables and the SQLite backend |
| `src/store/active.ts` | The choice: SQLite when `kvasir.db` exists |
| `src/store/migrate.ts`, `scripts/migrate-store.ts` | The migration both ways |
| `tests/store-contract/` | Every port case, run against both backends |
