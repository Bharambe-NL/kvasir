/**
 * /api/review — the review session's transport (P1-5, Memory system).
 * GET: today's queue view (starts background question generation for
 * queue items without a question). POST: record one self-rating
 * { id, nodeId, rating }; idempotent by id.
 */
import { recordReview, reviewQueueView } from "@/src/server";

export const dynamic = "force-dynamic";

export async function GET() {
	return Response.json(reviewQueueView());
}

export async function POST(req: Request) {
	let body: unknown;
	try {
		body = await req.json();
	} catch {
		return Response.json({ error: "Invalid JSON body" }, { status: 400 });
	}
	const result = recordReview(body);
	if (!result.ok) return Response.json({ error: result.error }, { status: result.status });
	return Response.json({ ok: true, duplicate: result.duplicate });
}
