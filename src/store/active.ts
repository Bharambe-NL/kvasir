/**
 * Which storage backend is live (Kvasir P6-1, D108): SQLite when
 * data/kvasir.db exists, the files otherwise. The migration
 * (scripts/migrate-store.ts) creates or retires the database, so the choice
 * follows the data folder and needs no setting. Used by the composition
 * roots only: src/server/stores.ts and the scripts.
 */

import fs from "node:fs";
import * as path from "node:path";
import { PATHS } from "../../config.ts";
import type { StoreBackend } from "./backend.ts";
import { fileBackend } from "./file-backend.ts";
import { sqliteBackend } from "./sqlite/backend.ts";
import { DB_FILE_NAME, openDatabase } from "./sqlite/db.ts";

export const DB_FILE = path.join(PATHS.data, DB_FILE_NAME);

export function activeBackend(opts: { readOnly?: boolean } = {}): StoreBackend {
	return fs.existsSync(DB_FILE) ? sqliteBackend(openDatabase(DB_FILE, opts)) : fileBackend;
}
