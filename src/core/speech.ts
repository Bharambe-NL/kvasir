/**
 * Speech (Kvasir P3-2, D154 to D158): the ports a voice session talks
 * through, and the pure parts of the voice loop. Browser-safe. The Deepgram
 * adapters live in components/speech/; tests use faux adapters.
 *
 *   SpeechIn    the microphone side: one onFinal per finished utterance
 *   SpeechOut   the speaker side: one sentence at a time, stoppable
 *   TurnSender  one chat turn: the reply's new text as it streams
 *
 * runVoiceLoop joins them: listen, send the final utterance, speak each
 * finished sentence while the reply streams (D155), listen again. Silence
 * handling and barge-in are P3-4; until then an utterance that arrives
 * while the tutor is thinking or speaking is dropped.
 */

export interface SpeechInHandlers {
	/** Words heard so far in the current utterance (may be revised). */
	onPartial?: (text: string) => void;
	/** One finished utterance. */
	onFinal: (utterance: string) => void;
	onError?: (err: Error) => void;
}

export interface SpeechIn {
	start(handlers: SpeechInHandlers): Promise<void>;
	stop(): Promise<void>;
}

export interface SpeechOut {
	/** Speak one sentence; resolves once it has played (or was stopped). */
	speak(sentence: string): Promise<void>;
	/** Cut playback now and drop anything queued. */
	stop(): void;
}

/** One chat turn: yields the reply's NEW text as it streams. */
export type TurnSender = (utterance: string, signal: AbortSignal) => AsyncIterable<string>;

/** The default Aura-2 voice (D158). */
export const DEFAULT_VOICE = "aura-2-thalia-en";

/** Deepgram's listen socket for a voice session: like dictation's, plus
 *  interim results for partials. Endpointing marks the end of an
 *  utterance (speech_final). */
export function deepgramVoiceListenUrl(language: string): string {
	return "wss://api.deepgram.com/v1/listen" +
		"?model=nova-3&encoding=linear16&sample_rate=16000&channels=1" +
		"&smart_format=true&punctuate=true&interim_results=true&endpointing=300" +
		`&language=${encodeURIComponent(language)}`;
}

/** Deepgram's speak socket: raw 16-bit audio at 24 kHz, played as it comes. */
export const SPEAK_SAMPLE_RATE = 24000;
export function deepgramSpeakUrl(voice: string = DEFAULT_VOICE): string {
	return `wss://api.deepgram.com/v1/speak?model=${encodeURIComponent(voice)}&encoding=linear16&sample_rate=${SPEAK_SAMPLE_RATE}`;
}

// ─── Sentences ──────────────────────────────────────────────────────────────

/** Words whose trailing full stop does not end a sentence. */
const ABBREVIATIONS = new Set(["e.g", "i.e", "etc", "vs", "cf", "art", "no", "nr", "para", "mr", "mrs", "ms", "dr", "st", "approx", "incl", "ca"]);

function endsAt(text: string, i: number): boolean {
	const ch = text[i];
	if (ch === "\n") return text[i + 1] === "\n";
	if (ch !== "." && ch !== "!" && ch !== "?") return false;
	const next = text[i + 1];
	if (next === undefined || !/\s/.test(next)) return false; // "2.5", "...more" and the stream's edge
	if (ch !== ".") return true;
	const word = /([A-Za-z.]+)$/.exec(text.slice(0, i))?.[1]?.toLowerCase() ?? "";
	if (ABBREVIATIONS.has(word)) return false;
	if (/^[a-z]$/i.test(word)) return false; // an initial: "J. Smith"
	return true;
}

/** Streamed text in, finished sentences out (D155). Text after the last
 *  sentence end waits for more, or for flush(). */
export class SentenceSplitter {
	private buffer = "";

	push(text: string): string[] {
		this.buffer += text;
		const out: string[] = [];
		let start = 0;
		for (let i = 0; i < this.buffer.length; i++) {
			if (endsAt(this.buffer, i)) {
				const sentence = this.buffer.slice(start, i + 1).trim();
				if (sentence) out.push(sentence);
				start = i + 1;
			}
		}
		this.buffer = this.buffer.slice(start);
		return out;
	}

	flush(): string[] {
		const rest = this.buffer.trim();
		this.buffer = "";
		return rest ? [rest] : [];
	}
}

// ─── Reply text from the chat's own stream ──────────────────────────────────

