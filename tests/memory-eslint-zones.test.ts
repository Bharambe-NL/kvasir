/**
 * The Memory system's ESLint zones (P1-1, D030): the learner adapter and the
 * graph adapter never import each other. Lints virtual sources at the real
 * file paths through the repository's own eslint.config.mjs, so the test
 * fails if a zone is removed or stops matching.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { ESLint } from "eslint";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const eslint = new ESLint({ cwd: ROOT });

async function zoneErrors(file: string, source: string): Promise<string[]> {
	const [result] = await eslint.lintText(source, { filePath: `${ROOT}${file}` });
	return (result?.messages ?? [])
		.filter((m) => m.ruleId === "import/no-restricted-paths")
		.map((m) => m.message);
}

describe("Memory ESLint zones (D030)", () => {
	it("the learner adapter may not import the graph adapter", async () => {
		const errors = await zoneErrors("src/store/learner.ts", 'import { graphStore } from "./graph.ts";\nexport const x = graphStore;\n');
		assert.equal(errors.length, 1);
		assert.match(errors[0]!, /never writes the graph \(D030\)/);
	});

	it("the learner adapter may not import the graph format stamp", async () => {
		const errors = await zoneErrors("src/store/learner.ts", 'import { ensureGraphFormat } from "./graph-format.ts";\nexport const x = ensureGraphFormat;\n');
		assert.equal(errors.length, 1);
	});

	it("the graph adapter may not import learner state", async () => {
		const errors = await zoneErrors("src/store/graph.ts", 'import { learnerStore } from "./learner.ts";\nexport const x = learnerStore;\n');
		assert.equal(errors.length, 1);
		assert.match(errors[0]!, /graph stays objective \(D030\)/);
	});

	it("the learner adapter may import config and core contracts", async () => {
		const errors = await zoneErrors(
			"src/store/learner.ts",
			'import { LEARNER_FILES } from "../../config.ts";\nimport { isReviewEntry } from "../core/contracts/learner.ts";\nexport const x = [LEARNER_FILES, isReviewEntry];\n',
		);
		assert.deepEqual(errors, []);
	});
});
