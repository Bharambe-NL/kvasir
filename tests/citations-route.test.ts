/**
 * Citation views (Kvasir P2-4, D076 to D078) over a temp copy of the golden
 * data through the real stores: GET /api/graph/citations, the snapshot's
 * `citations` map, and the write-once units file. No network, no model.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { after, describe, it } from "node:test";

const GOLDEN = fileURLToPath(new URL("./fixtures/golden-data", import.meta.url));
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "kv-citations-route-"));
fs.cpSync(GOLDEN, TMP, { recursive: true });
process.env.KV_DATA_DIR = TMP;
process.env.KV_AUTH_FILE = path.join(TMP, "auth.json");

const { GET } = await import("../app/api/graph/citations/route.ts");
const { stores } = await import("../src/server/stores.ts");
const { graphSnapshot } = await import("../src/core/graph.ts");
const { DOCUMENT_UNITS_DIR } = await import("../config.ts");
const { eurlexSourceId, versionIdFor, contentHashOf } = await import("../src/core/source-ids.ts");
type DocumentVersion = import("../src/core/contracts.ts").DocumentVersion;

after(() => fs.rmSync(TMP, { recursive: true, force: true }));

const g = stores.graphStore;
const [n1, n2, n3] = [...new Set(g.readNodes().map((n) => n.id))];
const DORA = eurlexSourceId("32022R2554");
const V1: DocumentVersion = {
	sourceId: DORA, versionId: versionIdFor(DORA, contentHashOf("a")), format: "eurlex-html",
	title: "REGULATION (EU) 2022/2554 OF THE EUROPEAN PARLIAMENT AND OF THE COUNCIL of 14 December 2022 on digital operational resilience",
	celex: "32022R2554", consolidatedAt: "2022-12-14", contentHash: contentHashOf("a"), filePath: "dora.xhtml", importedAt: "2026-11-01T09:00:00.000Z",
};
const V2: DocumentVersion = { ...V1, versionId: versionIdFor(DORA, contentHashOf("b")), contentHash: contentHashOf("b"), consolidatedAt: "2024-01-17" };
const PARA = ["Chapter V", "Section I", "Article 28", "paragraph 2"];
const TEXT = "As part of their ICT risk management framework, financial entities shall adopt, and regularly review, a strategy on ICT third-party risk.";
g.appendDocumentVersion(V1);
g.appendDocumentVersion(V2);
g.writeDocumentUnits(V1.versionId, [
	{ path: ["Chapter V", "Section I", "Article 28"], heading: "General principles", text: "" },
	{ path: PARA, text: TEXT },
]);
g.appendCitation({ id: "cit_aaaaaaaaaaaa", nodeId: n1!, sourceId: DORA, version: V1.versionId, path: PARA, quote: "shall adopt, and regularly review, a strategy", createdAt: "2026-11-01T09:00:00.000Z" });
g.appendCitation({ id: "cit_bbbbbbbbbbbb", nodeId: n1!, sourceId: DORA, version: V2.versionId, path: ["Recital 12"], quote: "This Regulation aims to consolidate", createdAt: "2026-11-01T09:00:00.000Z" });
g.appendCitation({ id: "cit_cccccccccccc", nodeId: "n_deleted", sourceId: DORA, version: V1.versionId, path: PARA, quote: "a strategy on ICT third-party", createdAt: "2026-11-01T09:00:00.000Z" });

const get = async (ids: string) => (await GET(new Request(`http://localhost/api/graph/citations?nodeIds=${ids}`))).json();

describe("GET /api/graph/citations", () => {
	it("returns each node's citation views, with unit text where stored", async () => {
		const body = await get(`${n1},${n2}`);
		assert.deepEqual(Object.keys(body), [n1]);
		const [a, b] = body[n1!];
		assert.deepEqual(a, {
			id: "cit_aaaaaaaaaaaa", nodeId: n1, label: "Regulation (EU) 2022/2554, Art. 28(2)",
			documentTitle: V2.title, versionLabel: "2022-12-14", path: PARA,
			quote: "shall adopt, and regularly review, a strategy", unitText: TEXT,
		});
		assert.equal(b.label, "Regulation (EU) 2022/2554, Recital 12");
		assert.equal(b.versionLabel, "2024-01-17");
		assert.equal(b.unitText, null, "the second version's units were never stored");
	});
	it("returns {} for no ids or uncited nodes", async () => {
		assert.deepEqual(await get(""), {});
		assert.deepEqual(await get(n3!), {});
	});
});

describe("the snapshot's citations map (D077)", () => {
	it("lists chip labels for cited live propositions only", () => {
		const snap = graphSnapshot(stores);
		assert.deepEqual(snap.citations, { [n1!]: ["Regulation (EU) 2022/2554, Art. 28(2)", "Regulation (EU) 2022/2554, Recital 12"] });
	});
});

describe("the units file (D076)", () => {
	it("is written once and never changed", () => {
		const file = path.join(DOCUMENT_UNITS_DIR, `${V1.versionId}.json`);
		const before = fs.readFileSync(file, "utf8");
		g.writeDocumentUnits(V1.versionId, [{ path: ["x"], text: "different" }]);
		assert.equal(fs.readFileSync(file, "utf8"), before);
		assert.equal(g.readDocumentUnits(V1.versionId)![1]!.text, TEXT);
		assert.equal(g.readDocumentUnits(V2.versionId), null);
		// An id that is not "ver_" + 12 hex never becomes a path.
		assert.equal(g.readDocumentUnits("../../etc/passwd"), null);
		assert.throws(() => g.writeDocumentUnits("../escape", []), /invalid version id/);
	});
});
