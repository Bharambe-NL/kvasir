/**
 * The voice loop end to end (Kvasir P3-2, the "Done when"): faux SpeechIn
 * and SpeechOut adapters drive a full scripted session through the REAL
 * chat handler, the real reattach stream and the real record route, in
 * process. The app's own turn sender (components/speech/chat-turn-sender.ts)
 * talks to them through a routed fetch; the faux model runs the teacher on
 * the voice prompt profile. Each reply is spoken sentence by sentence
 * while it streams (D155); stop() mid-reply cuts the rest.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createFauxCore, fauxAssistantMessage, fauxText, fauxToolCall, type FauxResponseStep } from "@earendil-works/pi-ai";
import { askSpokenToolFor } from "../src/agent/tools.ts";
import { composeInstructions, createTeacherAgent } from "../src/agent/teacher-agent.ts";
import { handleChatRequest } from "../src/server/chat-handler.ts";
import { chatStore } from "../src/store/chats.ts";
import { replyTextOf, runVoiceLoop, SentenceSplitter, type SpeechIn, type SpeechInHandlers, type SpeechOut, type VoiceState } from "../src/core/speech.ts";
import { createChatTurnSender } from "../components/speech/chat-turn-sender.ts";
import type { PiEngine } from "../src/agent/models.ts";

const streamRoute = await import("../app/api/chats/[id]/stream/route.ts");
const recordRoute = await import("../app/api/chats/[id]/route.ts");
const abortRoute = await import("../app/api/activity/abort/route.ts");

// The key-presence turn gate reads the environment (as in chat-flow).
process.env.OPENROUTER_API_KEY ??= "test-key-presence-gate";

const REPLIES = [
	"Here is the core rule. The firm stays responsible, even when a cloud provider runs the service. Who do you think the regulator calls when Wero stops?",
	"Right, the firm. Article 28 then asks for a register, e.g. of every provider. Why might a regulator want even the small ones listed?",
	"Here is a nudge. Picture forty firms all naming the same provider. What happens if it goes down?",
];
const SAID = ["Teach me DORA Article 28.", "The firm, I think.", "No idea."];

const sentences = (text: string) => {
	const s = new SentenceSplitter();
	return [...s.push(text), ...s.flush()];
};

/** A scripted model; records each system prompt it was given (the first,
 *  system-role message of the context the engine sees). */
function scripted(replies: string[]) {
	const prompts: string[] = [];
	const faux = createFauxCore({});
	faux.setResponses(replies.map((text): FauxResponseStep => (context) => {
		const system = (context.messages as { role?: string; content?: unknown }[]).find((m) => m.role === "system");
		prompts.push(typeof system?.content === "string" ? system.content : "");
		return fauxAssistantMessage([fauxText(text)]);
	}));
	const engine: PiEngine = { model: faux.getModel(), streamFn: faux.streamSimple };
	return { engine, prompts };
}

/** fetch, routed to the real handlers in this process. */
function routedFetch(engine: PiEngine, calls: string[] = []): typeof fetch {
	const factory: Parameters<typeof handleChatRequest>[1] = (opts) => createTeacherAgent(undefined, { engine, messages: opts.messages, promptProfile: "voice" });
	return (async (input: string, init?: RequestInit) => {
		calls.push(input);
		const req = new Request(`http://kvasir.test${input}`, init);
		if (input === "/api/chat") return handleChatRequest(req, factory);
		if (input === "/api/activity/abort") return abortRoute.POST(req);
		const m = /^\/api\/chats\/([^/]+)(\/stream)?$/.exec(input);
		if (!m) throw new Error(`unrouted ${input}`);
		const ctx = { params: Promise.resolve({ id: decodeURIComponent(m[1]!) }) };
		return m[2] ? streamRoute.GET(req, ctx) : recordRoute.GET(req, ctx);
	}) as typeof fetch;
}

