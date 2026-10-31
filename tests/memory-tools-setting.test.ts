/** The Memory tools setting (P1-7, D050): its own agent subsection,
 *  absent = on, and the effective gate also needs the graph on. */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { memoryToolsEnabled, resolveSettings } from "../src/core/settings-resolution.ts";
import { sanitizeUserSettings } from "../src/core/settings.ts";
import { parseAgentSettingsBody } from "../src/server/settings-body.ts";

describe("memoryToolsEnabled (D050)", () => {
	it("needs the graph on, and the toggle on or absent", () => {
		const gate = (graph: boolean, memory: boolean | undefined) =>
			memoryToolsEnabled({ graph: { enabled: graph }, agent: { memoryTools: memory === undefined ? {} : { enabled: memory } } });
		assert.equal(gate(true, undefined), true, "absent = on");
		assert.equal(gate(true, true), true);
		assert.equal(gate(true, false), false);
		assert.equal(gate(false, undefined), false, "graph off closes it");
		assert.equal(gate(false, true), false);
	});

	it("resolves from a settings record, defaulting on, independent of graphTools", () => {
		assert.equal(memoryToolsEnabled(resolveSettings(null)), true);
		const off = resolveSettings(sanitizeUserSettings({ version: 1, agent: { memoryTools: { enabled: false }, graphTools: { enabled: true } } }));
		assert.equal(memoryToolsEnabled(off), false);
		const onWithGraphToolsOff = resolveSettings(sanitizeUserSettings({ version: 1, agent: { graphTools: { enabled: false } } }));
		assert.equal(memoryToolsEnabled(onWithGraphToolsOff), true);
	});
});

describe("memoryTools on read and save", () => {
	it("reads leniently: a bad shape drops the key and the default resumes", () => {
		assert.deepEqual(sanitizeUserSettings({ version: 1, agent: { memoryTools: { enabled: false } } })?.agent?.memoryTools, { enabled: false });
		assert.equal(sanitizeUserSettings({ version: 1, agent: { memoryTools: "off" } })?.agent?.memoryTools, undefined);
	});

	it("saves strictly: an object with a boolean enabled, or nothing", () => {
		const ok = parseAgentSettingsBody({ memoryTools: { enabled: false } });
		assert.ok(ok.ok && ok.settings.memoryTools?.enabled === false);
		assert.equal(parseAgentSettingsBody({ memoryTools: "off" }).ok, false);
		assert.equal(parseAgentSettingsBody({ memoryTools: { enabled: "no" } }).ok, false);
	});
});
