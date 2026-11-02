"use client";

/**
 * The Voice row (Kvasir P3-5, D179, D180): the tutor's voice in voice
 * sessions, one of six Aura-2 voices, stored as settings `speech.voice`.
 * Play sample speaks a short line in the chosen voice through the same
 * SpeechOut adapter a session uses.
 */

import { useEffect, useRef, useState } from "react";
import { FACTORY_SETTINGS, SPEAK_VOICES, VOICE_SAMPLE, isSpeakVoice, sanitizeUserSettings, type SpeakVoice, type UserSettings } from "@/src/core";
import { createDeepgramSpeechOut, type DeepgramSpeechOut } from "@/components/speech/deepgram-speech-out";
import { MenuSelect, SettingsRow } from "@/components/settings/controls";
import { notifySettingsSaved } from "@/components/settings-signal";

const OPTIONS = SPEAK_VOICES.map((v) => ({ value: v.id as SpeakVoice, label: v.label }));

/** The saved voice, read once from /api/settings. */
export async function readSpeakVoice(request: typeof fetch = fetch): Promise<SpeakVoice> {
	try {
		const res = await request("/api/settings");
		if (!res.ok) return FACTORY_SETTINGS.speech.voice;
		const body = (await res.json()) as { settings: UserSettings | null };
		return sanitizeUserSettings(body.settings)?.speech?.voice ?? FACTORY_SETTINGS.speech.voice;
	} catch {
		return FACTORY_SETTINGS.speech.voice;
	}
}

export function VoiceSetting() {
	const [voice, setVoice] = useState<SpeakVoice | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [playing, setPlaying] = useState(false);
	const sample = useRef<DeepgramSpeechOut | null>(null);

	useEffect(() => {
		let live = true;
		void readSpeakVoice().then((v) => live && setVoice(v));
		return () => {
			live = false;
			sample.current?.stop();
			sample.current?.close();
		};
	}, []);

	const save = async (next: SpeakVoice) => {
		const before = voice;
		setVoice(next);
		setError(null);
		try {
			const res = await fetch("/api/settings/speech", {
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ voice: next }),
			});
			const body = res.ok ? ((await res.json()) as { settings?: UserSettings }) : null;
			if (!isSpeakVoice(body?.settings?.speech?.voice)) throw new Error();
			notifySettingsSaved("speech");
		} catch {
			setVoice(before);
			setError("Could not save the voice. Try again.");
		}
	};

	const play = async () => {
		if (!voice || playing) return;
		setPlaying(true);
		setError(null);
		const out = createDeepgramSpeechOut({ voice });
		sample.current = out;
		try {
			await out.speak(VOICE_SAMPLE);
		} catch {
			setError("Could not play the sample. Check the Deepgram key.");
		} finally {
			out.close();
			if (sample.current === out) sample.current = null;
			setPlaying(false);
		}
	};

	return (
		<SettingsRow label="Voice" testid="row-speech-voice" hint={error ? <span role="alert" className="text-destructive">{error}</span> : undefined}>
			<span className="flex items-center gap-2">
				<button
					type="button"
					data-testid="voice-sample"
					onClick={() => void play()}
					disabled={!voice || playing}
					className="h-8 rounded-md border border-border px-2.5 text-control text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
				>
					Play sample
				</button>
				<MenuSelect<SpeakVoice>
					value={voice ?? FACTORY_SETTINGS.speech.voice}
					options={OPTIONS}
					onChange={(next) => void save(next)}
					ariaLabel="Voice"
					testid="speech-voice"
					disabled={voice === null}
				/>
			</span>
		</SettingsRow>
	);
}
