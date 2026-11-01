/**
 * npm run icons (Kvasir P7-4, D139): write every icon file from the one
 * source of the symbol, src/core/kvasir-mark.ts.
 *
 *   build/icon-flat.svg          the full-canvas icon (scripts/make-icons.mjs
 *                                turns it into build/icon.ico and icon.png)
 *   app/icon.svg                 the favicon (Next's file convention)
 *   build/icon.icon/             the Icon Composer document for macOS 26:
 *                                chevron and dot layers on a solid fill
 *   build/icon.icns              macOS before 26: the full iconset, 16 to
 *                                1024, on Apple's grid, packed by iconutil
 *
 * Committed outputs; rerun only when the symbol changes.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Resvg } from "@resvg/resvg-js";
import { appIconSvg, layerSvg, MARK_COLOURS } from "../src/core/kvasir-mark.ts";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const at = (...p: string[]) => path.join(root, ...p);

fs.writeFileSync(at("build", "icon-flat.svg"), appIconSvg("flat"));
fs.writeFileSync(at("app", "icon.svg"), appIconSvg("flat"));
console.log("build/icon-flat.svg, app/icon.svg");

// ---- build/icon.icon (Icon Composer) -----------------------------------------
const doc = at("build", "icon.icon");
const assets = path.join(doc, "Assets");
for (const f of fs.readdirSync(assets)) fs.rmSync(path.join(assets, f));
fs.writeFileSync(path.join(assets, "chevron.svg"), layerSvg("chevron"));
fs.writeFileSync(path.join(assets, "dot.svg"), layerSvg("dot"));
const json = JSON.parse(fs.readFileSync(path.join(doc, "icon.json"), "utf8"));
const hex = MARK_COLOURS.background.slice(1);
const srgb = [0, 2, 4].map((i) => (parseInt(hex.slice(i, i + 2), 16) / 255).toFixed(5)).join(",");
json.fill = { solid: `srgb:${srgb},1.00000` };
json.groups[0].layers = [
	{ "image-name": "dot.svg", name: "dot" },
	{ "image-name": "chevron.svg", name: "chevron" },
];
fs.writeFileSync(path.join(doc, "icon.json"), `${JSON.stringify(json, null, 2)}\n`);
console.log("build/icon.icon: chevron and dot layers");

// ---- build/icon.icns ---------------------------------------------------------
const mac = appIconSvg("mac");
const set = fs.mkdtempSync(path.join(os.tmpdir(), "kvasir-iconset-")) + ".iconset";
fs.mkdirSync(set);
for (const base of [16, 32, 128, 256, 512]) {
	for (const scale of [1, 2]) {
		const px = base * scale;
		const png = new Resvg(mac, { fitTo: { mode: "width", value: px } }).render().asPng();
		fs.writeFileSync(path.join(set, `icon_${base}x${base}${scale === 2 ? "@2x" : ""}.png`), png);
	}
}
execFileSync("iconutil", ["-c", "icns", set, "-o", at("build", "icon.icns")]);
fs.rmSync(set, { recursive: true, force: true });
console.log("build/icon.icns: 16 to 1024");
