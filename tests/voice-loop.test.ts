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
import { createFauxCore, fauxAssistantMessage, fauxText, type FauxResponseStep } from "@earendil-works/pi-ai";
import { composeInstructions, createTeacherAgent } from "../src/agent/teacher-agent.ts";
import { handleChatRequest } from "../src/server/chat-handler.ts";
import { chatStore } from "../src/store/chats.ts";
import { replyTextOf, runVoiceLoop, SentenceSplitter, type SpeechIn, type SpeechInHandlers, type SpeechOut, type VoiceState } from "../src/core/speech.ts";
import { createChatTurnSender } from "../components/speech/chat-turn-sender.ts";
import type { PiEngine } from "../src/agent/models.ts";

const streamRoute = await import("../app/api/chats/[id]/stream/route.ts");
const recordRoute = await import("../app/api/chats/[id]/route.ts");

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
function routedFetch(engine: PiEngine): typeof fetch {
	const factory: Parameters<typeof handleChatRequest>[1] = (opts) => createTeacherAgent(undefined, { engine, messages: opts.messages, promptProfile: "voice" });
	return (async (input: string, init?: RequestInit) => {
		const req = new Request(`http://kvasir.test${input}`, init);
		if (input === "/api/chat") return handleChatRequest(req, factory);
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

	it("an utterance while the tutor is speaking is dropped until P3-4's barge-in", async () => {
		const { engine } = scripted([REPLIES[0]!]);
		const chat = configuredChat("Voice loop busy");
		const speechIn = new FauxSpeechIn();
		const speechOut = new FauxSpeechOut();
		speechOut.hold = true;
		const heard: string[] = [];
		const loop = await runVoiceLoop({ speechIn, speechOut, sendTurn: createChatTurnSender(chat.id, routedFetch(engine)), onHeard: (u) => heard.push(u) });
		speechIn.say(SAID[0]!);
		await until(() => speechOut.spoken.length === 1, "the first sentence");
		speechIn.say("Wait, one moment.");
		assert.deepEqual(heard, [SAID[0]]);
		await loop.stop();
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
		assert.deepEqual(calls, ["/api/chat", "/api/chats/chat_x/stream", "/api/chats/chat_x"]);
	});

	it("a refused turn is an error the loop reports", async () => {
		const fetchFn = (async () => new Response("No model configured", { status: 503 })) as unknown as typeof fetch;
		await assert.rejects(async () => {
			for await (const _ of createChatTurnSender("chat_x", fetchFn)("Hi", new AbortController().signal)) void _;
		}, /No model configured/);
	});
});
