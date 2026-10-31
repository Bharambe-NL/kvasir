/** The desktop:dist signing choice (D020). Pure: nothing runs electron-builder. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { distPlan } from "../scripts/desktop-dist.mjs";

describe("desktop:dist signing comes from the environment", () => {
	it("builds unsigned and unnotarized when no signing variables are set", () => {
		const plan = distPlan({ PATH: "/bin" });
		assert.equal(plan.ok, true);
		if (!plan.ok) return;
		assert.equal(plan.signed, false);
		assert.deepEqual(plan.args, ["--mac", "--arm64", "-c.mac.notarize=false"]);
		assert.equal(plan.env.CSC_IDENTITY_AUTO_DISCOVERY, "false");
		assert.equal(plan.env.DEVELOPER_DIR, "/Applications/Xcode.app/Contents/Developer");
		assert.equal(plan.env.PATH, "/bin");
	});

	it("signs and notarizes when both signing variables are set", () => {
		const plan = distPlan({ APPLE_TEAM_ID: "TEAM123456", APPLE_KEYCHAIN_PROFILE: "KV_NOTARY", DEVELOPER_DIR: "/custom/Xcode" });
		assert.equal(plan.ok, true);
		if (!plan.ok) return;
		assert.equal(plan.signed, true);
		assert.deepEqual(plan.args, ["--mac", "--arm64"]);
		assert.equal(plan.env.CSC_IDENTITY_AUTO_DISCOVERY, undefined);
		assert.equal(plan.env.APPLE_TEAM_ID, "TEAM123456");
		assert.equal(plan.env.DEVELOPER_DIR, "/custom/Xcode");
	});

	for (const only of ["APPLE_TEAM_ID", "APPLE_KEYCHAIN_PROFILE"] as const) {
		it(`fails when only ${only} is set`, () => {
			const plan = distPlan({ [only]: "x" });
			assert.equal(plan.ok, false);
			if (plan.ok) return;
			assert.match(plan.error, new RegExp(`${only} is set but`));
		});
	}

	it("package.json carries no upstream signing identity", () => {
		const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
		const dist: string = pkg.scripts["desktop:dist"];
		assert.match(dist, /node scripts\/desktop-dist\.mjs$/);
		assert.doesNotMatch(dist, /APPLE_TEAM_ID=|APPLE_KEYCHAIN_PROFILE=|JS6XN22HY6|LH_NOTARY/);
	});
});
