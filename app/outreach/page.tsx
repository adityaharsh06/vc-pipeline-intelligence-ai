import Link from "next/link";
import { getOutreachList, fmtIST } from "@/lib/data";
import { db } from "@/lib/supabase";
import OutreachBoard from "@/components/OutreachBoard";
import type { Draft } from "@/lib/outreach";

export const dynamic = "force-dynamic";

export default async function OutreachPage() {
  const { list, lastDone } = await getOutreachList();
  const ids = list.map((p) => p.a.id);
  const { data } = ids.length
    ? await db().from("vc_outreach_drafts").select("*").in("assessment_id", ids)
    : { data: [] };
  const drafts = (data ?? []) as Draft[];
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

  return (
    <div className="wrap">
      <header className="page-head">
        <div>
          <div className="eyebrow">Reach out this week · outreach drafts</div>
          <h1>{list.length} emails ready to send</h1>
          <p>
            One email per VC on this week&apos;s reach-out list, drafted by Gemini Flash from their live signal. Fill
            in the [bracketed] placeholders, open it in Gmail, send it yourself, then mark the VC as contacted. The app
            never sends email on its own.
          </p>
        </div>
        <Link className="btn" href="/">← Back to briefing</Link>
      </header>

      {!list.length ? (
        <div className="panel empty">
          No VC is on the reach-out list right now{lastDone?.finished_at ? ` (last scan ${fmtIST(lastDone.finished_at)})` : ""}.
          Check the <Link href="/">priority queue</Link> for tailored-note candidates.
        </div>
      ) : (
        <OutreachBoard
          today={today}
          drafts={drafts}
          items={list.map(({ inv, a }) => ({
            inv,
            assessmentId: a.id,
            score: a.score,
            action: a.action,
            why: a.why,
            signal: a.best_signal!,
          }))}
        />
      )}
    </div>
  );
}
