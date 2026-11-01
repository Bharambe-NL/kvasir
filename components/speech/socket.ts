/**
 * The small WebSocket and token seams the Deepgram adapters share (Kvasir
 * P3-2), injected so the tests drive the adapters with fakes.
 */

/** What the adapters use of a WebSocket. */
export interface SocketLike {
	readonly readyState: number;
	binaryType: string;
	send(data: string | ArrayBufferLike | ArrayBufferView): void;
	close(code?: number): void;
	addEventListener(type: "open" | "close" | "error" | "message", listener: (ev: { data?: unknown; code?: number }) => void): void;
}

export type OpenSocket = (url: string, protocols: string[]) => SocketLike;

export const OPEN = 1;

export const browserSocket: OpenSocket = (url, protocols) => new WebSocket(url, protocols) as unknown as SocketLike;

/** A short-lived Deepgram token from the server (D156); the key stays
 *  there. The same route mints for listening and speaking. */
export async function mintDeepgramToken(fetchFn: typeof fetch = fetch): Promise<string> {
	const res = await fetchFn("/api/stt/token");
	const data = (await res.json().catch(() => ({}))) as { token?: string; message?: string };
	if (!res.ok || !data.token) throw new Error(res.status === 503 ? "Voice needs a Deepgram key" : (data.message ?? `token route ${res.status}`));
	return data.token;
}

/** Open a socket and wait for it to be ready. Minted tokens authenticate
 *  with the "bearer" subprotocol, as dictation's do. */
export function openReady(open: OpenSocket, url: string, token: string): Promise<SocketLike> {
	return new Promise((resolve, reject) => {
		const ws = open(url, ["bearer", token]);
		ws.binaryType = "arraybuffer";
		ws.addEventListener("open", () => resolve(ws));
		ws.addEventListener("error", () => reject(new Error("Deepgram connection failed")));
	});
}
