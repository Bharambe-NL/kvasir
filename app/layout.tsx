import type { Metadata } from "next";
import { JetBrains_Mono, Source_Sans_3 } from "next/font/google";
import "katex/dist/katex.min.css";
import "./globals.css";
import { AppShell, SidebarProvider } from "@/components/sidebar";
import { ActivityProvider } from "@/components/activity-dock";
import { ServerEventsProvider } from "@/components/server-events";
import { AppearanceProvider } from "@/components/settings/appearance";
import UpdateBanner from "@/components/update-banner";
import { EncryptionGate } from "@/components/locked-screen";
import { effectiveSettings } from "@/src/server";

// Chrome = JetBrains Mono, teaching prose = Source Sans 3, titles = CMU
// Serif (the bundled lh-cmu @font-face in globals.css — no CDN).
const ui = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains" });
const prose = Source_Sans_3({ subsets: ["latin"], variable: "--font-sans3" });

export const metadata: Metadata = {
	title: "Kvasir",
	description: "A teacher agent with a memory — sessions, quizzes, and a knowledge graph of what you know.",
};

/** The saved mode (Kvasir P7-2, D128) as the <html> class, so the first
 *  paint is already in the right colours. AppearanceProvider keeps it live
 *  afterwards. Unreadable settings (a locked encrypted folder cannot lock
 *  settings.json, but be safe) fall back to the default, dark. */
function modeClass(): string {
	try {
		return effectiveSettings().appearance.mode;
	} catch {
		return "dark";
	}
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
	return (
		<html lang="en" className={`${modeClass()} ${ui.variable} ${prose.variable}`} suppressHydrationWarning>
			<body className="min-h-dvh antialiased">
			{/* The notification channel rides OUTSIDE everything: sidebar, dock,
				 and pages all subscribe as the polls retire (push S3, 2026-10-02). */}
			{/* Encrypted and locked (P6-6): nothing of the app renders. */}
			<EncryptionGate>
			<ServerEventsProvider>
				<AppearanceProvider>
					<SidebarProvider>
						<ActivityProvider>
							<AppShell>{children}</AppShell>
						</ActivityProvider>
					</SidebarProvider>
				</AppearanceProvider>
			</ServerEventsProvider>
			</EncryptionGate>
			{/* Auto-update banner (Wave C): fixed card, Electron-only pushes. */}
			<UpdateBanner />
		</body>
		</html>
	);
}
