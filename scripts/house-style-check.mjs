#!/usr/bin/env node
// Kvasir house-style check. Scans Kvasir-owned prose for the mechanical rules
// in CLAUDE.md. Exit code 1 on any finding.
//
// Usage: node scripts/house-style-check.mjs [paths...]
// With no paths, scans the default Kvasir-owned locations below.

import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join, extname } from "node:path";

// Kvasir-owned prose. Task P0-5 adds README.md and src/agent/prompts once
// the upstream text there has been rewritten to house style.
const DEFAULT_PATHS = [
	"CLAUDE.md",
	"docs/kvasir",
	".claude/commands",
	".github/pull_request_template.md",
];

const EXTENSIONS = new Set([".md", ".txt"]);

const RULES = [
	{ name: "em dash", pattern: /—/g },
	{ name: "en dash", pattern: /–/g },
	{ name: "contrast framing (not X, but Y)", pattern: /\bnot (just |only |merely )?[^.;:\n]{1,60}, but\b/gi },
	{ name: "banned phrase", pattern: /here's the thing|let that sink in|doing the heavy lifting|the real question is|this is where it gets interesting|what most people miss|this is the hard truth/gi },
];

function collect(path, out) {
	if (!existsSync(path)) return;
	const st = statSync(path);
	if (st.isDirectory()) {
		for (const entry of readdirSync(path)) {
			if (entry === "node_modules" || entry.startsWith(".git")) continue;
			collect(join(path, entry), out);
		}
	} else if (EXTENSIONS.has(extname(path))) {
		out.push(path);
	}
}

const targets = process.argv.slice(2);
const files = [];
for (const p of targets.length ? targets : DEFAULT_PATHS) collect(p, files);

let findings = 0;
for (const file of files) {
	const lines = readFileSync(file, "utf8").split("\n");
	let inCode = false;
	lines.forEach((line, i) => {
		if (line.trimStart().startsWith("```")) inCode = !inCode;
		if (inCode) return;
		for (const rule of RULES) {
			rule.pattern.lastIndex = 0;
			if (rule.pattern.test(line)) {
				findings++;
				console.log(`${file}:${i + 1}: ${rule.name}: ${line.trim()}`);
			}
		}
	});
}

if (findings) {
	console.log(`\n${findings} house-style finding(s) in ${files.length} file(s).`);
	process.exit(1);
}
console.log(`House style clean: ${files.length} file(s).`);
