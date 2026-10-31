import { ReviewSession } from "@/components/review/review-session";

export const dynamic = "force-dynamic";

/** The review page (P1-5): spaced review of the propositions in the graph,
 *  reached from the sidebar's Review row (D043). */
export default function ReviewPage() {
	return <ReviewSession />;
}
