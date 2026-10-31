/**
 * The card source (P1-3): the Memory system's view of which propositions are
 * review cards and where each one stands. Pure: no IO, no clock reads.
 *
 * One card is one proposition (D031), and every proposition in the graph has
 * one (D036), introduced at its node's createdAt (the first ledger line). A
 * later session meeting the same proposition is a link-append with the same
 * id, so merges never split or duplicate a card.
 *
 * A node that no longer exists (deleted through the graph) makes its card
 * INERT: it is reported but never scheduled, and its reviews stay in the
 * ledger untouched (D030). Nothing here throws on a dangling review.
 *
 * A proposition whose birth session is opted out of review (P1-8, D054) has
 * no card while the exclusion stands: it is reported in `excluded`, its
 * reviews stay in the ledger, and including the session again restores the
 * same card with the same schedule (everything is derived at read time).
 */

import type { CardState, ReviewEntry } from "./contracts/learner.ts";
import { getGraph } from "./graph.ts";
import type { GraphReader } from "./ports.ts";
import { isDue, scheduleCard } from "./schedule.ts";
import { birthSessionOf } from "./session-clusters.ts";

/** One review card, derived at read time and never stored. */
export interface ReviewCard {
	nodeId: string;
	/** The node's short label (presentational). */
	name: string;
	/** The proposition itself, at full precision. */
	statement: string;
	/** ISO: when the card entered review, the node's createdAt. */
	introducedAt: string;
	state: CardState;
}

export interface CardSet {
	/** One card per proposition in the graph, by introduction time, then id. */
	cards: ReviewCard[];
	/** Node ids that have reviews but no longer exist in the graph, sorted.
	 *  Reported, never scheduled. */
	inert: string[];
	/** Node ids left out because their birth session is excluded from
	 *  review (D054), sorted. */
	excluded: string[];
}

/** Every review card the graph and the review ledger give, leaving out the
 *  propositions born in an excluded session. */
export function deriveCards(
	graph: GraphReader,
	reviews: readonly ReviewEntry[],
	excludedSessions: ReadonlySet<string> = new Set(),
): CardSet {
	const reviewsByNode = new Map<string, ReviewEntry[]>();
	for (const review of reviews) {
		const list = reviewsByNode.get(review.nodeId);
		if (list) list.push(review);
		else reviewsByNode.set(review.nodeId, [review]);
	}

	const cards: ReviewCard[] = [];
	const live = new Set<string>();
	const excluded: string[] = [];
	for (const node of getGraph(graph).nodes) {
		live.add(node.id);
		const birth = birthSessionOf(node);
		if (birth !== null && excludedSessions.has(birth)) {
			excluded.push(node.id);
			continue;
		}
		cards.push({
			nodeId: node.id,
			name: node.name,
			statement: node.statement,
			introducedAt: node.createdAt,
			state: scheduleCard(node.id, reviewsByNode.get(node.id) ?? [], node.createdAt),
		});
	}
	cards.sort((a, b) => Date.parse(a.introducedAt) - Date.parse(b.introducedAt) || compareIds(a.nodeId, b.nodeId));

	const inert = [...reviewsByNode.keys()].filter((id) => !live.has(id)).sort(compareIds);
	return { cards, inert, excluded: excluded.sort(compareIds) };
}

/** The cards due at `now`, earliest due first (ties by id). The daily limit
 *  is applied by the review queue (P1-5), not here. */
export function dueCards(cards: readonly ReviewCard[], now: string): ReviewCard[] {
	return cards
		.filter((card) => isDue(card.state, now))
		.sort((a, b) => Date.parse(a.state.due) - Date.parse(b.state.due) || compareIds(a.nodeId, b.nodeId));
}

function compareIds(a: string, b: string): number {
	return a < b ? -1 : a > b ? 1 : 0;
}
