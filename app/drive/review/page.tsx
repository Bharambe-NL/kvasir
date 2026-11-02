import { DriveReview } from "@/components/drive/drive-review";

export const dynamic = "force-dynamic";

/** The voice review (Kvasir P3-6, D183): today's review queue on the
 *  drive screen, opened from the review page. */
export default function DriveReviewPage() {
	return <DriveReview />;
}
