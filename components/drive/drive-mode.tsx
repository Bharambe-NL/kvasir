"use client";

/**
 * Drive mode (Kvasir P3-5, D173 to D178): a voice session with eyes off the
 * screen. Full screen, one large state word, one big button that pauses and
 * resumes (Space and the play/pause media key do the same), a small End
 * button and a Transcript link. A new session (`chatId` null) creates its
 * voice chat on Start; he then says what he wants to learn (D174). While it
 * runs the Mac stays awake with the screen allowed to sleep (D176), and
 * short tones mark start, pause, end and errors (D177).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
	DRIVE_TEXT, driveErrorKind, driveStateWord, runVoiceLoop, visualsLabel, visualsWaiting,
	type DrivePhase, type VoiceLoop,
} from "@/src/core";
import { createChatTurnSender } from "@/components/speech/chat-turn-sender";
import { createDeepgramSpeechIn } from "@/components/speech/deepgram-speech-in";
import { createDeepgramSpeechOut, type DeepgramSpeechOut } from "@/components/speech/deepgram-speech-out";
import { playTone } from "@/components/speech/tones";
import { readSpeakVoice } from "@/components/settings/voice-setting";
import { useSettingsDialog } from "@/components/settings/settings-dialog";
import { DEEPGRAM_KEY_ID } from "@/components/dictation";

type DriveError = ReturnType<typeof driveErrorKind>;

const awake = (on: boolean) => void window.lh?.drive?.awake(on).catch(() => {});

export function DriveMode({ chatId: initialChatId }: { chatId: string | null }) {
	const [phase, setPhase] = useState<DrivePhase>("ready");
	const [error, setError] = useState<DriveError | null>(null);
	const [visuals, setVisuals] = useState(0);
	const [chatId, setChatId] = useState(initialChatId);
	const loopRef = useRef<VoiceLoop | null>(null);
	const outRef = useRef<DeepgramSpeechOut | null>(null);
	const chatRef = useRef(initialChatId);
	const { open: openSettings } = useSettingsDialog();

	const countVisuals = useCallback(async () => {
		const id = chatRef.current;
		if (!id) return;
		try {
			const res = await fetch(`/api/chats/${encodeURIComponent(id)}`);
			if (res.ok) setVisuals(visualsWaiting(((await res.json()) as { messages?: unknown[] }).messages ?? []));
		} catch {
			// The count waits for the next turn.
		}
	}, []);

	const fail = useCallback((err: unknown) => {
		setError(driveErrorKind(err));
		void playTone("error");
	}, []);

	const start = useCallback(async () => {
		setPhase("starting");
		setError(null);
		try {
			let id = chatRef.current;
			if (!id) {
				const res = await fetch("/api/chats", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ voice: true }),
				});
				if (!res.ok) throw new Error(`create chat ${res.status}`);
				id = ((await res.json()) as { id: string }).id;
				chatRef.current = id;
				setChatId(id);
				// Same screen, real address: a reload or the sidebar finds it.
				window.history.replaceState(null, "", `/drive/${id}`);
			}
			const sendTurn = createChatTurnSender(id);
			const speechOut = createDeepgramSpeechOut({ voice: await readSpeakVoice() });
			outRef.current = speechOut;
			loopRef.current = await runVoiceLoop({
				speechIn: createDeepgramSpeechIn({ language: "en" }),
				speechOut,
				sendTurn,
				openQuestion: sendTurn.openQuestion,
				onState: (s) => {
					if (s === "stopped") return;
					setPhase(s);
					if (s === "listening") void countVisuals();
				},
				onError: (err) => {
					fail(err);
					void loopRef.current?.pause();
					awake(false);
				},
			});
			awake(true);
			void playTone("start");
			void countVisuals();
		} catch (err) {
			loopRef.current = null;
			setPhase("ready");
			fail(err);
		}
	}, [countVisuals, fail]);

	const toggle = useCallback(async () => {
		const loop = loopRef.current;
		if (!loop) {
			if (phase === "ready" || phase === "ended") void start();
			return;
		}
		if (phase === "paused") {
			setError(null);
			try {
				await loop.resume();
				awake(true);
				void playTone("start");
			} catch (err) {
				fail(err);
			}
		} else {
			await loop.pause();
			awake(false);
			void playTone("stop");
		}
	}, [phase, start, fail]);

	const end = useCallback(async () => {
		const loop = loopRef.current;
		loopRef.current = null;
		await loop?.stop();
		outRef.current?.close();
		outRef.current = null;
		awake(false);
		setPhase("ended");
		void playTone("stop");
	}, []);

	// Space and the play/pause media key do what the big button does (D175).
	const toggleRef = useRef(toggle);
	toggleRef.current = toggle;
	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (e.code !== "Space" || e.repeat) return;
			const t = e.target as HTMLElement | null;
			if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(t.tagName))) return;
			e.preventDefault();
			void toggleRef.current();
		};
		window.addEventListener("keydown", onKey);
		const media = typeof navigator !== "undefined" ? navigator.mediaSession : undefined;
		const press = () => void toggleRef.current();
		try {
			media?.setActionHandler("play", press);
			media?.setActionHandler("pause", press);
		} catch {
			// Not every browser offers these actions.
		}
		return () => {
			window.removeEventListener("keydown", onKey);
			try {
				media?.setActionHandler("play", null);
				media?.setActionHandler("pause", null);
			} catch {
				// as above
			}
		};
	}, []);

	useEffect(() => () => {
		void loopRef.current?.stop();
		outRef.current?.close();
		awake(false);
	}, []);

	const running = loopRef.current !== null && phase !== "ended";
	return <DriveView
		phase={phase}
		error={error}
		visuals={visuals}
		chatId={chatId}
		running={running}
		onToggle={() => void toggle()}
		onEnd={() => void end()}
		onAddKey={() => openSettings("keys", DEEPGRAM_KEY_ID)}
	/>;
}

/** The drive screen itself, from plain props. */
export function DriveView({ phase, error, visuals, chatId, running, onToggle, onEnd, onAddKey }: {
	phase: DrivePhase;
	error: DriveError | null;
	visuals: number;
	chatId: string | null;
	running: boolean;
	onToggle: () => void;
	onEnd: () => void;
	onAddKey: () => void;
}) {
	const bigLabel = !running ? DRIVE_TEXT.start : phase === "paused" ? DRIVE_TEXT.resume : DRIVE_TEXT.pause;
	const word = driveStateWord(phase);
	const waiting = visualsLabel(visuals);

	return (
		<div data-testid="drive-mode" className="fixed inset-0 z-50 flex flex-col items-center justify-between bg-background px-6 py-10 text-foreground">
			<div className="flex w-full max-w-3xl items-center justify-between text-control text-muted-foreground">
				{chatId ? <a href={`/chat/${chatId}`} data-testid="drive-transcript" className="underline-offset-4 hover:text-foreground hover:underline">{DRIVE_TEXT.transcript}</a> : <span />}
				{waiting && <span data-testid="drive-visuals">{waiting}</span>}
			</div>

			<div className="flex flex-col items-center gap-6 text-center">
				<p data-testid="drive-state" aria-live="polite" className="font-title text-[clamp(3rem,12vw,7rem)] leading-none">{word}</p>
				{phase === "ready" && !error && <p data-testid="drive-hint" className="max-w-md text-body text-muted-foreground">{DRIVE_TEXT.ready}</p>}
				{error && (
					<p role="alert" data-testid="drive-error" className="max-w-md text-body text-destructive">
						{error === "noKey" ? <>
							{DRIVE_TEXT.noKey}{" "}
							<button type="button" className="underline underline-offset-2" onClick={onAddKey}>Add one</button> in Settings.
						</> : DRIVE_TEXT[error]}
					</p>
				)}
			</div>

			<div className="flex flex-col items-center gap-6">
				<button
					type="button"
					data-testid="drive-toggle"
					onClick={onToggle}
					disabled={phase === "starting"}
					className="size-56 rounded-full border-2 border-foreground/70 text-title transition-colors hover:bg-accent disabled:opacity-50"
				>
					{bigLabel}
				</button>
				<button
					type="button"
					data-testid="drive-end"
					onClick={onEnd}
					disabled={!running}
					className="rounded-md px-4 py-2 text-control text-muted-foreground transition-colors hover:text-foreground disabled:invisible"
				>
					{DRIVE_TEXT.end}
				</button>
			</div>
		</div>
	);
}
