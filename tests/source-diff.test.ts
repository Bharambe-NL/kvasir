/**
 * Version diff (Kvasir P2-5, D080, D081). "Done when": a fixture with two
 * versions flags exactly the changed propositions. Version 1 is the real
 * DORA file; version 2 is made from it here by four edits:
 *   - Article 28(2): the quoted words reworded         → its citation is outdated ("changed")
 *   - Article 28(3): a sentence added after the quote   → still current
 *   - Article 30(2) point (f): deleted                  → outdated ("removed")
 *   - Article 31: a new last paragraph                  → new text, no citation
 * No network, no model.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { parseEurlex } from "../src/core/source-parse/eurlex.ts";
import { citationStatus, diffUnits, outdatedNodes } from "../src/core/source-diff.ts";
import { sourceDocuments } from "../src/core/sources.ts";
import type { Citation, DocumentVersion, SourceUnit } from "../src/core/contracts.ts";

const XHTML = fs.readFileSync(fileURLToPath(new URL("./fixtures/sources/dora.xhtml", import.meta.url)), "utf8");
const V1_UNITS = parseEurlex(XHTML).units;
const k = (p: readonly string[]) => p.join(" > ");
const A28 = ["Chapter V", "Section I", "Article 28"];
const P28_1 = [...A28, "paragraph 1"];
const P28_2 = [...A28, "paragraph 2"];
const P28_3 = [...A28, "paragraph 3"];
const P30_2F = ["Chapter V", "Section I", "Article 30", "paragraph 2", "point (f)"];
const A31 = ["Chapter V", "Section II", "Article 31"];
/** A paragraph after Article 31's last one. */
const P31_NEW = [...A31, `paragraph ${Math.max(...V1_UNITS.filter((u) => u.path.length === 4 && k(u.path).startsWith(k(A31))).map((u) => Number(u.path[3]!.split(" ")[1]))) + 1}`];
const P5_1 = ["Chapter II", "Section I", "Article 5", "paragraph 1"];

const OLD = "shall adopt, and regularly review, a strategy on ICT third-party risk";
const NEW = "shall adopt a strategy on ICT third-party risk";

/** Version 2's units: the four edits above. */
function v2Units(): SourceUnit[] {
	const units = V1_UNITS.map((u) => ({ ...u, path: [...u.path] }));
	const at = (p: string[]) => units.findIndex((u) => k(u.path) === k(p));
	assert.ok(units[at(P28_2)]!.text.includes(OLD));
	units[at(P28_2)]!.text = units[at(P28_2)]!.text.replace(OLD, NEW);
	units[at(P28_3)]!.text += " This sentence was added in version 2.";
	units.splice(at(P30_2F), 1);
	const lastOf31 = units.map((u) => k(u.path).startsWith(k(A31))).lastIndexOf(true);
	units.splice(lastOf31 + 1, 0, { path: P31_NEW, text: "The ESAs shall review the list of critical ICT third-party service providers every two years." });
	return units;
}

const version = (n: number, date: string): DocumentVersion => ({
	sourceId: "doc_dora00000000",
	versionId: `ver_00000000000${n}`,
	format: "eurlex-html",
	title: "REGULATION (EU) 2022/2554 OF THE EUROPEAN PARLIAMENT AND OF THE COUNCIL of 14 December 2022",
	celex: "32022R2554",
	consolidatedAt: date,
	contentHash: String(n).repeat(64),
	filePath: `dora-v${n}.xhtml`,
	importedAt: `2026-11-0${n}T09:00:00.000Z`,
});
const V1 = version(1, "2022-12-14");
const V2 = version(2, "2024-06-01");
const cite = (nodeId: string, path: string[], quote: string): Citation => ({
	id: `cit_${nodeId}`, nodeId, sourceId: V1.sourceId, version: V1.versionId, path, quote, createdAt: "2026-11-01T09:00:00.000Z",
});

/** Six propositions cited from version 1. */
const CITATIONS = [
	cite("n_28_2", P28_2, "shall adopt, and regularly review, a strategy"),
	cite("n_28_3", P28_3, "financial entities shall maintain and update at entity level"),
	cite("n_30_2f", P30_2F, "the obligation of the ICT third-party service provider to provide assistance"),
	cite("n_r12", ["Recital 12"], "This Regulation aims to consolidate and upgrade"),
	cite("n_5_1", P5_1, "shall have in place an internal governance and control framework"),
	cite("n_28_1", P28_1, "Financial entities shall manage ICT third-party risk"),
];

