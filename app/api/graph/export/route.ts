/**
 * POST /api/graph/export { kind: "obsidian" | "anki" } (Kvasir P6-3, D100,
 * D105): writes the export into a new dated folder and returns
 * { path, propositions }.
 */
import { exportGraph } from "@/src/server";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
	let body: { kind?: unknown };
	try {
		body = await req.json();
	} catch {
		return Response.json({ error: "Invalid JSON body" }, { status: 400 });
	}
	if (body.kind !== "obsidian" && body.kind !== "anki") return Response.json({ error: 'kind is "obsidian" or "anki"' }, { status: 400 });
	try {
		return Response.json(exportGraph(body.kind));
	} catch (err) {
		return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
	}
}