interface StreamPart { type?: string; text?: string }
interface StreamMessage { role?: string; content?: unknown; timestamp?: number }

/** The assistant's spoken text in one message: its text parts only
 *  (thinking and tool calls are not spoken). */
export function replyTextOf(message: unknown): string {
	const m = message as StreamMessage | null;
	if (!m || m.role !== "assistant" || !Array.isArray(m.content)) return "";
	return (m.content as StreamPart[]).filter((p) => p?.type === "text" && typeof p.text === "string").map((p) => p.text).join("");
}

/** An open spoken question (Kvasir P3-3): what the next utterance answers. */
export interface SpokenQuestion {
	toolCallId: string;
	question: string;
	/** Present when the question is graded (D159). */
	correctAnswer?: string;
}

function spokenQuestionOf(toolCallId: string, args: unknown): SpokenQuestion | null {
	const a = args as { question?: unknown; correctAnswer?: unknown } | null;
	if (!a || typeof a.question !== "string" || !a.question.trim()) return null;
	return { toolCallId, question: a.question.trim(), ...(typeof a.correctAnswer === "string" ? { correctAnswer: a.correctAnswer } : {}) };
}

/** Turns the chat stream's events (src/server/pi/ui-stream.ts: each
 *  message_update carries the FULL message so far) into new text. A turn
 *  can hold several assistant messages; a new one starts on a paragraph.
 *  An ask_spoken question is spoken once the validator accepted it
 *  (tool_execution_end without an error, Kvasir P3-3), so a rejected
 *  question is never heard; it then stands as `question`. */
export class ReplyTextTracker {
	private current: number | undefined;
	private seen = "";
	private started = false;
	private calls = new Map<string, unknown>();
	/** The last spoken question accepted in this stream, if any. */
	question: SpokenQuestion | null = null;

	/** The new reply text this event adds, or "" when none. */
	feed(event: unknown): string {
		const t = event as { type?: string; toolName?: string; toolCallId?: string; args?: unknown; isError?: boolean } | null;
		if (t?.toolName === "ask_spoken" && typeof t.toolCallId === "string") {
			if (t.type === "tool_execution_start") this.calls.set(t.toolCallId, t.args);
			if (t.type !== "tool_execution_end" || t.isError) return "";
			const q = spokenQuestionOf(t.toolCallId, this.calls.get(t.toolCallId));
			if (!q) return "";
			this.question = q;
			this.current = undefined;
			this.seen = "";
			const lead = this.started ? "\n\n" : "";
			this.started = true;
			return lead + q.question;
		}
		const e = event as { type?: string; message?: StreamMessage } | null;
		if (!e || (e.type !== "message_update" && e.type !== "message_end") || e.message?.role !== "assistant") return "";
		const text = replyTextOf(e.message);
		const id = e.message.timestamp;
		const fresh = id !== this.current || !text.startsWith(this.seen);
		if (fresh) {
			this.current = id;
			this.seen = "";
		}
		const delta = text.slice(this.seen.length);
		this.seen = text;
		if (!delta) return "";
		const lead = fresh && this.started ? "\n\n" : "";
		this.started = true;
		return lead + delta;
	}
}

// ─── The voice loop ─────────────────────────────────────────────────────────

export type VoiceState = "listening" | "thinking" | "speaking" | "stopped";

export interface VoiceLoopOptions {
	speechIn: SpeechIn;
	speechOut: SpeechOut;
	sendTurn: TurnSender;
	onState?: (state: VoiceState) => void;
	/** Each utterance heard and each sentence spoken, in order. */
	onHeard?: (utterance: string) => void;
	onSpoken?: (sentence: string) => void;
	onError?: (err: Error) => void;
}

export interface VoiceLoop {
	/** Stop listening and speaking now; resolves once both have stopped. */
	stop(): Promise<void>;
}

