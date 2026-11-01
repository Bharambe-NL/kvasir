/**
 * The store migration (Kvasir P6-1, D109, D111) on a temp copy of the golden
 * data plus learner ledgers and DORA units: files to SQLite reads back the
 * same through every port, with the files moved aside; SQLite back to files
 * reads the same again and leaves the ledger files byte-identical. Each
 * refusal leaves the folder as it was. No network.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { after, describe, it } from "node:test";

const GOLDEN = fileURLToPath(new URL("./fixtures/golden-data", import.meta.url));
const DORA = fileURLToPath(new URL("../evals/fixtures/data/graph/document-units/ver_dfa4295bb03c.json", import.meta.url));
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), "kv-migrate-"));
fs.cpSync(GOLDEN, DATA, { recursive: true });
process.env.KV_DATA_DIR = DATA;
after(() => fs.rmSync(DATA, { recursive: true, force: true }));

const { fileBackend } = await import("../src/store/file-backend.ts");
const { sqliteBackend } = await import("../src/store/sqlite/backend.ts");
const { openDatabase } = await import("../src/store/sqlite/db.ts");
const { DB_FILE } = await import("../src/store/active.ts");
const { migrateToFiles, migrateToSqlite } = await import("../src/store/migrate.ts");
const { createGraphStore } = await import("../src/store/graph.ts");
const { createChatStore } = await import("../src/store/chats.ts");
const { createJobStore } = await import("../src/store/jobs.ts");
const { createLearnerStore } = await import("../src/store/learner.ts");
type StoreBackend = import("../src/store/backend.ts").StoreBackend;

// Learner ledgers and document units, so every table has rows.
const files0 = { graph: createGraphStore(fileBackend), learner: createLearnerStore(fileBackend) };
files0.learner.appendReview({ id: "rv_1", nodeId: files0.graph.readNodes()[0]!.id, rating: 3, reviewedAt: "2026-11-01T09:00:00.000Z" });
files0.learner.appendExclusion({ id: "rx_1", sessionId: "chat_x", excluded: true, at: "2026-11-01T09:00:00.000Z" });
files0.graph.writeDocumentUnits("ver_dfa4295bb03c", JSON.parse(fs.readFileSync(DORA, "utf8")).units);
files0.graph.writePositions({ n_a: { x: 1, y: 2 } });

/** Everything the ports return, as one comparable value. */
function readAll(backend: StoreBackend) {
	const graph = createGraphStore(backend);
	const chats = createChatStore(backend);
	const jobs = createJobStore(backend);
	const learner = createLearnerStore(backend);
	const chatList = chats.listChats();
	return {
		nodes: graph.readNodes(),
		chains: graph.readChains(),
		checkpoints: graph.readCheckpoints(),
		coverage: graph.readCoverage(),
		versions: graph.readDocumentVersions(),
		citations: graph.readCitations(),
		units: graph.readDocumentUnits("ver_dfa4295bb03c"),
		sources: graph.readSources(),
		positions: graph.readPositions(),
		chatList,
		chats: chatList.map((c) => chats.getChat(c.id)),
		jobsByChat: chatList.map((c) => jobs.listJobs(c.id)),
		jobs: [...backend.recordIds("jobs")].sort().map((id) => jobs.getJob(id)),
		reviews: learner.readReviews(),
		questions: learner.readQuestions(),
		exclusions: learner.readExclusions(),
	};
}

const ledgerBytes = () => Object.fromEntries(["graph/nodes.jsonl", "graph/chains.jsonl", "graph/coverage.jsonl", "graph/sessions.jsonl", "learner/reviews.jsonl", "learner/exclusions.jsonl"].filter((f) => fs.existsSync(path.join(DATA, f))).map((f) => [f, fs.readFileSync(path.join(DATA, f), "utf8")]));
const before = readAll(fileBackend);
const beforeBytes = ledgerBytes();
const at = (h: number) => new Date(2026, 10, 1, h, 0, 0);

describe("files to SQLite and back (D109)", () => {
	it("the golden copy has rows for every kind of record", () => {
		assert.ok(before.nodes.length > 200 && before.chains.length > 0 && before.coverage.length > 0 && before.chatList.length > 0);
		assert.equal(before.jobs.length, 5, "jobs, including two whose chat is gone");
		assert.ok(before.units!.length === 876 && before.reviews.length === 1 && before.exclusions.length === 1);
	});

	it("refuses to go to files when there is no database", () => {
		assert.throws(() => migrateToFiles(at(9)), /does not exist/);
	});

	it("a check failure leaves no database and the files in place", () => {
		const real = fileBackend.readLines;
		let calls = 0;
		fileBackend.readLines = (ledger) => (ledger === "nodes" && ++calls > 1 ? [] : real(ledger));
		try {
			assert.throws(() => migrateToSqlite(at(9)), /Migration check failed: ledger nodes differs/);
		} finally {
			fileBackend.readLines = real;
		}
		assert.equal(fs.existsSync(DB_FILE), false);
		assert.equal(fs.existsSync(`${DB_FILE}.partial`), false);
		assert.deepEqual(ledgerBytes(), beforeBytes);
	});

	it("to SQLite: every port reads the same, and the files are moved aside", () => {
		const report = migrateToSqlite(at(10));
		assert.equal(report.ledgers.nodes, before.nodes.length);
		assert.equal(report.records.chats, before.chatList.length);
		assert.deepEqual([report.records.jobs, report.records.units], [5, 1]);
		assert.equal(path.basename(report.movedTo), "pre-sqlite-2026-11-01-100000");
		assert.ok(fs.existsSync(DB_FILE));
		for (const gone of ["graph/nodes.jsonl", "graph/sources.json", "graph/positions.json", "graph/document-units", "chats", "jobs", "learner/reviews.jsonl"]) {
			assert.equal(fs.existsSync(path.join(DATA, gone)), false, gone);
			assert.ok(fs.existsSync(path.join(report.movedTo, gone)), `${gone} moved`);
		}
		for (const kept of ["settings.json", "graph/render-settings.json"]) assert.ok(fs.existsSync(path.join(DATA, kept)), `${kept} stays`);
		const db = openDatabase(DB_FILE);
		assert.deepEqual(readAll(sqliteBackend(db)), before);
		db.close();
	});

	it("refuses a second migration to SQLite", () => {
		assert.throws(() => migrateToSqlite(at(11)), /already exists/);
	});

	it("refuses to go back while files sit where it would write", () => {
		fs.mkdirSync(path.join(DATA, "chats"));
		try {
			assert.throws(() => migrateToFiles(at(11)), /Files already exist .*chats/);
		} finally {
			fs.rmdirSync(path.join(DATA, "chats"));
		}
		assert.ok(fs.existsSync(DB_FILE));
	});

	it("back to files: every port reads the same and the ledger files are byte-identical", () => {
		const report = migrateToFiles(at(12));
		assert.equal(path.basename(report.movedTo), "pre-files-2026-11-01-120000");
		assert.equal(fs.existsSync(DB_FILE), false);
		assert.ok(fs.existsSync(path.join(report.movedTo, "kvasir.db")));
		assert.deepEqual(readAll(fileBackend), before);
		assert.deepEqual(ledgerBytes(), beforeBytes);
	});
});
