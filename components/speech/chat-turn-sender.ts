/**
 * The voice loop's TurnSender for the app (Kvasir P3-2): one spoken
 * utterance becomes a chat text input. POST /api/chat acknowledges and
 * closes; the turn streams on GET /api/chats/[id]/stream (a full replay,
 * then live events), read through replyTextFromSse. A short turn can settle
 * before the stream is attached ({"type":"turn-settled"} and nothing else);
 * then the reply comes from the chat record.
 */

import { replyAfterLastUser, replyTextFromSse, type TurnSender } from "@/src/core";

export function createChatTurnSender(chatId: string, fetchFn: typeof fetch = fetch): TurnSender {
	return async function* send(utterance, signal) {
		const ack = await fetchFn("/api/chat", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ chatId, input: { type: "text", text: utterance } }),
			signal,
		});
		if (!ack.ok) throw new Error((await ack.text().catch(() => "")) || `chat ${ack.status}`);
		const stream = await fetchFn(`/api/chats/${encodeURIComponent(chatId)}/stream`, { signal });
		if (!stream.ok || !stream.body) throw new Error(`chat stream ${stream.status}`);
		let spoke = false;
		for await (const text of replyTextFromSse(stream.body, signal)) {
			spoke = true;
			yield text;
		}
		if (spoke || signal.aborted) return;
		const record = await fetchFn(`/api/chats/${encodeURIComponent(chatId)}`, { signal });
		if (!record.ok) return;
		const { messages } = (await record.json()) as { messages?: unknown[] };
		const reply = replyAfterLastUser(messages ?? []);
		if (reply) yield reply;
	};
}
