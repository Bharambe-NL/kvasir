/**
 * GET /api/sources/documents (Kvasir P2-5, D082): the imported source
 * documents, for the import dialog's "Version of" choice. A pure read.
 */
import { sourceDocumentList } from "@/src/server";

export const dynamic = "force-dynamic";

export async function GET() {
	return Response.json(sourceDocumentList());
}
