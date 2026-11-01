/**
 * npm run migrate:sqlite | npm run migrate:files (Kvasir P6-1, D109): move
 * the Kvasir data folder between the file and SQLite stores. KV_DATA_DIR
 * picks the folder, as for the app; unset, it is the repo's data/ (dev) as
 * for `next dev`. Pass the desktop app's folder to migrate it:
 *   KV_DATA_DIR=~/Library/Application\ Support/Kvasir/data npm run migrate:sqlite
 * Close the app first: the script refuses to touch the desktop app's folder
 * while the Kvasir app is running.
 */

import { execFileSync } from "node:child_process";
import * as path from "node:path";
import { defaultDataDir } from "./mcp-server-paths.ts";

const direction = process.argv[2];
if (direction !== "sqlite" && direction !== "files") {
	console.error("Usage: tsx scripts/migrate-store.ts sqlite|files");
	process.exit(2);
}

function appRunning(): boolean {
	if (process.platform !== "darwin") return false;
	try {
		return execFileSync("pgrep", ["-f", "Kvasir.app/Contents/MacOS"], { encoding: "utf8" }).trim().length > 0;
	} catch {
		return false; // pgrep exits 1 when nothing matches
	}
}
const target = path.resolve(process.env.KV_DATA_DIR || path.join(import.meta.dirname, "..", "data"));
if (target === path.resolve(defaultDataDir()) && appRunning()) {
	console.error("The Kvasir app is running. Quit it, then run the migration again.");
	process.exit(1);
}

const { PATHS } = await import("../config.ts");
const { migrateToFiles, migrateToSqlite } = await import("../src/store/migrate.ts");
console.log(`Migrating ${PATHS.data} to ${direction === "sqlite" ? "SQLite (kvasir.db)" : "files"}...`);
try {
	const report = direction === "sqlite" ? migrateToSqlite() : migrateToFiles();
	const list = (o: Record<string, number>) => Object.entries(o).map(([k, n]) => `${k} ${n}`).join(", ");
	console.log(`Ledgers: ${list(report.ledgers)}`);
	console.log(`Records: ${list(report.records)}`);
	console.log(`Singles: ${report.singles.join(", ") || "none"}`);
	if (Object.keys(report.skippedLines).length) console.log(`Lines that were not JSON, left in the moved files: ${list(report.skippedLines)}`);
	console.log(`Checked: both sides read the same. The old side is in ${report.movedTo}`);
} catch (err) {
	console.error(err instanceof Error ? err.message : String(err));
	process.exit(1);
}
