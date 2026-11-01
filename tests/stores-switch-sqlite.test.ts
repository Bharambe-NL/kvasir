/**
 * The storage switch (Kvasir P6-1, D108), sqlite side: src/server/stores.ts
 * runs on SQLite only when data/kvasir.db exists. stores.ts picks once at
 * import, so the other side is tests/stores-switch-files.test.ts.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { after, it } from "node:test";

const DATA = fs.mkdtempSync(path.join(os.tmpdir(), "kv-switch-sqlite-"));
process.env.KV_DATA_DIR = DATA;
after(() => fs.rmSync(DATA, { recursive: true, force: true }));

const { openDatabase } = await import("../src/store/sqlite/db.ts");
openDatabase(path.join(DATA, "kvasir.db")).close();
const { stores } = await import("../src/server/stores.ts");

it("with data/kvasir.db the stores write the database, not the files", () => {
	const chat = stores.chatStore.createChat("A");
	stores.graphStore.appendNode({ id: "n_a", name: "A", statement: "A holds.", aliases: [], createdAt: "2026-11-01T09:00:00.000Z", provenance: [{ chatId: chat.id, messageId: "m1" }] });
	stores.learnerStore.appendReview({ id: "rv_1", nodeId: "n_a", rating: 3, reviewedAt: "2026-11-01T09:00:00.000Z" });
	assert.equal(fs.existsSync(path.join(DATA, "chats")), false);
	assert.equal(fs.existsSync(path.join(DATA, "graph", "nodes.jsonl")), false);
	assert.equal(fs.existsSync(path.join(DATA, "learner")), false);
	const db = openDatabase(path.join(DATA, "kvasir.db"), { readOnly: true });
	const count = (t: string) => (db.prepare(`SELECT count(*) AS n FROM ${t}`).get() as { n: number }).n;
	assert.deepEqual([count("chats"), count("nodes"), count("reviews")], [1, 1, 1]);
	assert.equal(stores.chatStore.getChat(chat.id)!.title, "A");
	db.close();
});
