import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Nav from "@/components/Nav";
import RunBar from "@/components/RunBar";
import Motion from "@/components/Motion";
import { latestRun } from "@/lib/pipeline";
import { nextScheduled } from "@/lib/data";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "VC Signal Desk",
  description: "Which VCs are worth reaching out to this week, and why - from observable signals in the last 30 days.",
};

export const dynamic = "force-dynamic";

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const run = await latestRun().catch(() => null);
  const next = nextScheduled();
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`} suppressHydrationWarning>
      {/* Browser extensions (e.g. Grammarly) add attributes to <body>; ignore those mismatches. */}
      <body suppressHydrationWarning>
        <div className="shell">
          <Nav />
          <div className="main">
            <RunBar initial={run} nextIso={next?.toISOString() ?? null} />
            {children}
            <Motion />
          </div>
        </div>
      </body>
    </html>
  );
}
