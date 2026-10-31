/**
 * GET /api/review/summary — the home signals (P1-6): today's due count and
 * the current recall chance per reviewed card, for the sidebar count, the
 * home toolbar chip and the graph's retention overlay. A pure read.
 */
import { reviewSummary } from "@/src/server";

export const dynamic = "force-dynamic";

export async function GET() {
	return Response.json(reviewSummary());
}
