/**
 * SpeechIn on Deepgram's listen socket (Kvasir P3-2, D157): microphone
 * audio as 16 kHz linear16 frames, interim words as partials, one onFinal
 * per utterance (Deepgram's speech_final from endpointing, or its
 * UtteranceEnd message when endpointing missed the end, D168). A new adapter
 * beside dictation (components/dictation.tsx), reusing its capture worklet
 * and token route; dictation is unchanged.
 */

import { deepgramVoiceListenUrl, type SpeechIn, type SpeechInHandlers } from "@/src/core";
import { browserSocket, mintDeepgramToken, OPEN, openReady, type OpenSocket, type SocketLike } from "./socket";

/** Starts the microphone; each frame goes to onFrame. Resolves to a stop. */
export type StartCapture = (onFrame: (frame: ArrayBuffer) => void) => Promise<() => void>;

export interface DeepgramSpeechInDeps {
	language: string;
	mintToken?: () => Promise<string>;
	openSocket?: OpenSocket;
	startCapture?: StartCapture;
}

interface ResultsMessage {
	type?: string;
	is_final?: boolean;
	speech_final?: boolean;
	channel?: { alternatives?: { transcript?: string }[] };
}

export function createDeepgramSpeechIn(deps: DeepgramSpeechInDeps): SpeechIn {
	const mint = deps.mintToken ?? (() => mintDeepgramToken());
	const open = deps.openSocket ?? browserSocket;
	const capture = deps.startCapture ?? browserCapture;
	let ws: SocketLike | null = null;
	let stopCapture: (() => void) | null = null;

	return {
		async start(handlers: SpeechInHandlers) {
			const finals: string[] = [];
			const token = await mint();
			ws = await openReady(open, deepgramVoiceListenUrl(deps.language), token);
			const socket = ws;
			socket.addEventListener("message", (ev) => {
				if (typeof ev.data !== "string") return;
				let msg: ResultsMessage;
				try {
					msg = JSON.parse(ev.data) as ResultsMessage;
				} catch {
					return;
				}
				if (msg.type === "UtteranceEnd") {
					if (finals.length) handlers.onFinal(finals.splice(0).join(" "));
					return;
				}
				if (msg.type !== "Results") return;
				const text = msg.channel?.alternatives?.[0]?.transcript?.trim() ?? "";
				if (msg.is_final) {
					if (text) finals.push(text);
					if (msg.speech_final && finals.length) handlers.onFinal(finals.splice(0).join(" "));
					else handlers.onPartial?.(finals.join(" "));
				} else if (text) {
					handlers.onPartial?.([...finals, text].join(" "));
				}
			});
			socket.addEventListener("close", (ev) => {
				if (ev.code !== 1000 && ws === socket) handlers.onError?.(new Error(`Deepgram listening stopped (${ev.code ?? "closed"})`));
			});
			stopCapture = await capture((frame) => {
				if (socket.readyState === OPEN) socket.send(frame);
			});
		},
		async stop() {
			stopCapture?.();
			stopCapture = null;
			const socket = ws;
			ws = null;
			if (socket && socket.readyState === OPEN) {
				socket.send(JSON.stringify({ type: "CloseStream" }));
				socket.close(1000);
			}
		},
	};
}

/** The browser microphone through dictation's capture worklet
 *  (public/worklets/pcm-capture.js): 16 kHz, 128 ms Int16 frames. */
export const browserCapture: StartCapture = async (onFrame) => {
	const stream = await navigator.mediaDevices.getUserMedia({
		audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
	});
	const ctx = new AudioContext({ sampleRate: 16000 });
	await ctx.audioWorklet.addModule("/worklets/pcm-capture.js");
	const source = ctx.createMediaStreamSource(stream);
	const node = new AudioWorkletNode(ctx, "pcm-capture");
	node.port.onmessage = (ev: MessageEvent<{ type: string; buffer?: Int16Array }>) => {
		if (ev.data.type === "audio" && ev.data.buffer) onFrame(ev.data.buffer.buffer as ArrayBuffer);
	};
	source.connect(node);
	return () => {
		node.port.onmessage = null;
		source.disconnect();
		node.disconnect();
		for (const track of stream.getTracks()) track.stop();
		void ctx.close();
	};
};
