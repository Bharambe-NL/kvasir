/**
 * The voice review (Kvasir P3-6, the "Done when"): a due queue cleared by
 * voice. Faux SpeechIn and SpeechOut drive the real voice loop, the app's
 * own review sender (components/speech/review-voice.ts) and the REAL
 * /api/review route over a temp copy of the golden data, in process. The
 * copy has no model slots and the environment no provider keys, so no
 * model is ever reached (D182, and the test rule).
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { after, describe, it } from "node:test";

const GOLDEN = fileURLToPath(new URL("./fixtures/golden-data", import.meta.url));
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "kv-voice-review-"));
fs.cpSync(GOLDEN, TMP, { recursive: true });
const settingsFile = path.join(TMP, "settings.json");
const settings = JSON.parse(fs.readFileSync(settingsFile, "utf8"));
delete settings.models;
fs.writeFileSync(settingsFile, JSON.stringify(settings));
process.env.KV_DATA_DIR = TMP;
process.env.KV_AUTH_FILE = path.join(TMP, "auth.json");
for (const key of Object.keys(process.env)) if (/_API_KEY$|_TOKEN$/.test(key)) delete process.env[key];

const { runVoiceLoop } = await import("../src/core/speech.ts");
const { createReviewTurnSender, endLine, openingLine, ratingFromWords, spokenQuestion, VOICE_REVIEW_TEXT } = await import("../src/core/voice-review.ts");
const { createReviewVoiceSender } = await import("../components/speech/review-voice.ts");
const { learnerStore } = await import("../src/store/learner.ts");
const reviewRoute = await import("../app/api/review/route.ts");
type SpeechIn = import("../src/core/speech.ts").SpeechIn;
type SpeechInHandlers = import("../src/core/speech.ts").SpeechInHandlers;
type SpeechOut = import("../src/core/speech.ts").SpeechOut;
type VoiceTimers = import("../src/core/speech.ts").VoiceTimers;
type ReviewQueueItem = import("../src/core/review-view.ts").ReviewQueueItem;

after(() => {
	fs.rmSync(TMP, { recursive: true, force: true });
});

/** fetch, routed to the real review handlers in this process. */
const routedFetch = (async (input: string, init?: RequestInit) => {
	if (input !== "/api/review") throw new Error(`unrouted ${input}`);
	const req = new Request(`http://kvasir.test${input}`, init);
	return req.method === "POST" ? reviewRoute.POST(req) : reviewRoute.GET();
}) as typeof fetch;

class FauxSpeechIn implements SpeechIn {
	handlers: SpeechInHandlers | null = null;
	async start(handlers: SpeechInHandlers) {
		this.handlers = handlers;
	}
	async stop() {}
	say(utterance: string) {
		this.handlers!.onFinal(utterance);
	}
	hear(partial: string) {
		this.handlers!.onPartial(partial);
	}
}

class FauxSpeechOut implements SpeechOut {
	spoken: string[] = [];
	hold = false;
	private waiting: (() => void)[] = [];
	async speak(sentence: string) {
		this.spoken.push(sentence);
		if (this.hold) await new Promise<void>((r) => this.waiting.push(r));
	}
	stop() {
		this.release();
	}
	release() {
		this.hold = false;
		for (const r of this.waiting.splice(0)) r();
	}
}

class FakeClock implements VoiceTimers {
	now = 0;
	private pending: { at: number; fn: () => void; id: number }[] = [];
	private next = 1;
	set(fn: () => void, ms: number) {
		const id = this.next++;
		this.pending.push({ at: this.now + ms, fn, id });
		return id;
	}
	clear(handle: unknown) {
		this.pending = this.pending.filter((t) => t.id !== handle);
	}
	async advance(ms: number) {
		const until = this.now + ms;
		for (;;) {
			const due = this.pending.filter((t) => t.at <= until).sort((a, b) => a.at - b.at)[0];
			if (!due) break;
			this.pending = this.pending.filter((t) => t !== due);
			this.now = due.at;
			due.fn();
			await settle();
		}
		this.now = until;
		await settle();
	}
}

const settle = async () => {
	for (let i = 0; i < 20; i++) await new Promise<void>((r) => setImmediate(r));
};

async function until(cond: () => boolean, what: string) {
	for (let i = 0; i < 400; i++) {
		if (cond()) return;
		await new Promise((r) => setTimeout(r, 5));
	}
	assert.fail(`timed out waiting for ${what}`);
}

