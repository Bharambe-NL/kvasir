/**
 * Drive mode's tones (Kvasir P3-5, D177): rising for start and resume,
 * falling for pause and end, a low double tone for an error, scheduled on
 * a fake AudioContext.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { playTone, TONES } from "../components/speech/tones.ts";

describe("drive mode tones", () => {
	it("start rises, stop falls, error is two low equal notes", () => {
		const freqs = (k: keyof typeof TONES) => TONES[k].map((n) => n.freq);
		const [a, b] = freqs("start");
		assert.ok(a! < b!);
		const [c, d] = freqs("stop");
		assert.ok(c! > d!);
		assert.deepEqual(freqs("error"), [220, 220]);
	});

	it("saved is one short soft note (P3-6, D186)", () => {
		assert.equal(TONES.saved.length, 1);
		assert.ok(TONES.saved[0]!.length <= 0.15);
	});

	it("schedules one soft sine per note", async () => {
		const oscs: { type?: string; freq: number; start?: number }[] = [];
		const param = () => ({ value: 0, setValueAtTime() {}, linearRampToValueAtTime() {} });
		const ctx = {
			currentTime: 1,
			destination: {},
			createOscillator() {
				const o = { type: "", frequency: param(), connect: (g: unknown) => g, start(t: number) { rec.start = t; }, stop() {} };
				const rec: { type?: string; freq: number; start?: number } = { freq: 0 };
				oscs.push(rec);
				return new Proxy(o, { set(target, key, value) { (target as Record<string, unknown>)[key as string] = value; if (key === "type") rec.type = value; return true; }, get(target, key) { if (key === "frequency") return { set value(v: number) { rec.freq = v; } }; return (target as Record<string, unknown>)[key as string]; } });
			},
			createGain() {
				return { gain: param(), connect: (d: unknown) => d };
			},
		};
		await playTone("start", () => ctx as unknown as AudioContext);
		assert.deepEqual(oscs.map((o) => [o.type, o.freq]), TONES.start.map((n) => ["sine", n.freq]));
		assert.ok(oscs[1]!.start! > oscs[0]!.start!);
	});
});
