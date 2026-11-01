/**
 * SpeechOut on Deepgram's speak socket (Kvasir P3-2, D154 to D158): Aura-2,
 * voice aura-2-thalia-en by default. Each sentence is sent as Speak then
 * Flush; the audio (24 kHz linear16) plays as it arrives, and speak()
 * resolves once Deepgram has flushed it and the player has played it.
 * stop() sends Clear and silences the player at once.
 */

import { DEFAULT_VOICE, deepgramSpeakUrl, SPEAK_SAMPLE_RATE, type SpeechOut } from "@/src/core";
import { browserSocket, mintDeepgramToken, OPEN, openReady, type OpenSocket, type SocketLike } from "./socket";

/** Plays raw 16-bit audio in order. */
export interface PcmPlayer {
	play(pcm: ArrayBuffer): void;
	/** Resolves when everything queued so far has played. */
	drained(): Promise<void>;
	stop(): void;
}

export interface DeepgramSpeechOutDeps {
	voice?: string;
	mintToken?: () => Promise<string>;
	openSocket?: OpenSocket;
	player?: PcmPlayer;
}

export function createDeepgramSpeechOut(deps: DeepgramSpeechOutDeps = {}): SpeechOut {
	const mint = deps.mintToken ?? (() => mintDeepgramToken());
	const open = deps.openSocket ?? browserSocket;
	const player = deps.player ?? createBrowserPlayer();
	let socket: Promise<SocketLike> | null = null;
	let flushed: (() => void) | null = null;

	const connect = () => {
		socket ??= mint()
			.then((token) => openReady(open, deepgramSpeakUrl(deps.voice ?? DEFAULT_VOICE), token))
			.then((ws) => {
				ws.addEventListener("message", (ev) => {
					if (typeof ev.data !== "string") {
						if (ev.data instanceof ArrayBuffer) player.play(ev.data);
						return;
					}
					const msg = JSON.parse(ev.data) as { type?: string };
					if (msg.type === "Flushed" || msg.type === "Cleared") {
						flushed?.();
						flushed = null;
					}
				});
				ws.addEventListener("close", () => {
					socket = null;
					flushed?.();
					flushed = null;
				});
				return ws;
			})
			.catch((err: unknown) => {
				socket = null;
				throw err;
			});
		return socket;
	};

	return {
		async speak(sentence: string) {
			const ws = await connect();
			if (ws.readyState !== OPEN) return;
			await new Promise<void>((resolve) => {
				flushed = resolve;
				ws.send(JSON.stringify({ type: "Speak", text: sentence }));
				ws.send(JSON.stringify({ type: "Flush" }));
			});
			await player.drained();
		},
		stop() {
			player.stop();
			flushed?.();
			flushed = null;
			void socket?.then((ws) => {
				if (ws.readyState === OPEN) ws.send(JSON.stringify({ type: "Clear" }));
			}).catch(() => {});
		},
	};
}

/** The browser player: one AudioContext, chunks scheduled back to back. */
export function createBrowserPlayer(): PcmPlayer {
	let ctx: AudioContext | null = null;
	let next = 0;
	const sources = new Set<AudioBufferSourceNode>();
	const waiting = new Set<() => void>(); // drained() calls a stop() releases
	return {
		play(pcm) {
			ctx ??= new AudioContext({ sampleRate: SPEAK_SAMPLE_RATE });
			const samples = new Int16Array(pcm);
			const buffer = ctx.createBuffer(1, samples.length, SPEAK_SAMPLE_RATE);
			const channel = buffer.getChannelData(0);
			for (let i = 0; i < samples.length; i++) channel[i] = samples[i]! / 0x8000;
			const source = ctx.createBufferSource();
			source.buffer = buffer;
			source.connect(ctx.destination);
			next = Math.max(next, ctx.currentTime);
			source.start(next);
			next += buffer.duration;
			sources.add(source);
			source.onended = () => sources.delete(source);
		},
		drained() {
			const wait = ctx ? Math.max(0, next - ctx.currentTime) : 0;
			return new Promise((resolve) => {
				const timer = setTimeout(() => {
					waiting.delete(done);
					resolve();
				}, wait * 1000);
				const done = () => {
					clearTimeout(timer);
					resolve();
				};
				waiting.add(done);
			});
		},
		stop() {
			for (const source of sources) source.stop();
			sources.clear();
			next = 0;
			for (const done of waiting) done();
			waiting.clear();
		},
	};
}
