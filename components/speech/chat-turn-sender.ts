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
 */

import { buildAnswer, openSpokenQuestion, questionDataFor, replyAfterLastInput, replyTextFromSse, type SpokenQuestion, type TurnSender } from "@/src/core";

export function createChatTurnSender(chatId: string, fetchFn: typeof fetch = fetch): TurnSender {
	const chat = `/api/chats/${encodeURIComponent(chatId)}`;
	let open: SpokenQuestion | null = null;
	let resumed = false;

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

	return async function* send(utterance, signal) {
		if (!resumed) {
			resumed = true;
			const messages = await readRecord(signal);
			if (messages) open = openSpokenQuestion(messages);
		}
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
	};
}
