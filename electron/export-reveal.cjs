"use strict";

// Show in Finder for exports (Kvasir P6-3, D105). The renderer may reveal
// only an existing folder or file inside the export root; any other path is
// refused. The root matches src/server/exports.ts exportRoot().

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

function exportRoot(env = process.env, home = os.homedir()) {
	return env.KV_EXPORT_DIR || path.join(home, "Documents", "Kvasir exports");
}

/** The real path to reveal, or null when it is missing or outside the root. */
function revealTarget(candidate, root = exportRoot()) {
	if (typeof candidate !== "string" || candidate === "") return null;
	let real;
	let realRoot;
	try {
		real = fs.realpathSync(candidate);
		realRoot = fs.realpathSync(root);
	} catch {
		return null;
	}
	const rel = path.relative(realRoot, real);
	return rel !== "" && !rel.startsWith("..") && !path.isAbsolute(rel) ? real : null;
}

module.exports = { exportRoot, revealTarget };
