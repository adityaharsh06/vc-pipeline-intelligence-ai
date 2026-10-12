// Re-applies the current scoring rules to the latest run's stored evidence (no Gemini calls).
// Usage: node --env-file=.env.local --import tsx scripts/rescore.ts
import { db } from "../lib/supabase";
import { daysBetween, recommendAction, scoreSignal } from "../lib/scoring";
import { SIGNAL_TYPE_LABEL, type Assessment, type Investor } from "../lib/types";

async function main() {
  const s = db();
  const now = new Date();
  const { data: run } = await s.from("vc_runs").select("*").eq("status", "succeeded").order("started_at", { ascending: false }).limit(1).single();
  const { data: rows } = await s.from("vc_assessments").select("*").eq("run_id", run.id).eq("state", "active");
  const { data: invs } = await s.from("vc_investors").select("*");
  const byId = new Map((invs as Investor[]).map((i) => [i.id, i]));

  for (const a of rows as Assessment[]) {
    const inv = byId.get(a.investor_id)!;
    const scored = a.signals
      .map((sig) => ({ sig, ...scoreSignal(sig, inv, now) }))
      .sort((x, y) => y.score - x.score || y.sig.date.localeCompare(x.sig.date));
    const top = scored[0];
    const action = recommendAction(inv, top.score, now, top.sig.relevance);
    const age = daysBetween(top.sig.date, now);
    const summary = `${SIGNAL_TYPE_LABEL[top.sig.type]}: ${top.sig.summary} (${top.sig.source}, ${age === 0 ? "today" : `${age}d ago`})`;
    const opening =
      a.best_signal?.url === top.sig.url && a.opening_line
        ? a.opening_line
        : `I came across the news that ${top.sig.summary.charAt(0).toLowerCase()}${top.sig.summary.slice(1).replace(/\.$/, "")}, and as a founder building B2B logistics SaaS raising our Seed round, I wanted to reach out.`;
    await s
      .from("vc_assessments")
      .update({ score: top.score, breakdown: top.breakdown, best_signal: top.sig, signals: scored.map((x) => x.sig), action, opening_line: opening })
      .eq("id", a.id);
    const { error } = await s.rpc("vc_apply_signal", {
      p_id: inv.id,
      p_last_signal_date: top.sig.date,
      p_summary: summary,
      p_score: top.score,
      p_action: action,
    });
    if (error) throw error;
    console.log(String(top.score).padStart(3), top.sig.relevance.toString().padStart(3), action.padEnd(55), inv.firm);
  }
}
main();
