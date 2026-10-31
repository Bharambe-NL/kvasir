/**
 * Deterministic ids for the sources door (Kvasir P2, D060). Server-only:
 * it hashes with node:crypto, so it is not re-exported through the browser
 * barrel.
 */

import { createHash } from "node:crypto";

const short = (input: string) => createHash("sha256").update(input).digest("hex").slice(0, 12);

/** A EUR-Lex document's id: "doc_" + a hash of its CELEX number, so every
 *  consolidation of one act shares it. */
export function eurlexSourceId(celex: string): string {
	return `doc_${short(`celex:${celex.trim().toUpperCase()}`)}`;
}

/** Another file's id at first import: "doc_" + a hash of its path. */
export function fileSourceId(filePath: string): string {
	return `doc_${short(`file:${filePath}`)}`;
}

/** A version's id: "ver_" + a hash of the document id and the content
 *  hash, so re-importing the same content gives the same version. */
export function versionIdFor(sourceId: string, contentHash: string): string {
	return `ver_${short(`${sourceId}:${contentHash}`)}`;
}

/** sha256 of a file's bytes, hex (DocumentVersion.contentHash). */
export function contentHashOf(bytes: Uint8Array | string): string {
	return createHash("sha256").update(bytes).digest("hex");
}
