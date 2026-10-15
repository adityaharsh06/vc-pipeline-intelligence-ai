import Link from "next/link";
import DemoPlayer from "@/components/DemoPlayer";

export const metadata = {
  title: "Video demo · VC Signal Desk",
  description: "A 21-second tour of VC Signal Desk: live signals, scoring, Gemini-drafted emails and protected notes.",
};

export default function DemoPage() {
  return (
    <div className="wrap">
      <header className="page-head">
        <div>
          <div className="eyebrow">Video demo · 21 seconds</div>
          <h1>See VC Signal Desk in action</h1>
          <p>
            A quick tour using this app&apos;s real data: how a live news story becomes a score, how Gemini Flash drafts the
            outreach email, and how the database keeps Vikram&apos;s own notes off-limits to the pipeline.
          </p>
        </div>
        <Link className="btn primary" href="/">Open the live briefing →</Link>
      </header>
      <DemoPlayer />
    </div>
  );
}
