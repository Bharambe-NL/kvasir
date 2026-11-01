import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/** tailwind-merge knows Tailwind's own sizes only; the type roles (Kvasir
 *  P7-5, D143: text-label, text-control, text-body, text-title, text-page
 *  in app/globals.css) are sizes too, not colours, so they must not be
 *  merged away by a later text colour. */
const twMerge = extendTailwindMerge({
	extend: { theme: { text: ["label", "control", "body", "title", "page"] } },
});

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}
