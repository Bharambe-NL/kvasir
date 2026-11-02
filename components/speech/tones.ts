/**
 * Drive mode's tones (Kvasir P3-5, D177), made with Web Audio, no files:
 * a soft rising tone when a session starts or resumes, a falling tone when
 * it pauses or ends, a low double tone on an error, and (P3-6, D186) one
 * short soft note when a voice review saves a rating. Soft sine notes with
 * short fades, so they do not startle while driving.
 */

export type ToneKind = "start" | "stop" | "error" | "saved";

export interface Note {
	/** Hz */
	freq: number;
	/** Seconds from the tone's start. */
	at: number;
	/** Seconds. */
	length: number;
}

export const TONES: Record<ToneKind, Note[]> = {
	start: [{ freq: 523.25, at: 0, length: 0.14 }, { freq: 783.99, at: 0.12, length: 0.2 }],
	stop: [{ freq: 783.99, at: 0, length: 0.14 }, { freq: 523.25, at: 0.12, length: 0.22 }],
	error: [{ freq: 220, at: 0, length: 0.16 }, { freq: 220, at: 0.24, length: 0.16 }],
	saved: [{ freq: 659.25, at: 0, length: 0.12 }],
};

const VOLUME = 0.12;
let shared: AudioContext | null = null;

/** Play one tone; resolves when it has finished. Silent where Web Audio is missing. */
export function playTone(kind: ToneKind, makeContext: () => AudioContext = () => (shared ??= new AudioContext())): Promise<void> {
	let ctx: AudioContext;
	try {
		ctx = makeContext();
	} catch {
		return Promise.resolve();
	}
	const t0 = ctx.currentTime + 0.02;
	let end = 0;
	for (const note of TONES[kind]) {
		const osc = ctx.createOscillator();
		const gain = ctx.createGain();
		osc.type = "sine";
		osc.frequency.value = note.freq;
		const start = t0 + note.at;
		const stop = start + note.length;
		gain.gain.setValueAtTime(0, start);
		gain.gain.linearRampToValueAtTime(VOLUME, start + 0.02);
		gain.gain.linearRampToValueAtTime(0, stop);
		osc.connect(gain).connect(ctx.destination);
		osc.start(start);
		osc.stop(stop + 0.01);
		end = Math.max(end, note.at + note.length);
	}
	return new Promise((resolve) => setTimeout(resolve, (end + 0.05) * 1000));
}
