/**
 * Drive mode's pure parts (Kvasir P3-5, D173 to D178): the screen's words
 * and the count of visuals waiting in a voice session's record.
 * Browser-safe; components/drive/drive-mode.tsx draws them.
 */

import type { VoiceState } from "./speech.ts";

/** The screen's phase: the loop's state, or before Start, or after End. */
export type DrivePhase = "ready" | "starting" | Exclude<VoiceState, "stopped"> | "ended";

export const DRIVE_TEXT = {
	ready: "Press Start, then say what you want to learn.",
	start: "Start",
	pause: "Pause",
	resume: "Resume",
	end: "End",
	transcript: "Transcript",
	/** Followed by an "Add one" link and " in Settings." */
	noKey: "Voice needs a Deepgram key.",
	noMicrophone: "Microphone not available. Check Kvasir's microphone access in System Settings.",
	connectionLost: "Connection lost. Press Resume to try again.",
} as const;

const STATE_WORDS: Record<DrivePhase, string> = {
	ready: "",
	starting: "",
	listening: "Listening",
	thinking: "Thinking",
	speaking: "Speaking",
	paused: "Paused",
	ended: "Ended",
};

export const driveStateWord = (phase: DrivePhase): string => STATE_WORDS[phase];

/** "1 visual to view later", "3 visuals to view later"; nothing for none. */
export function visualsLabel(n: number): string {
	if (n <= 0) return "";
	return `${n} ${n === 1 ? "visual" : "visuals"} to view later`;
}

interface Part { type?: string; name?: string; id?: string }
interface Message { role?: string; content?: unknown; toolCallId?: string; isError?: boolean }

/** Demo and visual jobs the tutor started in this session (D178), less
 *  the calls that failed. They wait in the written transcript. */
export function visualsWaiting(messages: readonly unknown[]): number {
	const failed = new Set<string>();
	for (const m of messages as Message[]) {
		if (m?.role === "toolResult" && m.isError && m.toolCallId) failed.add(m.toolCallId);
	}
	let n = 0;
	for (const m of messages as Message[]) {
		if (m?.role !== "assistant" || !Array.isArray(m.content)) continue;
		for (const p of m.content as Part[]) {
			if (p?.type === "toolCall" && (p.name === "demo" || p.name === "visual") && !(p.id && failed.has(p.id))) n++;
		}
	}
	return n;
}

/** What a failure means on the drive screen. */
export function driveErrorKind(err: unknown): "noKey" | "noMicrophone" | "connectionLost" {
	const name = (err as { name?: string } | null)?.name;
	const message = err instanceof Error ? err.message : String(err);
	if (message.startsWith("Voice needs a Deepgram key")) return "noKey";
	if (name === "NotAllowedError" || name === "NotFoundError" || name === "NotReadableError" || name === "SecurityError") return "noMicrophone";
	return "connectionLost";
}
