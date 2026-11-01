import { MARK, chevronPath } from "@/src/core";

/**
 * LhMark — the Kvasir mark in the app (Kvasir P7-4, D139, D140): the
 * chevron and the dot from src/core/kvasir-mark.ts, without the icon's
 * squircle. The chevron takes the theme's ink (--mark-fill) and the dot
 * stays Kvasir gold (--mark-detail; grey in E-ink). The viewBox is the
 * mark's own square, no padding: sizing is the consumer's job. (The
 * component keeps its upstream name.)
 */
const HALF = 231; // half the mark's width with its round caps, plus a hair
export function LhMark({ className = "" }: { className?: string }) {
	return (
		<svg viewBox={`${512 - HALF} ${512 - HALF} ${HALF * 2} ${HALF * 2}`} className={className} aria-hidden="true">
			<path
				d={chevronPath()}
				fill="none"
				style={{ stroke: "var(--mark-fill)" }}
				strokeWidth={MARK.chevron.stroke}
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
			<circle cx={MARK.dot.cx} cy={MARK.dot.cy} r={MARK.dot.r} style={{ fill: "var(--mark-detail)" }} />
		</svg>
	);
}