describe("diffUnits on the DORA fixture (D081)", () => {
	it("finds exactly the four edits", () => {
		const d = diffUnits(V1_UNITS, v2Units());
		assert.deepEqual(d.changed.map(k), [k(P28_2), k(P28_3)]);
		assert.deepEqual(d.removed.map(k), [k(P30_2F)]);
		assert.deepEqual(d.added.map(k), [k(P31_NEW)]);
		assert.equal(d.unchanged.length, V1_UNITS.length - 3);
	});

	it("finds the same change in edited XHTML, through the parser", () => {
		const edited = parseEurlex(XHTML.replace(OLD, NEW)).units;
		const d = diffUnits(V1_UNITS, edited);
		assert.deepEqual(d.changed.map(k), [k(P28_2)]);
		assert.deepEqual([d.added.length, d.removed.length], [0, 0]);
	});

	it("ignores whitespace-only differences", () => {
		const spaced = V1_UNITS.map((u) => ({ ...u, text: u.text.replace(/ /g, "  ") }));
		assert.equal(diffUnits(V1_UNITS, spaced).changed.length, 0);
	});
});

describe("outdated propositions (Done when, D080)", () => {
	const units = new Map<string, SourceUnit[] | null>([[V1.versionId, V1_UNITS], [V2.versionId, v2Units()]]);
	const unitsOf = (v: string) => units.get(v) ?? null;
	const ordered = sourceDocuments([V2, V1])[0]!.versions;

	it("flags exactly the changed and removed citations, pointing at version 2", () => {
		const live = new Set(CITATIONS.map((c) => c.nodeId));
		assert.deepEqual(outdatedNodes(CITATIONS, [V1, V2], unitsOf, live), ["n_28_2", "n_30_2f"]);
		const s28 = citationStatus(CITATIONS[0]!, ordered, unitsOf)!;
		assert.deepEqual({ ...s28, text: undefined }, { versionId: V2.versionId, versionLabel: "2024-06-01", kind: "changed", text: undefined });
		assert.ok(s28.text!.includes(NEW), "the panel gets version 2's text for the unit");
		assert.deepEqual(citationStatus(CITATIONS[2]!, ordered, unitsOf), { versionId: V2.versionId, versionLabel: "2024-06-01", kind: "removed" });
		for (const c of [CITATIONS[1]!, CITATIONS[3]!, CITATIONS[4]!, CITATIONS[5]!]) {
			assert.equal(citationStatus(c, ordered, unitsOf), null, `${c.nodeId} stays current`);
		}
	});

	it("a citation of the newest version is current, and only live nodes are listed", () => {
		assert.equal(citationStatus({ ...CITATIONS[0]!, version: V2.versionId, quote: NEW }, ordered, unitsOf), null);
		assert.deepEqual(outdatedNodes(CITATIONS, [V1, V2], unitsOf, new Set(["n_28_1"])), []);
	});

	it("the newest version decides, and points at the first version that dropped the quote", () => {
		const V3 = version(3, "2025-01-01");
		const restored = new Map(units).set(V3.versionId, V1_UNITS);
		const three = sourceDocuments([V1, V2, V3])[0]!.versions;
		assert.equal(citationStatus(CITATIONS[0]!, three, (v) => restored.get(v) ?? null), null, "restored in version 3: current again");
		const stillGone = new Map(units).set(V3.versionId, v2Units());
		assert.equal(citationStatus(CITATIONS[0]!, three, (v) => stillGone.get(v) ?? null)!.versionLabel, "2024-06-01", "still points at version 2");
	});

	it("skips a later version whose units are not stored", () => {
		const V3 = version(3, "2025-01-01");
		const three = sourceDocuments([V1, V2, V3])[0]!.versions;
		assert.equal(citationStatus(CITATIONS[0]!, three, unitsOf)!.versionLabel, "2024-06-01", "version 3 has no units and is skipped");
		const onlyV1 = (v: string) => (v === V1.versionId ? V1_UNITS : null);
		assert.equal(citationStatus(CITATIONS[0]!, ordered, onlyV1), null, "no later version can be judged: current");
	});
});