const item = (nodeId: string, prompt: string, answer: string): ReviewQueueItem => ({
	nodeId,
	name: nodeId,
	phase: "new",
	question: { format: "cue", prompt, answer },
	previews: { 1: "", 2: "", 3: "", 4: "" },
});

/** A review sender over an in-memory queue, for the script's edges. */
function memorySender(queue: ReviewQueueItem[], fail = 0) {
	const saved: { nodeId: string; rating: number }[] = [];
	const events: string[] = [];
	let failures = fail;
	const sender = createReviewTurnSender({
		loadQueue: async () => queue.slice(),
		record: async (r) => {
			if (failures > 0) {
				failures--;
				throw new Error("offline");
			}
			saved.push({ nodeId: r.nodeId, rating: r.rating });
			queue.splice(queue.findIndex((q) => q.nodeId === r.nodeId), 1);
		},
		newId: () => `rev_${saved.length}`,
		onSaved: () => events.push("saved"),
		onSaveFailed: () => events.push("failed"),
	});
	return { sender, saved, events };
}

async function collect(stream: AsyncIterable<string>) {
	let out = "";
	for await (const text of stream) out += text;
	return out;
}
const never = new AbortController().signal;

describe("ratingFromWords (D185)", () => {
	it("hears each rating name and number, anywhere in a short reply", () => {
		const cases: [string, number][] = [
			["Again", 1], ["one", 1], ["1", 1],
			["hard.", 2], ["Two", 2],
			["good", 3], ["three", 3],
			["Easy!", 4], ["four", 4],
			["That was hard", 2], ["I'd say good, yes", 3],
		];
		for (const [text, rating] of cases) assert.equal(ratingFromWords(text), rating, text);
	});

	it("is null with no rating heard or two different ones", () => {
		for (const text of ["", "hmm", "I think so", "hard or easy", "good, no, again"]) assert.equal(ratingFromWords(text), null, text);
	});

	it("a repeated word is one rating; negation is not handled", () => {
		assert.equal(ratingFromWords("good good"), 3);
		assert.equal(ratingFromWords("not easy"), 4);
	});
});

describe("the spoken lines", () => {
	it("reads the count, the end and a fallback card", () => {
		assert.equal(openingLine(20), "20 cards due. Here is the first.");
		assert.equal(openingLine(1), "1 card due.");
		assert.equal(endLine(20), "That's all 20 cards for today.");
		assert.equal(endLine(1), "That's all 1 card for today.");
		assert.equal(spokenQuestion({ question: { format: "fallback", prompt: "Recall: Register of information", answer: "" } }), "Recall: Register of information.");
		assert.equal(spokenQuestion({ question: { format: "cue", prompt: "Who keeps the register?", answer: "" } }), "Who keeps the register?");
	});
});

describe("the review script", () => {
	it("question, answer, rating, next question, then the end line", async () => {
		const { sender, saved, events } = memorySender([item("a", "Cue A?", "Answer A."), item("b", "Cue B?", "Answer B.")]);
		assert.equal(await collect(sender("", never)), "2 cards due. Here is the first. Cue A?");
		assert.equal(sender.openQuestion(), "Cue A?");
		assert.equal(await collect(sender("I don't know", never)), "Answer A.");
		assert.equal(sender.openQuestion(), VOICE_REVIEW_TEXT.askRating);
		assert.equal(await collect(sender("hmm", never)), VOICE_REVIEW_TEXT.askRating);
		assert.equal(saved.length, 0);
		assert.equal(await collect(sender("good", never)), "Cue B?");
		assert.equal(await collect(sender("skip", never)), "Answer B.");
		assert.equal(await collect(sender("easy", never)), "That's all 2 cards for today.");
		assert.deepEqual(saved, [{ nodeId: "a", rating: 3 }, { nodeId: "b", rating: 4 }]);
		assert.deepEqual(events, ["saved", "saved"]);
		assert.equal(sender.done(), true);
		assert.equal(sender.openQuestion(), null);
	});

	it("an empty queue says nothing is due", async () => {
		const { sender } = memorySender([]);
		assert.equal(await collect(sender("", never)), VOICE_REVIEW_TEXT.nothingDue);
		assert.equal(sender.done(), true);
	});

	it("a failed save asks for the rating again and keeps the card", async () => {
		const { sender, saved, events } = memorySender([item("a", "Cue A?", "Answer A.")], 1);
		await collect(sender("", never));
		await collect(sender("no idea", never));
		assert.equal(await collect(sender("again", never)), VOICE_REVIEW_TEXT.saveFailed);
		assert.deepEqual(events, ["failed"]);
		assert.equal(sender.openQuestion(), VOICE_REVIEW_TEXT.askRating);
		assert.equal(await collect(sender("again", never)), "That's all 1 card for today.");
		assert.deepEqual(saved, [{ nodeId: "a", rating: 1 }]);
	});
});

