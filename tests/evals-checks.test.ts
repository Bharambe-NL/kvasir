/**
 * The teaching-eval checks, transcript and scenarios (Kvasir P6-4, D095,
 * D096): each deterministic check passing and failing on hand-built
 * transcripts, the judge's transcript text, and every scenario file well
 * formed with the fixture it needs. No network, no model.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { CHECKS, runChecks } from "../src/evals/checks.ts";
import { transcriptText } from "../src/evals/transcript.ts";
import { RUBRIC } from "../src/evals/rubric.ts";
import type { LhMessage } from "../src/core/native-messages.ts";
import type { Scenario } from "../src/evals/types.ts";

const REPO = fileURLToPath(new URL("..", import.meta.url));
const call = (name: string, args: Record<string, unknown> = {}) => ({ role: "assistant", content: [{ type: "toolCall", id: `c_${name}`, name, arguments: args }] }) as unknown as LhMessage;
const text = (t: string, extra: Record<string, unknown> = {}) => ({ role: "assistant", content: [{ type: "text", text: t }], ...extra }) as unknown as LhMessage;
const user = (t: string) => ({ role: "user", content: t }) as unknown as LhMessage;
const answer = (tool: string, details: Record<string, unknown>) => ({ role: "toolResult", toolName: tool, details }) as unknown as LhMessage;
const LINK = "[Regulation (EU) 2022/2554, Art. 28(2)](#src-ver_dfa4295bb03c-U455)";

describe("the deterministic checks (D095)", () => {
	const ok = [call("probe"), call("probe_done"), text(`Firms stay responsible ${LINK}.`), call("quiz")];
	it("pass on a session that hands off, quizzes, cites and has no failed turn", () => {
		const r = runChecks(["handoff", "taught_with_checks", "no_failed_turns", "citations"], ok, () => true);
		assert.deepEqual(r.map((c) => [c.id, c.pass]), [["handoff", true], ["taught_with_checks", true], ["no_failed_turns", true], ["citations", true]]);
		assert.equal(r[3]!.detail, "1 link, 0 not resolving");
	});
	it("fail when each is missing", () => {
		const r = runChecks(["handoff", "taught_with_checks", "no_failed_turns", "citations"], [call("probe"), call("quiz"), text("No links here.", { stopReason: "error" })], () => true);
		assert.deepEqual(r.map((c) => [c.id, c.pass, c.detail]), [
			["handoff", false, "the prober never called probe_done"],
			["taught_with_checks", false, "0 quiz calls after the handoff"],
			["no_failed_turns", false, "1 failed turn"],
			["citations", false, "no citation link in the teacher's text"],
		]);
	});
	it("a link that does not resolve fails citations; send_to_user prose counts", () => {
		const viaTool = [call("send_to_user", { message: `See ${LINK}.` })];
		assert.equal(runChecks(["citations"], viaTool, () => true)[0]!.pass, true);
		assert.equal(runChecks(["citations"], viaTool, () => false)[0]!.detail, "1 link, 1 not resolving");
	});
	it("an unknown check id fails loudly", () => {
		assert.deepEqual(runChecks(["nope"], ok, () => true), [{ id: "nope", pass: false, detail: 'unknown check "nope"' }]);
	});
});

describe("the transcript the judge reads", () => {
	it("shows the learner, the tutor's prose and questions, the answers, and other tools by name", () => {
		const t = transcriptText([
			user("Teach me Bayes."),
			call("send_to_user", { message: "Let us start with a test." }),
			call("quiz", { question: "Which is P(D|+)?", options: [{ label: "0.99" }, { label: "0.09" }] }),
			answer("quiz", { answers: [{ label: "0.99", value: "a", index: 1 }], confidence: 70, thinking: "the test is 99% accurate" }),
			call("plan_init"),
		]);
		assert.equal(
			t,
			[
				"LEARNER: Teach me Bayes.",
				"TUTOR: Let us start with a test.",
				"TUTOR asks (quiz): Which is P(D|+)?\n  A. 0.99\n  B. 0.09",
				"LEARNER answers: 0.99 (confidence 70%) (thinking: the test is 99% accurate)",
				"(tutor used plan_init)",
			].join("\n\n"),
		);
		assert.equal(transcriptText([answer("probe", { dontKnow: true })]), "LEARNER answers: I don't know.");
	});
});

describe("the scenarios (D096)", () => {
	const dir = path.join(REPO, "evals", "scenarios");
	const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json")).sort();
	it("are the three first scenarios, each well formed with known rubric and check ids", () => {
		assert.deepEqual(files, ["bayes.json", "dora-art28.json", "fast-learner.json"]);
		for (const f of files) {
			const s = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")) as Scenario;
			assert.equal(`${s.id}.json`, f);
			for (const k of ["title", "persona", "opening"] as const) assert.ok(s[k].trim().length > 10, `${f} ${k}`);
			for (const r of s.rubric) assert.ok(RUBRIC[r], `${f}: rubric ${r}`);
			for (const c of s.checks) assert.ok(CHECKS[c], `${f}: check ${c}`);
			for (const common of ["probes_first", "one_step", "checks_landing", "accuracy"]) assert.ok(s.rubric.includes(common), `${f} has ${common}`);
		}
	});
	it("the fixture has what the source scenarios need", () => {
		const graph = path.join(REPO, "evals", "fixtures", "data", "graph");
		const versions = fs.readFileSync(path.join(graph, "documents.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
		assert.equal(versions.length, 1);
		assert.ok(fs.existsSync(path.join(graph, "document-units", `${versions[0].versionId}.json`)));
		assert.equal(fs.readFileSync(path.join(graph, "citations.jsonl"), "utf8").trim().split("\n").length, 258);
	});
});
