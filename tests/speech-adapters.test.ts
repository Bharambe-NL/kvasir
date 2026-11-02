/**
 * The Deepgram speech adapters (Kvasir P3-2, D154 to D158) against a fake
 * WebSocket, a fake microphone and a fake player: the right sockets, the
 * token subprotocol, transcripts in, sentences out, and stop on both sides.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createDeepgramSpeechIn } from "../components/speech/deepgram-speech-in.ts";
import { createDeepgramSpeechOut, type PcmPlayer } from "../components/speech/deepgram-speech-out.ts";
import type { SocketLike } from "../components/speech/socket.ts";

type Listener = (ev: { data?: unknown; code?: number }) => void;

class FakeSocket implements SocketLike {
	readyState = 0;
	binaryType = "blob";
	sent: unknown[] = [];
	closedWith: number | undefined;
	private listeners = new Map<string, Listener[]>();
	constructor(readonly url: string, readonly protocols: string[]) {}
	send(data: unknown) {
		this.sent.push(data);
	}
	close(code?: number) {
		this.closedWith = code;
		this.readyState = 3;
	}
	addEventListener(type: string, listener: Listener) {
		this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
	}
	emit(type: string, ev: { data?: unknown; code?: number } = {}) {
		if (type === "open") this.readyState = 1;
		for (const l of this.listeners.get(type) ?? []) l(ev);
	}
	json(type: string) {
		return this.sent.filter((d): d is string => typeof d === "string").map((d) => JSON.parse(d) as { type: string; text?: string }).filter((m) => m.type === type);
	}
}

const tick = () => new Promise((r) => setTimeout(r, 0));

function sockets() {
	const made: FakeSocket[] = [];
	const open = (url: string, protocols: string[]) => {
		const s = new FakeSocket(url, protocols);
		made.push(s);
		return s;
	};
	return { made, open };
}

const results = (transcript: string, is_final: boolean, speech_final = false) =>
	JSON.stringify({ type: "Results", is_final, speech_final, channel: { alternatives: [{ transcript }] } });

describe("Deepgram SpeechIn", () => {
	it("opens the listen socket with the token, streams microphone frames, and turns results into partials and finals", async () => {
		const { made, open } = sockets();
		const frames: { onFrame?: (f: ArrayBuffer) => void; stopped: boolean } = { stopped: false };
		const speechIn = createDeepgramSpeechIn({
			language: "en",
			mintToken: async () => "tok",
			openSocket: open,
			startCapture: async (onFrame) => {
				frames.onFrame = onFrame;
				return () => void (frames.stopped = true);
			},
		});
		const partials: string[] = [];
		const finals: string[] = [];
		const started = speechIn.start({ onPartial: (t) => partials.push(t), onFinal: (t) => finals.push(t) });
		await tick();
		const ws = made[0]!;
		assert.match(ws.url, /^wss:\/\/api\.deepgram\.com\/v1\/listen\?model=nova-3&.*interim_results=true&endpointing=1000&utterance_end_ms=1500&language=en$/);
		assert.deepEqual(ws.protocols, ["bearer", "tok"]);
		ws.emit("open");
		await started;

		const frame = new Int16Array(4).buffer;
		frames.onFrame!(frame);
		assert.deepEqual(ws.sent, [frame], "microphone frames go to Deepgram");

		ws.emit("message", { data: results("the firm", false) });
		ws.emit("message", { data: results("the firm stays", true) });
		ws.emit("message", { data: results("responsible", false) });
		ws.emit("message", { data: results("responsible", true, true) });
		assert.deepEqual(partials, ["the firm", "the firm stays", "the firm stays responsible"]);
		assert.deepEqual(finals, ["the firm stays responsible"], "one final per utterance, at speech_final");

		await speechIn.stop();
		assert.deepEqual(ws.json("CloseStream").length, 1);
		assert.equal(ws.closedWith, 1000);
		assert.ok(frames.stopped, "the microphone stops");
	});

	it("UtteranceEnd ends an utterance that endpointing missed, and never sends it twice (D168)", async () => {
		const { made, open } = sockets();
		const finals: string[] = [];
		const speechIn = createDeepgramSpeechIn({ language: "en", mintToken: async () => "tok", openSocket: open, startCapture: async () => () => {} });
		const started = speechIn.start({ onFinal: (t) => finals.push(t) });
		await tick();
		const ws = made[0]!;
		ws.emit("open");
		await started;
		const utteranceEnd = JSON.stringify({ type: "UtteranceEnd", last_word_end: 2.1 });
		ws.emit("message", { data: results("the outsourcing", true) });
		ws.emit("message", { data: results("register", true) });
		ws.emit("message", { data: utteranceEnd });
		assert.deepEqual(finals, ["the outsourcing register"]);
		ws.emit("message", { data: results("yes", true, true) });
		ws.emit("message", { data: utteranceEnd });
		assert.deepEqual(finals, ["the outsourcing register", "yes"], "an UtteranceEnd after speech_final sends nothing");
		ws.emit("message", { data: JSON.stringify({ type: "SpeechStarted" }) });
		assert.equal(finals.length, 2);
	});

	it("an unexpected close is reported", async () => {
		const { made, open } = sockets();
		const errors: Error[] = [];
		const speechIn = createDeepgramSpeechIn({ language: "en", mintToken: async () => "tok", openSocket: open, startCapture: async () => () => {} });
		const started = speechIn.start({ onFinal: () => {}, onError: (e) => errors.push(e) });
		await tick();
		made[0]!.emit("open");
		await started;
		made[0]!.emit("close", { code: 1011 });
		assert.match(errors[0]!.message, /1011/);
	});
});

class FakePlayer implements PcmPlayer {
	played: ArrayBuffer[] = [];
	stops = 0;
	play(pcm: ArrayBuffer) {
		this.played.push(pcm);
	}
	async drained() {}
	stop() {
		this.stops++;
	}
}

describe("Deepgram SpeechOut", () => {
	it("speaks a sentence on the Aura-2 socket and resolves once it is flushed and played", async () => {
		const { made, open } = sockets();
		const player = new FakePlayer();
		const out = createDeepgramSpeechOut({ mintToken: async () => "tok", openSocket: open, player });
		let done = false;
		const speaking = out.speak("The firm stays responsible.").then(() => void (done = true));
		await tick();
		const ws = made[0]!;
		assert.equal(ws.url, "wss://api.deepgram.com/v1/speak?model=aura-2-thalia-en&encoding=linear16&sample_rate=24000");
		assert.deepEqual(ws.protocols, ["bearer", "tok"]);
		ws.emit("open");
		await tick();
		assert.deepEqual(ws.json("Speak").map((m) => m.text), ["The firm stays responsible."]);
		assert.equal(ws.json("Flush").length, 1);

		const audio = new Int16Array(8).buffer;
		ws.emit("message", { data: audio });
		assert.deepEqual(player.played, [audio], "audio plays as it arrives");
		assert.equal(done, false, "not done before Deepgram flushes");
		ws.emit("message", { data: JSON.stringify({ type: "Flushed", sequence_id: 0 }) });
		await speaking;
		assert.ok(done);

		void out.speak("Next one.");
		await tick();
		assert.equal(made.length, 1, "the socket is reused");
	});

	it("stop() clears Deepgram's queue, silences the player and releases the pending sentence", async () => {
		const { made, open } = sockets();
		const player = new FakePlayer();
		const out = createDeepgramSpeechOut({ mintToken: async () => "tok", openSocket: open, player, voice: "aura-2-apollo-en" });
		const speaking = out.speak("A long sentence.");
		await tick();
		assert.match(made[0]!.url, /model=aura-2-apollo-en/, "the voice is one setting value (D158)");
		made[0]!.emit("open");
		await tick();
		out.stop();
		await speaking;
		await tick();
		assert.equal(player.stops, 1);
		assert.equal(made[0]!.json("Clear").length, 1);
	});
});
