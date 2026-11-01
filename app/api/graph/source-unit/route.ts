/**
 * GET /api/graph/source-unit?ref=ver_…-U412 (Kvasir P2-6, D084): the unit a
 * lesson's citation link points at, for the source panel. 404 when the
 * version, its units or the label are unknown. A pure read.
 */
import { parseSourceRef } from "@/src/core";
import { sourceUnitView } from "@/src/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
	const ref = parseSourceRef(`#src-${new URL(request.url).searchParams.get("ref") ?? ""}`);
	const view = ref ? sourceUnitView(ref) : null;
	if (!view) return Response.json({ error: "Source not found" }, { status: 404 });
	return Response.json(view);
}
