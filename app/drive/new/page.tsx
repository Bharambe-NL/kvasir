import { DriveMode } from "@/components/drive/drive-mode";

export const dynamic = "force-dynamic";

/** A new drive session (Kvasir P3-5, D173, D174): the voice chat is
 *  created on Start, and he says what he wants to learn. */
export default function NewDrivePage() {
	return <DriveMode chatId={null} />;
}
