/**
 * The storage switch (Kvasir P6-1, D108), files side: src/server/stores.ts
 * runs on SQLite only when data/kvasir.db exists. stores.ts picks once at
 * import, so the other side is tests/stores-switch-sqlite.test.ts.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { after, it } from "node:test";

const DATA = fs.mkdtempSync(path.join(os.tmpdir(), "kv-switch-files-"));
process.env.KV_DATA_DIR = DATA;
after(() => fs.rmSync(DATA, { recursive: true, force: true }));

const { stores } = await import("../src/server/stores.ts");
const { DB_FILE } = await import("../src/store/active.ts");

it("without data/kvasir.db the stores write the files", () => {
	const chat = stores.chatStore.createChat("A");
	stores.graphStore.appendNode({ id: "n_a", name: "A", statement: "A holds.", aliases: [], createdAt: "2026-11-01T09:00:00.000Z", provenance: [{ chatId: chat.id, messageId: "m1" }] });
	assert.equal(fs.existsSync(DB_FILE), false);
	assert.ok(fs.existsSync(path.join(DATA, "chats", `${chat.id}.json`)));
	assert.equal(fs.readFileSync(path.join(DATA, "graph", "nodes.jsonl"), "utf8").trim().split("\n").length, 1);
});