class FauxSpeechIn implements SpeechIn {
	handlers: SpeechInHandlers | null = null;
	stopped = false;
	async start(handlers: SpeechInHandlers) {
		this.handlers = handlers;
	}
	async stop() {
		this.stopped = true;
	}
	say(utterance: string) {
		this.handlers!.onFinal(utterance);
	}
	hear(partial: string) {
		this.handlers!.onPartial?.(partial);
	}
}

class FauxSpeechOut implements SpeechOut {
	spoken: string[] = [];
	stops = 0;
	/** When set, speak() waits for release() (to stop mid-reply). */
	hold = false;
	private waiting: (() => void)[] = [];
	async speak(sentence: string) {
		this.spoken.push(sentence);
		if (this.hold) await new Promise<void>((r) => this.waiting.push(r));
	}
	stop() {
		this.stops++;
		this.release();
	}
	/** Let held sentences finish playing. */
	release() {
		this.hold = false;
		for (const r of this.waiting.splice(0)) r();
	}
}

async function until(cond: () => boolean, what: string) {
	for (let i = 0; i < 400; i++) {
		if (cond()) return;
		await new Promise((r) => setTimeout(r, 5));
	}
	assert.fail(`timed out waiting for ${what}`);
}

function configuredChat(title: string) {
	const chat = chatStore.createChat(title);
	chatStore.saveSettings(chat.id, { model: { provider: "openrouter", id: "z-ai/glm-5.3-flash" } });
	return chat;
}

describe("the voice loop, end to end with faux speech", () => {
	it("three spoken turns: heard, sent, streamed, spoken sentence by sentence, recorded", async () => {
		const { engine, prompts } = scripted(REPLIES);
		const chat = configuredChat("Voice loop");
		const speechIn = new FauxSpeechIn();
		const speechOut = new FauxSpeechOut();
		const states: VoiceState[] = [];
		const heard: string[] = [];
		const errors: Error[] = [];
		const loop = await runVoiceLoop({
			speechIn,
			speechOut,
			sendTurn: createChatTurnSender(chat.id, routedFetch(engine)),
			onState: (s) => states.push(s),
			onHeard: (u) => heard.push(u),
			onError: (e) => errors.push(e),
		});

		for (let turn = 0; turn < SAID.length; turn++) {
			const before = speechOut.spoken.length;
			speechIn.say(SAID[turn]!);
			await until(() => states.at(-1) === "listening" && speechOut.spoken.length > before, `turn ${turn + 1}`);
			assert.deepEqual(speechOut.spoken.slice(before), sentences(REPLIES[turn]!), `turn ${turn + 1} spoken sentence by sentence`);
		}
		await loop.stop();

		assert.deepEqual(errors, []);
		assert.deepEqual(heard, SAID);
		assert.equal(speechOut.spoken.length, 9, "three sentences in each reply");
		assert.ok(speechOut.spoken.includes("Article 28 then asks for a register, e.g. of every provider."), "abbreviations stay in their sentence");
		assert.deepEqual(states, ["listening", ...SAID.flatMap(() => ["thinking", "speaking", "listening"]), "stopped"] as VoiceState[]);
		assert.ok(speechIn.stopped, "stop() stops listening");

		const record = chatStore.getChat(chat.id)!;
		const users = record.messages.filter((m) => m.role === "user");
		assert.equal(users.length, 3, "every utterance is in the record");
		assert.deepEqual(record.messages.filter((m) => m.role === "assistant").map(replyTextOf), REPLIES);
		const voice = composeInstructions("teacher", undefined, "voice");
		assert.equal(prompts.length, 3);
		assert.ok(prompts.every((p) => p.startsWith(voice)), "the teacher ran on the voice profile");
	});

	it("stop() mid-reply cuts the remaining sentences and stops both sides", async () => {
		const { engine } = scripted([REPLIES[0]!]);
		const chat = configuredChat("Voice loop stop");
		const speechIn = new FauxSpeechIn();
		const speechOut = new FauxSpeechOut();
		speechOut.hold = true;
		const states: VoiceState[] = [];
		const loop = await runVoiceLoop({ speechIn, speechOut, sendTurn: createChatTurnSender(chat.id, routedFetch(engine)), onState: (s) => states.push(s) });
		speechIn.say(SAID[0]!);
		await until(() => speechOut.spoken.length === 1, "the first sentence");
		await loop.stop();
		await new Promise((r) => setTimeout(r, 30));
		assert.deepEqual(speechOut.spoken, ["Here is the core rule."], "nothing after the stop is spoken");
		assert.equal(speechOut.stops, 1);
		assert.ok(speechIn.stopped);
		assert.equal(states.at(-1), "stopped");
	});
});

