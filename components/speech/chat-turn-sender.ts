/**
 * The voice loop's TurnSender for the app (Kvasir P3-2, P3-3). POST
 * /api/chat acknowledges and closes; the turn streams on GET
 * /api/chats/[id]/stream (a full replay, then live events), read through
 * replyTextFromSse. A short turn can settle before the stream is attached
 * ({"type":"turn-settled"} and nothing else); then the reply comes from the
 * chat record.
 *
 * Spoken questions (D162): while an ask_spoken question is open, the next
 * utterance is its answer, sent through the same answer path the written
 * dock uses (questionDataFor and buildAnswer); otherwise it is a text
 * input. The open question comes from the stream, or from the record when
 * the session resumes.
 *
 * Barge-in (P3-4, D167): when the loop aborts a turn, the sender asks the
 * server to abort it too (POST /api/activity/abort) and reads the stream
 * to its end, which comes once the turn has settled with its partial
 * reply saved. The next send waits for that, so it is never refused as a
 * second running turn, and reads the record again for the open question.
 */

import { buildAnswer, openSpokenQuestion, questionDataFor, replyAfterLastInput, replyTextFromSse, type SpokenQuestion, type TurnSender } from "@/src/core";

/** A TurnSender that also tells the loop which spoken question is open. */
export type ChatTurnSender = TurnSender & { openQuestion(): string | null };

export function createChatTurnSender(chatId: string, fetchFn: typeof fetch = fetch): ChatTurnSender {
	const chat = `/api/chats/${encodeURIComponent(chatId)}`;
	let open: SpokenQuestion | null = null;
	let resumed = false;
	/** An aborted turn settling on the server; the next send waits for it. */
	let settling: Promise<void> = Promise.resolve();

	const abortOnServer = async () => {
		resumed = false;
		open = null;
		try {
			await fetchFn("/api/activity/abort", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ kind: "turn", id: chatId }),
			});
			const stream = await fetchFn(`${chat}/stream`);
			if (stream.body) for await (const _ of replyTextFromSse(stream.body)) void _;
		} catch {
			// The next POST reports a turn that is still running.
		}
	};

	const readRecord = async (signal: AbortSignal): Promise<unknown[] | null> => {
		const res = await fetchFn(chat, { signal });
		if (!res.ok) return null;
		return ((await res.json()) as { messages?: unknown[] }).messages ?? [];
	};

	const inputFor = (utterance: string) => {
		if (!open) return { type: "text", text: utterance };
		const q = open;
		open = null;
		const data = questionDataFor("ask_spoken", q.toolCallId, { question: q.question, ...(q.correctAnswer !== undefined ? { correctAnswer: q.correctAnswer } : {}) });
		return { type: "answer", toolCallId: q.toolCallId, answer: buildAnswer(data, { text: utterance }, "ask_spoken") };
	};

	async function* send(utterance: string, signal: AbortSignal): AsyncGenerator<string> {
		await settling;
		if (!resumed) {
			resumed = true;
			const messages = await readRecord(signal);
			if (messages) open = openSpokenQuestion(messages);
		}
		if (signal.aborted) return;
		signal.addEventListener("abort", () => void (settling = abortOnServer()), { once: true });
		const ack = await fetchFn("/api/chat", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ chatId, input: inputFor(utterance) }),
			signal,
		});
		if (!ack.ok) throw new Error((await ack.text().catch(() => "")) || `chat ${ack.status}`);
		const stream = await fetchFn(`${chat}/stream`, { signal });
		if (!stream.ok || !stream.body) throw new Error(`chat stream ${stream.status}`);
		let spoke = false;
		for await (const text of replyTextFromSse(stream.body, signal, (q) => void (open = q))) {
			spoke = true;
			yield text;
		}
		if (spoke || signal.aborted) return;
		const messages = await readRecord(signal);
		if (!messages) return;
		const reply = replyAfterLastInput(messages);
		open = reply.question;
		if (reply.text) yield reply.text;
	}

	return Object.assign(send, { openQuestion: () => open?.question ?? null });
}
