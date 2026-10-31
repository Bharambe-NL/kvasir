import { Type } from "typebox";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import { serverExecute } from "../tool-execute.ts";
import { deriveCards } from "../../core/cards.ts";
import type { ReviewEntry, ReviewExclusion } from "../../core/contracts/learner.ts";
import { excludedSessions } from "../../core/learner.ts";
import type { GraphReader } from "../../core/ports.ts";
import { retrievability } from "../../core/schedule.ts";

/**
 * THE MEMORY TOOL (Kvasir P1-7): list_weak_propositions lets the prober and
 * the teacher see which propositions the learner is forgetting (D049).
 *
 * Read only by construction: the context carries the graph's read view
 * (GraphReader) and a review-ledger READ function, never a store, so the
 * agent holds no write path to the graph or the learner ledgers (D030).
 *
 * Names, recall, lapses and dates only, never the statement text (D052):
 * the same rule as the prober's map tools.
 *
 * Registered only when the composition root passes the context, which it
 * does only when memoryToolsEnabled (the graph master switch AND the
 * agent.memoryTools toggle, D050). Absent context = no tool.
 *
 * Propositions born in a session excluded from review (P1-8, D054) are left
 * out, the same as everywhere else the card source reaches.
 */

/** What the memory tool closes over: read functions only. */
export interface MemoryToolContext {
	graph: GraphReader;
	readReviews: () => ReviewEntry[];
	readExclusions: () => ReviewExclusion[];
	now: () => string;
}

/** D051: weak means a reviewed proposition with recall below 80%; the tool
 *  returns the weakest 15. */
export const WEAK_RECALL_THRESHOLD = 0.8;
export const WEAK_LIST_LIMIT = 15;

const listWeakInput = Type.Object({});

export function memoryTools(ctx: MemoryToolContext): Record<string, AgentTool<any>> {
	return {
		list_weak_propositions: {
			name: "list_weak_propositions",
			label: "list_weak_propositions",
			description:
				"List the propositions the learner is forgetting: those he has reviewed whose recall chance is now below 80%, " +
				"weakest first, at most 15. Each line gives the name, recall percentage, how often he forgot it, when he last " +
				"reviewed it, and its id. Use it to decide what to reinforce or probe; it shows names only, never the statements.",
			parameters: listWeakInput,
			execute: serverExecute("list_weak_propositions", listWeakInput, async (): Promise<string> => {
				const now = ctx.now();
				const reviews = ctx.readReviews();
				const { cards } = deriveCards(ctx.graph, reviews, excludedSessions(ctx.readExclusions()));
				const reviewed = cards.filter((c) => c.state.reps > 0);
				if (reviewed.length === 0) return "No proposition has been reviewed yet, so there is no recall data.";
				const weak = reviewed
					.map((card) => ({ card, recall: retrievability(card.nodeId, reviews, card.introducedAt, now) }))
					.filter((x): x is { card: (typeof reviewed)[number]; recall: number } => x.recall !== null && x.recall < WEAK_RECALL_THRESHOLD)
					.sort((a, b) => a.recall - b.recall || (a.card.nodeId < b.card.nodeId ? -1 : 1))
					.slice(0, WEAK_LIST_LIMIT);
				if (weak.length === 0) {
					return `No weak propositions: all ${reviewed.length} reviewed proposition(s) are at 80% recall or above.`;
				}
				const lines = weak.map(({ card, recall }, i) => {
					const lapses = card.state.lapses;
					const last = card.state.lastReviewedAt ? card.state.lastReviewedAt.slice(0, 10) : "unknown date";
					return (
						`${i + 1}. ${card.name}: recall ${Math.round(recall * 100)}%, ` +
						`forgotten ${lapses} time${lapses === 1 ? "" : "s"}, last reviewed ${last}, id: ${card.nodeId}`
					);
				});
				return `${weak.length} weak proposition(s), weakest first:\n${lines.join("\n")}`;
			}),
		},
	};
}