describe("barge-in (P3-4, D166, D167)", () => {
	it("two heard words over the tutor cut it off, and what he said gets the next reply", async () => {
		const { engine } = scripted([REPLIES[0]!, "Sure. Take a moment."]);
		const chat = configuredChat("Barge-in speaking");
		const speechIn = new FauxSpeechIn();
		const speechOut = new FauxSpeechOut();
		speechOut.hold = true;
		const heard: string[] = [];
		const states: VoiceState[] = [];
		const errors: Error[] = [];
		const loop = await runVoiceLoop({ speechIn, speechOut, sendTurn: createChatTurnSender(chat.id, routedFetch(engine)), onHeard: (u) => heard.push(u), onState: (s) => states.push(s), onError: (e) => errors.push(e) });
		speechIn.say(SAID[0]!);
		await until(() => speechOut.spoken.length === 1, "the first sentence");
		speechIn.hear("wait one");
		assert.equal(speechOut.stops, 1, "speech stops at the second word");
		speechOut.hold = false;
		speechIn.say("Wait, one moment.");
		await until(() => speechOut.spoken.includes("Take a moment.") && states.at(-1) === "listening", "the reply to the barge-in");
		await loop.stop();
		assert.deepEqual(errors, []);
		assert.deepEqual(heard, [SAID[0], "Wait, one moment."]);
		assert.deepEqual(speechOut.spoken, ["Here is the core rule.", "Sure.", "Take a moment."], "the rest of the first reply is never spoken");
		const users = chatStore.getChat(chat.id)!.messages.filter((m) => m.role === "user");
		assert.equal(users.length, 2);
	});

	it("a cough or a single word does not cut the tutor off", async () => {
		const { engine } = scripted([REPLIES[0]!]);
		const chat = configuredChat("Barge-in one word");
		const speechIn = new FauxSpeechIn();
		const speechOut = new FauxSpeechOut();
		speechOut.hold = true;
		const heard: string[] = [];
		const states: VoiceState[] = [];
		const loop = await runVoiceLoop({ speechIn, speechOut, sendTurn: createChatTurnSender(chat.id, routedFetch(engine)), onHeard: (u) => heard.push(u), onState: (s) => states.push(s) });
		speechIn.say(SAID[0]!);
		await until(() => speechOut.spoken.length === 1, "the first sentence");
		speechIn.hear("hmm");
		speechIn.say("Hmm.");
		assert.equal(speechOut.stops, 0);
		speechOut.release();
		await until(() => states.at(-1) === "listening", "the reply to finish");
		await loop.stop();
		assert.deepEqual(heard, [SAID[0]]);
		assert.deepEqual(speechOut.spoken, sentences(REPLIES[0]!), "the whole reply is spoken");
	});

	it("cutting in while the reply streams aborts the turn on the server; the record keeps the reply so far", async () => {
		const LONG = "The first part is short. " + Array.from({ length: 60 }, (_, i) => `word${i}`).join(" ") + ". The end.";
		const faux = createFauxCore({ tokensPerSecond: 60 });
		faux.setResponses([fauxAssistantMessage([fauxText(LONG)]), fauxAssistantMessage([fauxText("Go ahead.")])]);
		const engine: PiEngine = { model: faux.getModel(), streamFn: faux.streamSimple };
		const chat = configuredChat("Barge-in streaming");
		const speechIn = new FauxSpeechIn();
		const speechOut = new FauxSpeechOut();
		const states: VoiceState[] = [];
		const errors: Error[] = [];
		const calls: string[] = [];
		const loop = await runVoiceLoop({ speechIn, speechOut, sendTurn: createChatTurnSender(chat.id, routedFetch(engine, calls)), onState: (s) => states.push(s), onError: (e) => errors.push(e) });
		speechIn.say(SAID[0]!);
		await until(() => speechOut.spoken.length === 1, "the first sentence");
		speechIn.hear("hold on");
		speechIn.say("Hold on, a question.");
		await until(() => speechOut.spoken.includes("Go ahead.") && states.at(-1) === "listening", "the reply to the barge-in");
		await loop.stop();
		assert.deepEqual(errors, []);
		assert.ok(calls.includes("/api/activity/abort"), "the running turn was aborted on the server");
		assert.deepEqual(speechOut.spoken, ["The first part is short.", "Go ahead."]);
		const record = chatStore.getChat(chat.id)!;
		const replies = record.messages.filter((m) => m.role === "assistant").map(replyTextOf);
		assert.equal(replies.length, 2);
		assert.ok(replies[0]!.startsWith("The first part is short.") && !replies[0]!.endsWith("The end."), "the cut reply is kept up to where it stopped");
		assert.equal(replies[1], "Go ahead.");
		assert.deepEqual(record.messages.filter((m) => m.role === "user").length, 2);
	});
});

