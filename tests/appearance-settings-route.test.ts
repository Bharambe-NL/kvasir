/**
 * The appearance settings through the real route (Kvasir P7-2, P7-3):
 * PUT /api/settings/appearance keeps mode "system", lightBackground, theme
 * and highlight, and they read back from settings.json. Before this test
 * the route's own validator refused "system" and dropped the other three,
 * so they never saved. No network.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { after, describe, it } from "node:test";

const DATA = fs.mkdtempSync(path.join(os.tmpdir(), "kv-appearance-route-"));
process.env.KV_DATA_DIR = DATA;
after(() => fs.rmSync(DATA, { recursive: true, force: true }));

const { PUT } = await import("../app/api/settings/[section]/route.ts");
const { effectiveSettings } = await import("../src/server/stores.ts");

const put = (body: unknown) =>
	PUT(new Request("http://test/api/settings/appearance", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }), {
		params: Promise.resolve({ section: "appearance" }),
	});

describe("PUT /api/settings/appearance", () => {
	it("saves mode system, the light background, the theme and the highlight", async () => {
		const res = await put({ mode: "system", lightBackground: "#fafafa", theme: "eink", highlight: "#3b6fd8" });
		assert.equal(res.status, 200, await res.clone().text());
		const saved = JSON.parse(fs.readFileSync(path.join(DATA, "settings.json"), "utf8")).appearance;
		assert.deepEqual(saved, { mode: "system", lightBackground: "#fafafa", theme: "eink", highlight: "#3b6fd8" });
		const a = effectiveSettings().appearance;
		assert.deepEqual([a.mode, a.lightBackground, a.theme, a.highlight], ["system", "#fafafa", "eink", "#3b6fd8"]);
	});
	it("refuses unknown values with a reason", async () => {
		for (const [body, msg] of [
			[{ mode: "sepia" }, /mode must be "dark", "light" or "system"/],
			[{ theme: "neon" }, /theme must be one of "kvasir", "sepia", "forest", "eink"/],
			[{ highlight: "blue" }, /highlight must be a #hex color or null/],
			[{ lightBackground: 3 }, /lightBackground must be a #hex color or null/],
		] as const) {
			const res = await put(body);
			assert.equal(res.status, 400);
			assert.match((await res.json()).error, msg);
		}
	});
});
