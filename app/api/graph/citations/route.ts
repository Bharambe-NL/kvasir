/**
 * GET /api/graph/citations?nodeIds=a,b (Kvasir P2-4): the citations of the
 * given propositions, as the chip and the side panel show them, with each
 * cited unit's text. A pure read.
 */
import { citationViews } from "@/src/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
	const raw = new URL(request.url).searchParams.get("nodeIds") ?? "";
	const nodeIds = raw.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 500);
	return Response.json(citationViews(nodeIds));
}
