"use client";

/**
 * The voice review (Kvasir P3-6, D182 to D186): today's review queue on the
 * drive screen. Start reads the first question; he answers aloud, hears
 * the stored answer and says a rating word. A soft tone marks each saved
 * rating. The session ends by itself once the closing line is spoken.
 */

import { useCallback, useRef, useState } from "react";
import { reviewPlace, runVoiceLoop, VOICE_REVIEW_TEXT, type ReviewTurnSender, type VoiceReviewProgress } from "@/src/core";
import { createDeepgramSpeechIn } from "@/components/speech/deepgram-speech-in";
import { createReviewVoiceSender } from "@/components/speech/review-voice";
import { playTone } from "@/components/speech/tones";
import { DriveView, useDriveSession, type DriveLoopContext } from "./drive-mode";

export function DriveReview() {
	const [progress, setProgress] = useState<VoiceReviewProgress>({ rated: 0, due: 0 });
	const senderRef = useRef<ReviewTurnSender | null>(null);

	const begin = useCallback(async ({ speechOut, onState, onError }: DriveLoopContext) => {
		const sendTurn = createReviewVoiceSender({
			onSaved: () => void playTone("saved"),
			onSaveFailed: () => void playTone("error"),
			onProgress: setProgress,
		});
		senderRef.current = sendTurn;
		return runVoiceLoop({
			speechIn: createDeepgramSpeechIn({ language: "en" }),
			speechOut,
			sendTurn,
			openQuestion: sendTurn.openQuestion,
			speakFirst: true,
			onState,
			onError,
		});
	}, []);

	const session = useDriveSession(begin, () => {
		if (senderRef.current?.done()) void session.end();
	});

	return <DriveView
		phase={session.phase}
		error={session.error}
		visuals={0}
		chatId={null}
		running={session.running}
		onToggle={session.onToggle}
		onEnd={session.onEnd}
		onAddKey={session.onAddKey}
		hint={VOICE_REVIEW_TEXT.ready}
		corner={session.running ? reviewPlace(progress) : ""}
	/>;
}
