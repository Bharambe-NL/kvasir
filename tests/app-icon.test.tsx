/**
 * The Kvasir symbol in every icon file (Kvasir P7-4, D139, D140): each
 * file matches what src/core/kvasir-mark.ts generates, the Windows,
 * Linux and macOS files hold their sizes, and the in-app mark draws the
 * same shapes with the theme tokens. Parses the files directly, so it runs
 * on any OS.
 */
import React from "react";
(globalThis as Record<string, unknown>).React = React;

import assert from "node:assert/strict";
import fs from "node:fs";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { appIconSvg, chevronPath, layerSvg, MARK } from "../src/core/kvasir-mark.ts";
import { LhMark } from "../components/lh-mark.tsx";

const file = (p: string) => fs.readFileSync(new URL(`../${p}`, import.meta.url));
const pngSize = (b: Buffer) => [b.readUInt32BE(16), b.readUInt32BE(20)];

describe("the icon files come from the one source", () => {
	it("the flat icon, the favicon and the Icon Composer layers are exactly what the source generates", () => {
		assert.equal(file("build/icon-flat.svg").toString(), appIconSvg("flat"));
		assert.equal(file("app/icon.svg").toString(), appIconSvg("flat"));
		assert.equal(file("build/icon.icon/Assets/chevron.svg").toString(), layerSvg("chevron"));
		assert.equal(file("build/icon.icon/Assets/dot.svg").toString(), layerSvg("dot"));
	});
	it("the Icon Composer document names the two layers, and only those files are in Assets", () => {
		const doc = JSON.parse(file("build/icon.icon/icon.json").toString());
		assert.deepEqual(doc.groups[0].layers.map((l: { "image-name": string }) => l["image-name"]), ["dot.svg", "chevron.svg"]);
		assert.deepEqual(fs.readdirSync(new URL("../build/icon.icon/Assets", import.meta.url)).sort(), ["chevron.svg", "dot.svg"]);
		assert.match(doc.fill.solid, /^srgb:0\.07843,0\.07843,0\.07843,1\.00000$/);
	});
});

describe("the platform files hold their sizes", () => {
	it("Windows: icon.ico holds 16, 24, 32, 48, 64, 128 and 256", () => {
		const ico = file("build/icon.ico");
		const n = ico.readUInt16LE(4);
		const sizes = Array.from({ length: n }, (_, i) => ico[6 + i * 16] || 256);
		assert.deepEqual(sizes, [16, 24, 32, 48, 64, 128, 256]);
	});
	it("Linux: icon.png is 512 by 512", () => {
		assert.deepEqual(pngSize(file("build/icon.png")), [512, 512]);
	});
	it("macOS: icon.icns holds every size from 16 to 1024", () => {
		const icns = file("build/icon.icns");
		assert.equal(icns.toString("ascii", 0, 4), "icns");
		const sizes = new Set<number>();
		const types: string[] = [];
		for (let at = 8; at < icns.length; ) {
			const len = icns.readUInt32BE(at + 4);
			const body = icns.subarray(at + 8, at + len);
			types.push(icns.toString("ascii", at, at + 4));
			if (body.subarray(0, 4).toString("latin1") === "\x89PNG") sizes.add(pngSize(body)[0]!);
			at += len;
		}
		// iconutil keeps 16 px as raw ARGB (ic04); every other size is a PNG.
		assert.ok(types.includes("ic04"), "the 16 px entry");
		assert.deepEqual([...sizes].sort((a, b) => a - b), [32, 64, 128, 256, 512, 1024]);
		for (const t of ["ic11", "ic12", "ic07", "ic13", "ic08", "ic14", "ic09", "ic10"]) assert.ok(types.includes(t), t);
	});
});

describe("the in-app mark (D140)", () => {
	it("draws the same chevron and dot, coloured by the theme tokens", () => {
		const html = renderToStaticMarkup(<LhMark className="size-6" />);
		assert.ok(html.includes(`d="${chevronPath()}"`));
		assert.match(html, /stroke:var\(--mark-fill\)/);
		assert.match(html, new RegExp(`cx="${MARK.dot.cx}" cy="${MARK.dot.cy}" r="${MARK.dot.r}" style="fill:var\\(--mark-detail\\)"`));
		assert.match(html, /viewBox="281 281 462 462"/);
	});
});
