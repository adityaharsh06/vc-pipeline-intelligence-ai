import { NextResponse } from "next/server";
import { scanSingle } from "@/lib/pipeline";
import { db } from "@/lib/supabase";

export const maxDuration = 120;

// Scans one investor right after it is added, so it doesn't wait for the next full refresh.
// Only for investors added from the app, and only once every few minutes per investor.
export async function POST(_request: Request, ctx: RouteContext<"/api/investors/[id]/scan">) {
  const { id } = await ctx.params;
  const s = db();
  const { data: inv } = await s.from("vc_investors").select("id, source").eq("id", id).maybeSingle();
  if (!inv) return NextResponse.json({ error: "Investor not found" }, { status: 404 });
  if (inv.source !== "added") return NextResponse.json({ error: "Only newly added investors can be scanned individually" }, { status: 403 });
  const since = new Date(Date.now() - 5 * 60_000).toISOString();
  const { count } = await s.from("vc_assessments").select("id", { count: "exact", head: true }).eq("investor_id", id).gte("created_at", since);
  if ((count ?? 0) > 0) return NextResponse.json({ error: "Scanned in the last 5 minutes" }, { status: 429 });
  try {
    const r = await scanSingle(id);
    return NextResponse.json({ state: r.state, score: r.score, action: r.action, summary: r.summary, error: r.error });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
