/**
 * The sentence splitter (Kvasir P3-2, D155): streamed text in, finished
 * sentences out, whatever the chunking.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SentenceSplitter } from "../src/core/speech.ts";

function split(chunks: string[]): string[] {
	const s = new SentenceSplitter();
	return [...chunks.flatMap((c) => s.push(c)), ...s.flush()];
}

const TEXT = "The firm stays responsible. Art. 28 says so, e.g. for cloud. It costs 2.5 percent! Why does that matter? Think about Wero";

describe("SentenceSplitter", () => {
	it("splits on full stops, exclamations and questions, keeping abbreviations and numbers whole", () => {
		assert.deepEqual(split([TEXT]), [
			"The firm stays responsible.",
			"Art. 28 says so, e.g. for cloud.",
			"It costs 2.5 percent!",
			"Why does that matter?",
			"Think about Wero",
		]);
	});

	it("gives the same sentences however the stream is chunked", () => {
		const whole = split([TEXT]);
		for (const size of [1, 2, 3, 7, 13]) {
			const chunks = TEXT.match(new RegExp(`[\\s\\S]{1,${size}}`, "g"))!;
			assert.deepEqual(split(chunks), whole, `chunks of ${size}`);
		}
	});

	it("waits at the stream's edge: a full stop with nothing after it is not yet an end", () => {
		const s = new SentenceSplitter();
		assert.deepEqual(s.push("It costs 2."), []);
		assert.deepEqual(s.push("5 percent. Next"), ["It costs 2.5 percent."]);
		assert.deepEqual(s.flush(), ["Next"]);
		assert.deepEqual(s.flush(), [], "flush empties the buffer");
	});

	it("a blank line ends a sentence; initials do not", () => {
		assert.deepEqual(split(["First part\n\nSecond part. Ask J. Smith later."]), ["First part", "Second part.", "Ask J. Smith later."]);
	});
});
