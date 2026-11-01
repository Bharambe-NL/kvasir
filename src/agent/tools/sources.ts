import { Type } from "typebox";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import { serverExecute } from "../tool-execute.ts";
import { readSource, READ_SOURCE_LIMIT, type SourceReadContext } from "../../core/source-read.ts";

/**
 * THE SOURCE TOOL (Kvasir P2-6, D085 to D087): read_source lets the teacher
 * read an imported source document's text by address or by words, each
 * paragraph with its citation link to copy into the lesson (D084).
 *
 * Read only by construction: the context carries read functions only, so
 * the agent holds no write path. Registered for the teacher alone, and only
 * when the graph tools are on (graphToolsEnabled). It reads the newest
 * version of each document, the current text.
 */

/** What read_source closes over: read functions only (core/source-read.ts). */
export type SourceToolContext = SourceReadContext;
export { readSource, READ_SOURCE_LIMIT };

const readSourceInput = Type.Object({
	document: Type.Optional(Type.String({ description: "Which document: words from its title or short name, or its CELEX number. Omit to search every imported document." })),
	address: Type.Optional(Type.String({ description: 'Where in it: for example "Art. 28", "Art. 28(2)", "Recital 12" or "3.3.3 para 17". Returns that unit and everything under it.' })),
	words: Type.Optional(Type.String({ description: "Words the paragraph must contain, all of them, in any case." })),
});

export function sourceTools(ctx: SourceToolContext): Record<string, AgentTool<any>> {
	return {
		read_source: {
			name: "read_source",
			label: "read_source",
			description:
				"Read the text of an imported source document (a regulation, guideline or paper) by address, such as " +
				"Art. 28(2), Recital 12 or 3.3.3 para 17, or by words it contains. Each paragraph comes with its citation " +
				"link; copy the link exactly into your lesson right after the point it supports.",
			parameters: readSourceInput,
			execute: serverExecute("read_source", readSourceInput, async (input): Promise<string> => readSource(ctx, input)),
		},
	};
}
