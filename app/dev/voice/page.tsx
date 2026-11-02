import { notFound } from "next/navigation";
import { VoiceLab } from "@/components/speech/voice-lab";

export const dynamic = "force-dynamic";

/** The dev-only voice page (Kvasir P3-4, D171): runs a live voice session
 *  for the turn-taking test log. Production builds answer 404; drive mode
 *  (P3-5) replaces it. */
export default function DevVoicePage() {
	if (process.env.NODE_ENV === "production") notFound();
	return <VoiceLab />;
}
