import { NextResponse, type NextRequest } from "next/server";
import { desktopAPIAuthorized } from "./src/server/desktop-access.ts";
import { knownLocked } from "./src/store/data-key.ts";

/** Applies to every API method, including SSE and spending/settings routes.
 * No public callback or worker bypass: internal jobs call server functions,
 * and any legitimate self-HTTP request must carry the private capability. */
export function proxy(request: NextRequest) {
	if (!desktopAPIAuthorized(request.headers)) {
		return NextResponse.json(
			{ error: "Desktop API access requires the trusted Kvasir window." },
			{ status: 403, headers: { "Cache-Control": "no-store" } },
		);
	}
	// Encrypted and not unlocked yet (P6-6, D116): no store is read or
	// written; only the status route answers.
	if (knownLocked() && request.nextUrl.pathname !== "/api/encryption") {
		return NextResponse.json(
			{ error: "Kvasir data is encrypted and not unlocked yet.", locked: true },
			{ status: 423, headers: { "Cache-Control": "no-store" } },
		);
	}
	return NextResponse.next();
}

export const config = { matcher: "/api/:path*" };
