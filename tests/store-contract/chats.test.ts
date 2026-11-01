/** ChatStore contract (Kvasir P6-1, D111), run against both adapters. */
import { ADAPTERS } from "./harness.ts";
import assert from "node:assert/strict";
import { describe, it } from "node:test";

const { subscribe } = await import("../../src/core/events.ts");
const user = (text: string) => ({ role: "user", content: text, timestamp: 1 }) as never;
const tick = () => new Promise((r) => setTimeout(r, 5));

for (const adapter of ADAPTERS) {
	describe(`ChatStore on ${adapter.name}`, () => {
		it("creates, reads and lists chats; titles fall back; practice keeps its marker", () => {
			const { chats } = adapter.fresh();
			const a = chats.createChat("  Ohm's law  ");
			const b = chats.createChat("   ", "practice");
			assert.equal(a.title, "Ohm's law");
			assert.equal(b.title, "Untitled session");
			assert.equal(a.version, 1);
			assert.deepEqual(chats.getChat(a.id), { ...a });
			assert.equal(chats.getChat(b.id)!.kind, "practice");
			assert.equal(chats.getChat("chat_missing"), null);
			assert.equal(chats.getChat("../etc/passwd"), null);
			const list = chats.listChats();
			assert.deepEqual(new Set(list.map((c) => c.id)), new Set([a.id, b.id]));
			assert.deepEqual(new Set(list.map((c) => c.kind)), new Set(["teach", "practice"]));
			assert.ok(list.every((c) => c.messageCount === 0 && !("messages" in c)));
		});

		it("saveMessages bumps updatedAt and the list order; tree, settings and rename do not", async () => {
			const { chats } = adapter.fresh();
			const a = chats.createChat("A");
			await tick();
			const b = chats.createChat("B");
			assert.deepEqual(chats.listChats().map((c) => c.id), [b.id, a.id]);
			await tick();
			chats.saveMessages(a.id, [user("hi")]);
			const afterMessages = chats.getChat(a.id)!;
			assert.equal(afterMessages.messages.length, 1);
			assert.ok(afterMessages.updatedAt > a.updatedAt);
			assert.deepEqual(chats.listChats().map((c) => c.id), [a.id, b.id]);
			assert.equal(chats.listChats()[0]!.messageCount, 1);
			chats.saveTree(b.id, { nodes: [], edges: [] } as never);
			chats.saveSettings(b.id, { model: { provider: "openrouter", id: "x" } });
			const renamed = chats.renameChat(b.id, " B2 ");
			assert.equal(renamed.title, "B2");
			const bNow = chats.getChat(b.id)!;
			assert.equal(bNow.updatedAt, b.updatedAt);
			assert.deepEqual(bNow.tree, { nodes: [], edges: [] });
			assert.deepEqual(bNow.settings, { model: { provider: "openrouter", id: "x" } });
			assert.throws(() => chats.saveMessages("chat_missing", []), /Chat not found/);
			assert.throws(() => chats.renameChat("chat_missing", "x"), /Chat not found/);
		});

		it("usage logs append once per turn id and per extraction run", () => {
			const { chats } = adapter.fresh();
			const a = chats.createChat("A");
			const turn = { id: "turn_1", model: "m", steps: [] } as never;
			const run = { startedAt: "2026-11-01T09:00:00.000Z", model: "m", calls: [] } as never;
			chats.appendTurnUsage(a.id, turn);
			chats.appendTurnUsage(a.id, turn);
			chats.appendExtractionUsage(a.id, run);
			chats.appendExtractionUsage(a.id, run);
			const rec = chats.getChat(a.id)!;
			assert.deepEqual([rec.turns?.length, rec.extractions?.length], [1, 1]);
			assert.ok(!("turns" in chats.listChats()[0]!), "usage stays out of the list");
		});

		it("deleteChat removes once; a record from a newer build reads as absent", () => {
			const { chats, backend } = adapter.fresh();
			const a = chats.createChat("A");
			assert.equal(chats.deleteChat(a.id), true);
			assert.equal(chats.deleteChat(a.id), false);
			assert.equal(chats.getChat(a.id), null);
			backend.putRecord("chats", "chat_future", { id: "chat_future", title: "F", createdAt: "x", updatedAt: "x", messages: [], version: 99 });
			const err = console.error;
			console.error = () => {};
			try {
				assert.equal(chats.getChat("chat_future"), null);
				assert.deepEqual(chats.listChats(), []);
			} finally {
				console.error = err;
			}
		});

		it("announces chats-changed for create, rename and real deletes only", () => {
			const { chats } = adapter.fresh();
			const seen: string[] = [];
			const off = subscribe((e) => void (e.type === "chats-changed" && seen.push(e.type)));
			try {
				const a = chats.createChat("A");
				chats.saveMessages(a.id, [user("hi")]);
				chats.saveSettings(a.id, {});
				chats.renameChat(a.id, "B");
				chats.deleteChat(a.id);
				chats.deleteChat(a.id);
			} finally {
				off();
			}
			assert.equal(seen.length, 3);
		});
	});
}
