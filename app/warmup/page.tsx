import Link from "next/link";
import { getWarmupList, fmtIST } from "@/lib/data";
import { db } from "@/lib/supabase";
import WarmupBoard from "@/components/WarmupBoard";
import type { WarmupDraft } from "@/lib/warmup";

export const dynamic = "force-dynamic";

export default async function WarmupPage() {
  const { list, lastDone } = await getWarmupList();
  const ids = list.map((p) => p.a.id);
  const { data } = ids.length
    ? await db().from("vc_warmup_drafts").select("*").in("assessment_id", ids)
    : { data: [] };
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

  return (
    <div className="wrap">
      <header className="page-head">
        <div>
          <div className="eyebrow">Worth a tailored note · warm-up kit</div>
          <h1>Warm up {list.length} VCs before you pitch</h1>
          <p>
            These investors are active, but their signal is only partly on-thesis, so a cold pitch would be too
            strong. For each one Gemini Flash drafts a LinkedIn connection note (under 300 characters) and a
            warm-intro request you can send to a mutual contact. Drafts only; nothing is sent by the app.
          </p>
        </div>
        <Link className="btn" href="/">← Back to briefing</Link>
      </header>

      {!list.length ? (
        <div className="panel empty">
          No VC is on the tailored-note list right now{lastDone?.finished_at ? ` (last scan ${fmtIST(lastDone.finished_at)})` : ""}.
        </div>
      ) : (
        <WarmupBoard
          today={today}
          drafts={(data ?? []) as WarmupDraft[]}
          items={list.map(({ inv, a }) => ({ inv, assessmentId: a.id, score: a.score, signal: a.best_signal! }))}
        />
      )}
    </div>
  );
}