describe("the chat turn sender", () => {
	it("reads the reply from the record when the turn settled before the stream attached", async () => {
		const sse = (body: string) => new Response(new Blob([body]).stream(), { headers: { "Content-Type": "text/event-stream" } });
		const calls: string[] = [];
		const fetchFn = (async (url: string) => {
			calls.push(url);
			if (url === "/api/chat") return new Response(null, { status: 200 });
			if (url.endsWith("/stream")) return sse('data: {"type":"turn-settled"}\n\ndata: [DONE]\n\n');
			return Response.json({ messages: [{ role: "user", content: "Hi" }, { role: "assistant", timestamp: 1, content: [{ type: "text", text: "Hello there." }] }] });
		}) as typeof fetch;
		const out: string[] = [];
		for await (const t of createChatTurnSender("chat_x", fetchFn)("Hi", new AbortController().signal)) out.push(t);
		assert.deepEqual(out, ["Hello there."]);
		assert.deepEqual(calls, ["/api/chats/chat_x", "/api/chat", "/api/chats/chat_x/stream", "/api/chats/chat_x"], "the record is read once at the start (an open question), then as the fallback");
	});

	it("an aborted turn is aborted on the server, and the next send waits until it has settled (D167)", async () => {
		const calls: string[] = [];
		let releaseSettle: (() => void) | null = null;
		const settled = new Promise<void>((r) => (releaseSettle = r));
		let streams = 0;
		const fetchFn = (async (url: string, init?: RequestInit) => {
			calls.push(url);
			if (url === "/api/chat") return new Response(null, { status: 200 });
			if (url === "/api/activity/abort") return Response.json({ ok: true });
			if (url.endsWith("/stream")) {
				streams++;
				if (streams === 1) {
					// The live turn: one sentence, then held open until aborted.
					const signal = init?.signal;
					return new Response(new ReadableStream({
						start(c) {
							c.enqueue(new TextEncoder().encode('data: {"type":"message_update","message":{"role":"assistant","timestamp":1,"content":[{"type":"text","text":"Part one. "}]}}\n\n'));
							signal?.addEventListener("abort", () => c.error(new DOMException("aborted", "AbortError")));
						},
					}));
				}
				// The settle read after the abort ends once the server says so.
				return new Response(new ReadableStream({ async start(c) { await settled; c.enqueue(new TextEncoder().encode("data: [DONE]\n\n")); c.close(); } }));
			}
			return Response.json({ messages: [] });
		}) as typeof fetch;
		const send = createChatTurnSender("chat_abort", fetchFn);
		const first = new AbortController();
		const it1 = send("One.", first.signal)[Symbol.asyncIterator]();
		assert.equal((await it1.next()).value, "Part one. ");
		first.abort();
		await it1.next().catch(() => {});
		const second = (async () => {
			const out: string[] = [];
			for await (const t of send("Two.", new AbortController().signal)) out.push(t);
			return out;
		})();
		await new Promise((r) => setTimeout(r, 20));
		assert.ok(calls.includes("/api/activity/abort"));
		assert.equal(calls.filter((c) => c === "/api/chat").length, 1, "no second POST while the aborted turn settles");
		releaseSettle!();
		await second;
		assert.equal(calls.filter((c) => c === "/api/chat").length, 2);
		assert.equal(calls.filter((c) => c === "/api/chats/chat_abort").length >= 2, true, "the record is read again after the abort");
	});

	it("a refused turn is an error the loop reports", async () => {
		const fetchFn = (async () => new Response("No model configured", { status: 503 })) as unknown as typeof fetch;
		await assert.rejects(async () => {
			for await (const _ of createChatTurnSender("chat_x", fetchFn)("Hi", new AbortController().signal)) void _;
		}, /No model configured/);
	});
});

