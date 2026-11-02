import { notFound } from "next/navigation";
import { DriveMode } from "@/components/drive/drive-mode";
import { getChat } from "@/src/server";

export const dynamic = "force-dynamic";

/** A voice chat in drive mode (Kvasir P3-5, D173): Start resumes it. */
export default async function DrivePage({ params }: { params: Promise<{ id: string }> }) {
	const { id } = await params;
	const chat = getChat(id);
	if (!chat?.voice) notFound();
	return <DriveMode chatId={id} />;
}
