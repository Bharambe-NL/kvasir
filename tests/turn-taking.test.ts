/**
 * Silence handling in the voice loop (Kvasir P3-4, D169) on a fake clock:
 * with a question open, the question is spoken again after 20 seconds,
 * the pause line 60 seconds later, and anything he says resumes. A
 * scripted TurnSender stands in for the chat; voice-loop.test.ts covers
 * barge-in through the real chat handler.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { NUDGE_AFTER_MS, PAUSE_AFTER_MS, PAUSE_LINE, runVoiceLoop, type SpeechIn, type SpeechInHandlers, type SpeechOut, type TurnSender, type VoiceState, type VoiceTimers } from "../src/core/speech.ts";

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
	get armed() {
		return this.pending.length;
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

class Ears implements SpeechIn {
	handlers!: SpeechInHandlers;
	on = false;
	starts = 0;
	async start(h: SpeechInHandlers) {
		this.handlers = h;
		this.on = true;
		this.starts++;
	}
	async stop() {
		this.on = false;
	}
}
class Mouth implements SpeechOut {
	spoken: string[] = [];
	stops = 0;
	async speak(s: string) {
		this.spoken.push(s);
	}
	stop() {
		this.stops++;
	}
}

const QUESTION = "Who keeps the responsibility when a provider runs the service?";

/** Each turn replies with one sentence and leaves `question` open. A
 *  turn's reply can be held open with `holdReply`. */
function session(question: string | null) {
	const clock = new FakeClock();
	const ears = new Ears();
	const mouth = new Mouth();
	const sent: string[] = [];
	const states: VoiceState[] = [];
	let open: string | null = null;
	const aborted: string[] = [];
	const hold = { on: false };
	const sendTurn: TurnSender = async function* (utterance, signal) {
		sent.push(utterance);
		open = null;
		yield `Reply ${sent.length}. `;
		if (hold.on) {
			await new Promise<void>((r) => signal.addEventListener("abort", () => r(), { once: true }));
			aborted.push(utterance);
			return;
		}
		open = question;
	};
	const start = () => runVoiceLoop({ speechIn: ears, speechOut: mouth, sendTurn, openQuestion: () => open, timers: clock, onState: (s) => states.push(s) });
	return { clock, ears, mouth, sent, states, start, aborted, hold };
}

describe("silence with a question open (P3-4, D169)", () => {
	it("speaks the question again after 20 seconds, then the pause line 60 seconds later, and resumes on speech", async () => {
		const s = session(QUESTION);
		const loop = await s.start();
		s.ears.handlers.onFinal("Teach me Article 28.");
		await settle();
		assert.deepEqual(s.mouth.spoken, ["Reply 1."]);

		await s.clock.advance(NUDGE_AFTER_MS - 1);
		assert.equal(s.mouth.spoken.length, 1, "nothing before 20 seconds");
		await s.clock.advance(1);
		assert.deepEqual(s.mouth.spoken, ["Reply 1.", QUESTION], "the question again, word for word");
		assert.equal(s.states.at(-1), "listening");

		await s.clock.advance(PAUSE_AFTER_MS);
		assert.deepEqual(s.mouth.spoken.slice(2), [PAUSE_LINE]);
		assert.equal(s.states.at(-1), "paused");
		await s.clock.advance(10 * 60_000);
		assert.equal(s.mouth.spoken.length, 3, "nothing more while paused");

		s.ears.handlers.onFinal("Sorry, the firm.");
		await settle();
		assert.deepEqual(s.sent, ["Teach me Article 28.", "Sorry, the firm."], "speech resumes the session as a turn");
		assert.deepEqual(s.states.slice(-3), ["thinking", "speaking", "listening"]);
		await loop.stop();
		assert.equal(s.clock.armed, 0, "stop clears the timers");
	});

	it("words heard reset the silence timer", async () => {
		const s = session(QUESTION);
		const loop = await s.start();
		s.ears.handlers.onFinal("Go on.");
		await settle();
		await s.clock.advance(NUDGE_AFTER_MS - 5_000);
		s.ears.handlers.onPartial?.("well");
		await s.clock.advance(10 * 60_000);
		assert.deepEqual(s.mouth.spoken, ["Reply 1."], "thinking aloud is not silence");
		await loop.stop();
	});

	it("no nudge when no question is open", async () => {
		const s = session(null);
		const loop = await s.start();
		s.ears.handlers.onFinal("Tell me about DORA.");
		await settle();
		assert.equal(s.clock.armed, 0);
		await s.clock.advance(10 * 60_000);
		assert.deepEqual(s.mouth.spoken, ["Reply 1."]);
		await loop.stop();
	});

	it("a short answer over the nudge is still his answer", async () => {
		const s = session(QUESTION);
		let hold: (() => void) | null = null;
		s.mouth.speak = async (line: string) => {
			s.mouth.spoken.push(line);
			if (line === QUESTION) await new Promise<void>((r) => (hold = r));
		};
		s.mouth.stop = () => hold?.();
		const loop = await s.start();
		s.ears.handlers.onFinal("Start.");
		await settle();
		void s.clock.advance(NUDGE_AFTER_MS);
		await settle();
		assert.equal(s.states.at(-1), "speaking");
		s.ears.handlers.onFinal("Firm.");
		await settle();
		assert.deepEqual(s.sent, ["Start.", "Firm."]);
		await loop.stop();
	});
});

describe("pause and resume by hand (P3-5, D175)", () => {
	it("pause mid-reply stops speech, aborts the turn and the microphone; resume listens again", async () => {
		const s = session(QUESTION);
		s.hold.on = true;
		const loop = await s.start();
		s.ears.handlers.onFinal("Teach me Article 28.");
		await settle();
		assert.equal(s.states.at(-1), "speaking");
		await loop.pause();
		await settle();
		assert.deepEqual(s.aborted, ["Teach me Article 28."], "the running turn is aborted");
		assert.equal(s.mouth.stops, 1);
		assert.equal(s.ears.on, false, "the microphone is off");
		assert.equal(s.states.at(-1), "paused", "the aborted turn does not flip it back to listening");
		s.ears.handlers.onFinal("late words");
		await settle();
		assert.deepEqual(s.sent, ["Teach me Article 28."], "nothing is sent while paused");
		await s.clock.advance(10 * 60_000);
		assert.equal(s.clock.armed, 0, "no silence timers while paused");

		s.hold.on = false;
		await loop.resume();
		assert.equal(s.ears.on, true);
		assert.equal(s.ears.starts, 2);
		assert.equal(s.states.at(-1), "listening");
		s.ears.handlers.onFinal("Where were we?");
		await settle();
		assert.deepEqual(s.sent, ["Teach me Article 28.", "Where were we?"]);
		await loop.stop();
	});

	it("the button resumes a silence pause without restarting the microphone", async () => {
		const s = session(QUESTION);
		const loop = await s.start();
		s.ears.handlers.onFinal("Go on.");
		await settle();
		await s.clock.advance(NUDGE_AFTER_MS + PAUSE_AFTER_MS);
		assert.equal(s.states.at(-1), "paused");
		await loop.resume();
		assert.equal(s.states.at(-1), "listening");
		assert.equal(s.ears.starts, 1);
		await loop.stop();
	});

	it("pause and resume after stop do nothing", async () => {
		const s = session(null);
		const loop = await s.start();
		await loop.stop();
		await loop.pause();
		await loop.resume();
		assert.equal(s.states.at(-1), "stopped");
		assert.equal(s.ears.starts, 1);
	});
});