describe("spoken questions in the voice loop (P3-3, D160, D162, D163)", () => {
	const QUESTION = "Who does the regulator hold responsible when Wero stops?";
	const COMMITTED = "The firm: it stays fully responsible for services it outsources.";

	/** A voice chat whose faux model asks with ask_spoken. */
	function voiceSession(steps: FauxResponseStep[]) {
		const seen: unknown[][] = [];
		const faux = createFauxCore({});
		faux.setResponses(steps.map((step): FauxResponseStep => (context, ...rest) => {
			seen.push(context.messages as unknown[]);
			return typeof step === "function" ? step(context, ...rest) : step;
		}));
		const engine: PiEngine = { model: faux.getModel(), streamFn: faux.streamSimple };
		const factory: Parameters<typeof handleChatRequest>[1] = (opts) =>
			createTeacherAgent(undefined, { engine, messages: opts.messages, promptProfile: opts.promptProfile, tools: { ask_spoken: askSpokenToolFor() } });
		const fetchFn = (async (input: string, init?: RequestInit) => {
			const req = new Request(`http://kvasir.test${input}`, init);
			if (input === "/api/chat") return handleChatRequest(req, factory);
			const m = /^\/api\/chats\/([^/]+)(\/stream)?$/.exec(input)!;
			const ctx = { params: Promise.resolve({ id: decodeURIComponent(m[1]!) }) };
			return m[2] ? streamRoute.GET(req, ctx) : recordRoute.GET(req, ctx);
		}) as typeof fetch;
		const chat = chatStore.createChat("Voice questions", undefined, { voice: true });
		chatStore.saveSettings(chat.id, { model: { provider: "openrouter", id: "z-ai/glm-5.3-flash" } });
		return { chat, fetchFn, seen };
	}

	it("the question is spoken last, the next utterance is its answer, and the tutor grades it", async () => {
		const { chat, fetchFn, seen } = voiceSession([
			fauxAssistantMessage([fauxText("Here is the core rule. The firm stays responsible."), fauxToolCall("ask_spoken", { question: QUESTION, correctAnswer: COMMITTED }, { id: "q1" })], { stopReason: "toolUse" }),
			fauxAssistantMessage([fauxText("Right, the firm. That is the whole of paragraph one.")]),
		]);
		assert.equal(chatStore.getChat(chat.id)!.voice, true, "the voice flag is on the record");
		const speechIn = new FauxSpeechIn();
		const speechOut = new FauxSpeechOut();
		const states: VoiceState[] = [];
		const loop = await runVoiceLoop({ speechIn, speechOut, sendTurn: createChatTurnSender(chat.id, fetchFn), onState: (s) => states.push(s) });

		speechIn.say("Teach me Article 28.");
		await until(() => states.at(-1) === "listening" && speechOut.spoken.length === 3, "the question");
		assert.deepEqual(speechOut.spoken, ["Here is the core rule.", "The firm stays responsible.", QUESTION], "the question comes last");

		speechIn.say("The firm, I think.");
		await until(() => speechOut.spoken.length === 5 && states.at(-1) === "listening", "the grading reply");
		await loop.stop();
		assert.deepEqual(speechOut.spoken.slice(3), ["Right, the firm.", "That is the whole of paragraph one."]);

		const answerSeen = seen[1]!.at(-1) as { role: string; toolCallId: string; content: { text: string }[] };
		assert.equal(answerSeen.role, "toolResult", "the utterance reached the model as the question's answer (D162)");
		assert.equal(answerSeen.toolCallId, "q1");
		assert.match(answerSeen.content[0]!.text, /The firm, I think\./);
		const record = chatStore.getChat(chat.id)!;
		const result = record.messages.find((m) => m.role === "toolResult") as { details?: { kind?: string; committed?: string } };
		assert.equal(result.details?.kind, "spoken");
		assert.equal(result.details?.committed, COMMITTED, "the commitment rides the answer (D159)");
		assert.equal(record.messages.filter((m) => m.role === "user").length, 1, "only the first utterance was a text input");
	});

	it("a rejected question is never spoken; the corrected one is (D163)", async () => {
		const { chat, fetchFn } = voiceSession([
			fauxAssistantMessage([fauxText("One quick check."), fauxToolCall("ask_spoken", { question: "Who is responsible? And why?" }, { id: "bad" })], { stopReason: "toolUse" }),
			fauxAssistantMessage([fauxToolCall("ask_spoken", { question: QUESTION }, { id: "good" })], { stopReason: "toolUse" }),
		]);
		const speechIn = new FauxSpeechIn();
		const speechOut = new FauxSpeechOut();
		const states: VoiceState[] = [];
		const loop = await runVoiceLoop({ speechIn, speechOut, sendTurn: createChatTurnSender(chat.id, fetchFn), onState: (s) => states.push(s) });
		speechIn.say("Go on.");
		await until(() => states.at(-1) === "listening" && speechOut.spoken.length === 2, "the corrected question");
		await loop.stop();
		assert.deepEqual(speechOut.spoken, ["One quick check.", QUESTION]);
	});

	it("a resumed session answers the question still open in the record", async () => {
		const { chat, fetchFn, seen } = voiceSession([
			fauxAssistantMessage([fauxToolCall("ask_spoken", { question: QUESTION }, { id: "q-open" })], { stopReason: "toolUse" }),
			fauxAssistantMessage([fauxText("Noted.")]),
		]);
		// Turn one through a first sender, which then goes away.
		const send = createChatTurnSender(chat.id, fetchFn);
		for await (const _ of send("Start.", new AbortController().signal)) void _;
		// A new loop (a fresh sender) finds the open question in the record.
		const speechIn = new FauxSpeechIn();
		const speechOut = new FauxSpeechOut();
		const states: VoiceState[] = [];
		const loop = await runVoiceLoop({ speechIn, speechOut, sendTurn: createChatTurnSender(chat.id, fetchFn), onState: (s) => states.push(s) });
		speechIn.say("Payments, at EPI.");
		await until(() => speechOut.spoken.includes("Noted.") && states.at(-1) === "listening", "the reply to the answer");
		await loop.stop();
		const last = seen[1]!.at(-1) as { role: string; toolCallId: string };
		assert.deepEqual([last.role, last.toolCallId], ["toolResult", "q-open"]);
	});
});