describe("on the voice loop", () => {
	it("a barge-in over the question is the answer; silence after the answer asks for the rating, then pauses", async () => {
		const { sender, saved } = memorySender([item("a", "First sentence. Second sentence?", "Answer A.")]);
		const speechIn = new FauxSpeechIn();
		const speechOut = new FauxSpeechOut();
		const clock = new FakeClock();
		const states: string[] = [];
		speechOut.hold = true;
		const loop = await runVoiceLoop({ speechIn, speechOut, sendTurn: sender, openQuestion: sender.openQuestion, speakFirst: true, timers: clock, onState: (s) => states.push(s) });
		await until(() => speechOut.spoken.length === 1, "the opening");
		speechIn.hear("the firm");
		speechIn.say("the firm keeps it");
		await until(() => speechOut.spoken.includes("Answer A."), "the answer");
		assert.ok(!speechOut.spoken.includes("Second sentence?"), "the question was cut off");
		speechOut.release();
		await settle();
		await clock.advance(20_000);
		assert.equal(speechOut.spoken.at(-1), VOICE_REVIEW_TEXT.askRating);
		await clock.advance(60_000);
		assert.equal(states.at(-1), "paused");
		speechIn.say("good");
		await until(() => saved.length === 1, "the saved rating");
		assert.equal(saved[0]!.rating, 3);
		await loop.stop();
	});
});

describe("Done when: a due queue can be cleared by voice", () => {
	it("clears the 20-card queue of the golden data through the real review route", async () => {
		const before = learnerStore.readReviews().length;
		const initial = ((await (await routedFetch("/api/review")).json()) as { items: ReviewQueueItem[] }).items;
		assert.equal(initial.length, 20);

		const speechIn = new FauxSpeechIn();
		const speechOut = new FauxSpeechOut();
		let tones = 0;
		let turns = 0;
		const progress: number[] = [];
		const sender = createReviewVoiceSender({ onSaved: () => tones++, onProgress: (p) => progress.push(p.due) }, routedFetch);
		const loop = await runVoiceLoop({
			speechIn, speechOut, sendTurn: sender, openQuestion: sender.openQuestion, speakFirst: true,
			onState: (s) => { if (s === "listening") turns++; },
		});
		/** Say one utterance and wait until its whole reply is spoken. */
		const turn = async (utterance: string, what: string) => {
			const from = speechOut.spoken.length;
			const seen = turns;
			speechIn.say(utterance);
			await until(() => turns > seen, what);
			return speechOut.spoken.slice(from).join(" ");
		};
		await until(() => turns >= 2, "the opening");
		assert.equal(speechOut.spoken[0], "20 cards due.");

		const RATINGS = ["good", "That was hard", "easy", "three"];
		const squash = (t: string) => t.replace(/\s+/g, " ").trim();
		for (let i = 0; i < 20; i++) {
			assert.equal(squash(await turn("I think it is about the register", `answer ${i + 1}`)), squash(initial[i]!.question.answer));
			const next = await turn(RATINGS[i % RATINGS.length]!, `card ${i + 1} rated`);
			if (i < 19) assert.equal(next, spokenQuestion(initial[i + 1]!));
		}
		assert.equal(speechOut.spoken.at(-1), "That's all 20 cards for today.");
		assert.equal(sender.done(), true);
		assert.equal(tones, 20);
		assert.equal(progress.at(-1), 0);

		const reviews = learnerStore.readReviews().slice(before);
		assert.equal(reviews.length, 20);
		assert.deepEqual(reviews.map((r) => r.nodeId), initial.map((q) => q.nodeId));
		assert.deepEqual(reviews.map((r) => r.rating), Array.from({ length: 20 }, (_, i) => [3, 2, 4, 3][i % 4]));
		const after = ((await (await routedFetch("/api/review")).json()) as { items: unknown[] }).items;
		assert.equal(after.length, 0);
		await loop.stop();
	});
});
