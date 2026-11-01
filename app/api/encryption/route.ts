/**
 * GET /api/encryption (Kvasir P6-6, D115, D116): whether this data folder is
 * plain, locked or unlocked, why it is locked, whether a conversion is part
 * way, and whether encryption is available here (the desktop app only).
 * Never returns the key. Allowed while locked (proxy.ts).
 */
import { encryptionState } from "@/src/server";

export const dynamic = "force-dynamic";

export async function GET() {
	return Response.json(encryptionState(), { headers: { "Cache-Control": "no-store" } });
}
