"use client";

/**
 * The dev-only voice page's screen (Kvasir P3-4, D171): start a voice
 * session on the Deepgram adapters and the chat turn sender, and show the
 * loop's state and every line heard and spoken, for the live test log.
 * Plain on purpose; drive mode (P3-5) is the real screen.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { runVoiceLoop, type VoiceLoop, type VoiceState } from "@/src/core";
import { createChatTurnSender } from "./chat-turn-sender";
import { createDeepgramSpeechIn } from "./deepgram-speech-in";
import { createDeepgramSpeechOut } from "./deepgram-speech-out";

interface Line {
	at: number;
	who: "heard" | "spoken" | "state" | "error";
	text: string;
}

export function VoiceLab() {
	const [state, setState] = useState<VoiceState | "idle">("idle");
	const [chatId, setChatId] = useState<string | null>(null);
	const [partial, setPartial] = useState("");
	const [lines, setLines] = useState<Line[]>([]);
	const loopRef = useRef<VoiceLoop | null>(null);
	const startedAt = useRef(0);

	const log = useCallback((who: Line["who"], text: string) => {
		setLines((prev) => [...prev, { at: Date.now() - startedAt.current, who, text }]);
	}, []);

	const start = useCallback(async () => {
		startedAt.current = Date.now();
		setLines([]);
		try {
			const res = await fetch("/api/chats", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ title: "Voice test", voice: true }),
			});
			if (!res.ok) throw new Error(`create chat ${res.status}`);
			const { id } = (await res.json()) as { id: string };
			setChatId(id);
			const speechIn = createDeepgramSpeechIn({ language: "en" });
			const tapped = {
				start: (h: Parameters<typeof speechIn.start>[0]) => speechIn.start({ ...h, onPartial: (t) => (setPartial(t), h.onPartial?.(t)) }),
				stop: () => speechIn.stop(),
			};
			const sendTurn = createChatTurnSender(id);
			loopRef.current = await runVoiceLoop({
				speechIn: tapped,
				speechOut: createDeepgramSpeechOut(),
				sendTurn,
				openQuestion: sendTurn.openQuestion,
				onState: (s) => (setState(s), log("state", s)),
				onHeard: (u) => (setPartial(""), log("heard", u)),
				onSpoken: (s) => log("spoken", s),
				onError: (e) => log("error", e.message),
			});
		} catch (e) {
			log("error", e instanceof Error ? e.message : String(e));
			setState("idle");
		}
	}, [log]);

	const stop = useCallback(async () => {
		await loopRef.current?.stop();
		loopRef.current = null;
	}, []);

	useEffect(() => () => void loopRef.current?.stop(), []);

	const running = state !== "idle" && state !== "stopped";
	return (
		<main className="mx-auto flex max-w-3xl flex-col gap-4 p-6">
			<h1 className="text-page font-title">Voice test</h1>
			<p className="text-body text-muted-foreground">Development only. A voice session on Deepgram and the chat&apos;s model, for the P3-4 test log.</p>
			<div className="flex items-center gap-3">
				<button type="button" className="rounded border px-4 py-2" onClick={running ? stop : start}>
					{running ? "Stop" : "Start"}
				</button>
				<span className="text-label" data-testid="voice-state">{state}</span>
				{chatId && <a className="text-label underline" href={`/chat/${chatId}`}>Open the chat</a>}
			</div>
			<p className="min-h-6 text-body italic">{partial}</p>
			<ol className="flex flex-col gap-1 text-label tabular-nums">
				{lines.map((l, i) => (
					<li key={i}>
						{(l.at / 1000).toFixed(1).padStart(6)}s {l.who.padEnd(6)} {l.text}
					</li>
				))}
			</ol>
		</main>
	);
}
