/**
 * desktop-dist.mjs — the electron-builder step of `npm run desktop:dist`.
 *
 * Signing comes from the environment (D020). With APPLE_TEAM_ID and
 * APPLE_KEYCHAIN_PROFILE both set, electron-builder signs with the
 * Developer ID certificate in the login keychain and notarizes through that
 * keychain profile. With neither set, the build is unsigned and not
 * notarized, using the same flags as the release workflow's rehearsal.
 * Setting only one of the two is treated as a mistake and fails, so a
 * half-configured machine never produces a surprise unsigned build.
 *
 * Compiling the macOS icon (build/icon.icon) needs Xcode 26+ (actool), so
 * DEVELOPER_DIR defaults to the standard Xcode location.
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SIGNING_VARS = ["APPLE_TEAM_ID", "APPLE_KEYCHAIN_PROFILE"];
const DEFAULT_DEVELOPER_DIR = "/Applications/Xcode.app/Contents/Developer";

/**
 * Decide the electron-builder arguments and environment for this machine.
 * @param {Record<string, string | undefined>} env
 * @returns {{ ok: false, error: string } | { ok: true, signed: boolean, args: string[], env: Record<string, string | undefined> }}
 */
export function distPlan(env) {
	const present = SIGNING_VARS.filter((name) => env[name]);
	if (present.length === 1) {
		const missing = SIGNING_VARS.find((name) => !env[name]);
		return { ok: false, error: `${present[0]} is set but ${missing} is not. Set both to sign and notarize, or neither for an unsigned build.` };
	}
	const signed = present.length === 2;
	const childEnv = { ...env, DEVELOPER_DIR: env.DEVELOPER_DIR || DEFAULT_DEVELOPER_DIR };
	if (!signed) childEnv.CSC_IDENTITY_AUTO_DISCOVERY = "false";
	const args = ["--mac", "--arm64", ...(signed ? [] : ["-c.mac.notarize=false"])];
	return { ok: true, signed, args, env: childEnv };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	const plan = distPlan(process.env);
	if (!plan.ok) {
		console.error(`desktop:dist: ${plan.error}`);
		process.exit(1);
	}
	console.log(plan.signed
		? "desktop:dist: signing and notarizing (APPLE_TEAM_ID and APPLE_KEYCHAIN_PROFILE are set)."
		: "desktop:dist: building an unsigned, unnotarized app (APPLE_TEAM_ID and APPLE_KEYCHAIN_PROFILE are not set).");
	const result = spawnSync("electron-builder", plan.args, { stdio: "inherit", env: plan.env, shell: process.platform === "win32" });
	process.exit(result.status ?? 1);
}
