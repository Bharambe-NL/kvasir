/**
 * The Voice setting (Kvasir P3-5, D179, D180): `speech.voice` saves
 * through the real PUT route, reads back from settings.json, and an
 * unknown voice is refused on write and falls back to the default on
 * read. The speak socket opens with the chosen voice. No network.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { after, describe, it } from "node:test";

const DATA = fs.mkdtempSync(path.join(os.tmpdir(), "kv-speech-route-"));
process.env.KV_DATA_DIR = DATA;
after(() => fs.rmSync(DATA, { recursive: true, force: true }));

const { PUT } = await import("../app/api/settings/[section]/route.ts");
const { effectiveSettings } = await import("../src/server/stores.ts");
const { sanitizeUserSettings } = await import("../src/core/settings.ts");
const { DEFAULT_VOICE, SPEAK_VOICES } = await import("../src/core/speech.ts");
const { createDeepgramSpeechOut } = await import("../components/speech/deepgram-speech-out.ts");

const put = (body: unknown) =>
	PUT(new Request("http://test/api/settings/speech", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }), {
		params: Promise.resolve({ section: "speech" }),
	});

describe("the Voice setting", () => {
	it("offers six voices, Thalia first and the default (D179)", () => {
		assert.deepEqual(SPEAK_VOICES.map((v) => v.label), ["Thalia", "Athena", "Harmonia", "Draco", "Odysseus", "Pandora"]);
		assert.equal(SPEAK_VOICES[0]!.id, DEFAULT_VOICE);
		assert.equal(effectiveSettings().speech.voice, DEFAULT_VOICE);
	});

	it("saves speech.voice through the route and reads it back", async () => {
		const res = await put({ voice: "aura-2-draco-en" });
		assert.equal(res.status, 200, await res.clone().text());
		const saved = JSON.parse(fs.readFileSync(path.join(DATA, "settings.json"), "utf8")).speech;
		assert.deepEqual(saved, { voice: "aura-2-draco-en" });
		assert.equal(effectiveSettings().speech.voice, "aura-2-draco-en");
	});

	it("refuses a voice outside the list", async () => {
		const res = await put({ voice: "aura-2-zeus-en" });
		assert.equal(res.status, 400);
		assert.match(await res.text(), /Unsupported voice/);
	});

	it("an unknown stored voice falls back to the default", () => {
		const record = sanitizeUserSettings({ version: 1, speech: { voice: "robot" } });
		assert.deepEqual(record?.speech, {});
	});

	it("the speak socket uses the chosen voice", async () => {
		const urls: string[] = [];
		const out = createDeepgramSpeechOut({
			voice: "aura-2-pandora-en",
			mintToken: async () => "tok",
			openSocket: (url) => {
				urls.push(url);
				throw new Error("no network in tests");
			},
			player: { play() {}, async drained() {}, stop() {} },
		});
		await out.speak("Hello.").catch(() => {});
		assert.match(urls[0]!, /model=aura-2-pandora-en/);
	});
});
