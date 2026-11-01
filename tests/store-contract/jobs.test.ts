/** JobStore contract (Kvasir P6-1, D111), run against both adapters. */
import { ADAPTERS } from "./harness.ts";
import assert from "node:assert/strict";
import { describe, it } from "node:test";

const { subscribe } = await import("../../src/core/events.ts");

for (const adapter of ADAPTERS) {
	describe(`JobStore on ${adapter.name}`, () => {
		it("creates, reads and updates jobs; identity stays, updatedAt follows the patch", () => {
			const { jobs } = adapter.fresh();
			const j = jobs.createJob({ kind: "research", chatId: "chat_a", toolCallId: "call_1", input: { q: 1 } } as never);
			assert.equal(j.status, "running");
			assert.equal(j.activity, "starting");
			assert.deepEqual(jobs.getJob(j.id), j);
			const u = jobs.updateJob(j.id, { activity: "reading", updatedAt: "2030-01-01T00:00:00.000Z" })!;
			assert.deepEqual({ ...u, activity: undefined, updatedAt: undefined }, { ...j, activity: undefined, updatedAt: undefined });
			assert.equal(u.updatedAt, "2030-01-01T00:00:00.000Z");
			assert.equal(jobs.updateJob("job_missing", { activity: "x" }), null);
			assert.equal(jobs.getJob("job_missing"), null);
		});

		it("lists a chat's jobs newest first, finds by tool call, deletes per chat", () => {
			const { jobs } = adapter.fresh();
			const a = jobs.createJob({ kind: "research", chatId: "chat_a", toolCallId: "call_1" } as never);
			const b = jobs.createJob({ kind: "research", chatId: "chat_a", toolCallId: "call_2" } as never);
			const other = jobs.createJob({ kind: "research", chatId: "chat_b", toolCallId: "call_1" } as never);
			jobs.updateJob(a.id, { updatedAt: "2030-01-01T00:00:00.000Z" });
			jobs.updateJob(b.id, { updatedAt: "2029-01-01T00:00:00.000Z" });
			assert.deepEqual(jobs.listJobs("chat_a").map((j) => j.id), [a.id, b.id]);
			assert.equal(jobs.findJobByToolCallId("chat_a", "call_2")!.id, b.id);
			assert.equal(jobs.findJobByToolCallId("chat_b", "call_1")!.id, other.id);
			assert.equal(jobs.findJobByToolCallId("chat_a", "call_9"), null);
			assert.equal(jobs.deleteJobsForChat("chat_a"), 2);
			assert.equal(jobs.deleteJobsForChat("chat_a"), 0);
			assert.deepEqual(jobs.listJobs("chat_a"), []);
			assert.equal(jobs.listJobs("chat_b").length, 1);
		});

		it("announces jobs-changed after each write, never for a delete of nothing", () => {
			const { jobs } = adapter.fresh();
			const seen: string[] = [];
			const off = subscribe((e) => void (e.type === "jobs-changed" && seen.push((e as { chatId: string }).chatId)));
			try {
				const j = jobs.createJob({ kind: "research", chatId: "chat_a", toolCallId: "call_1" } as never);
				jobs.updateJob(j.id, { activity: "x" });
				jobs.updateJob("job_missing", { activity: "x" });
				jobs.deleteJobsForChat("chat_a");
				jobs.deleteJobsForChat("chat_a");
			} finally {
				off();
			}
			assert.deepEqual(seen, ["chat_a", "chat_a", "chat_a"]);
		});
	});
}
