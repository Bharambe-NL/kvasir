/**
 * /api/review/exclusions: the review opt-out (P1-8, D053 to D055).
 * GET: the birth sessions out of review. POST: { sessionId, excluded }
 * opts one session out of review or back in; a repeat appends nothing.
 */
import { reviewExclusions, setReviewExclusion } from "@/src/server";

export const dynamic = "force-dynamic";

export async function GET() {
	return Response.json(reviewExclusions());
}

export async function POST(req: Request) {
	let body: unknown;
	try {
		body = await req.json();
	} catch {
		return Response.json({ error: "Invalid JSON body" }, { status: 400 });
	}
	const result = setReviewExclusion(body);
	if (!result.ok) return Response.json({ error: result.error }, { status: result.status });
	return Response.json({ ok: true, changed: result.changed, excluded: result.excluded });
}