export async function runVoiceLoop(opts: VoiceLoopOptions): Promise<VoiceLoop> {
	let state: VoiceState = "listening";
	let turn: AbortController | null = null;
	const set = (next: VoiceState) => {
		if (state === "stopped" || state === next) return;
		state = next;
		opts.onState?.(next);
	};

	const runTurn = async (utterance: string) => {
		const controller = new AbortController();
		turn = controller;
		set("thinking");
		const splitter = new SentenceSplitter();
		let speaking: Promise<void> = Promise.resolve();
		const say = (sentences: string[]) => {
			for (const sentence of sentences) {
				speaking = speaking.then(async () => {
					if (controller.signal.aborted) return;
					set("speaking");
					opts.onSpoken?.(sentence);
					await opts.speechOut.speak(sentence);
				});
			}
		};
		try {
			for await (const text of opts.sendTurn(utterance, controller.signal)) {
				if (controller.signal.aborted) break;
				say(splitter.push(text));
			}
			if (!controller.signal.aborted) say(splitter.flush());
			await speaking;
		} catch (err) {
			if (!controller.signal.aborted) opts.onError?.(err instanceof Error ? err : new Error(String(err)));
		} finally {
			if (turn === controller) turn = null;
			set("listening");
		}
	};

	opts.onState?.("listening");
	await opts.speechIn.start({
		onFinal: (utterance) => {
			const said = utterance.trim();
			if (!said || state !== "listening") return; // P3-4 brings barge-in
			opts.onHeard?.(said);
			void runTurn(said);
		},
		onError: (err) => opts.onError?.(err),
	});

	return {
		async stop() {
			if (state === "stopped") return;
			state = "stopped";
			turn?.abort();
			opts.speechOut.stop();
			await opts.speechIn.stop();
			opts.onState?.("stopped");
		},
	};
}

/** The chat turn's SSE body (src/server/pi/ui-stream.ts) → the reply's new
 *  text. Shared by the window's turn sender and the tests, so both read
 *  the stream the same way. Ends at [DONE] or the stream's end. */
export async function* replyTextFromSse(body: ReadableStream<Uint8Array>, signal?: AbortSignal, onQuestion?: (q: SpokenQuestion) => void): AsyncIterable<string> {
	const reader = body.getReader();
	const decoder = new TextDecoder();
	const tracker = new ReplyTextTracker();
	let buffer = "";
	try {
		while (!signal?.aborted) {
			const { value, done } = await reader.read();
			if (done) break;
			buffer += decoder.decode(value, { stream: true });
			let cut: number;
			while ((cut = buffer.indexOf("\n\n")) >= 0) {
				const frame = buffer.slice(0, cut);
				buffer = buffer.slice(cut + 2);
				for (const line of frame.split("\n")) {
					if (!line.startsWith("data:")) continue;
					const data = line.slice(5).trim();
					if (data === "[DONE]") return;
					let event: unknown;
					try {
						event = JSON.parse(data);
					} catch {
						continue;
					}
					const before = tracker.question;
					const text = tracker.feed(event);
					if (tracker.question && tracker.question !== before) onQuestion?.(tracker.question);
					if (text) yield text;
				}
			}
		}
	} finally {
		reader.cancel().catch(() => {});
	}
}

/** The reply to the learner's last input in a chat record (a message or a
 *  question's answer): the assistant messages after it, as spoken text,
 *  then the open spoken question if the turn ended on one. The turn
 *  sender's fallback when the turn settled before its stream was attached. */
export function replyAfterLastInput(messages: readonly unknown[]): { text: string; question: SpokenQuestion | null } {
	let last = -1;
	messages.forEach((m, i) => {
		const role = (m as { role?: string })?.role;
		if (role === "user" || role === "toolResult") last = i;
	});
	const after = messages.slice(last + 1);
	const question = openSpokenQuestion(messages);
	const parts = after.map(replyTextOf).filter(Boolean);
	if (question) parts.push(question.question);
	return { text: parts.join("\n\n"), question };
}

/** The spoken question still waiting for an answer: the last ask_spoken
 *  call with no result after it. */
export function openSpokenQuestion(messages: readonly unknown[]): SpokenQuestion | null {
	const answered = new Set<string>();
	for (let i = messages.length - 1; i >= 0; i--) {
		const m = messages[i] as { role?: string; toolCallId?: string; content?: unknown };
		if (m?.role === "toolResult" && typeof m.toolCallId === "string") answered.add(m.toolCallId);
		if (m?.role !== "assistant" || !Array.isArray(m.content)) continue;
		for (const part of [...(m.content as { type?: string; name?: string; id?: string; arguments?: unknown }[])].reverse()) {
			if (part?.type !== "toolCall" || part.name !== "ask_spoken" || typeof part.id !== "string") continue;
			return answered.has(part.id) ? null : spokenQuestionOf(part.id, part.arguments);
		}
	}
	return null;
}
