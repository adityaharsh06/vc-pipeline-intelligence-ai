import { db } from "./supabase";
import { latestRun } from "./pipeline";
import { actionTone } from "./scoring";
import type { Assessment, Investor, Run } from "./types";

export type Row = {
  inv: Investor;
  latest: Assessment | null;
  previous: Assessment | null;
};

export type Change =
  | { kind: "new_signal"; row: Row }
  | { kind: "went_quiet"; row: Row }
  | { kind: "score_up" | "score_down"; row: Row; delta: number };

export async function getSnapshot() {
  const s = db();
  const [inv, asm, runs, current] = await Promise.all([
    s.from("vc_investors").select("*").order("firm"),
    s.from("vc_assessments").select("*").order("created_at", { ascending: false }).limit(1000),
    s.from("vc_runs").select("*").order("started_at", { ascending: false }).limit(20),
    latestRun(),
  ]);
  const investors = (inv.data ?? []) as Investor[];
  const assessments = (asm.data ?? []) as Assessment[];
  const allRuns = (runs.data ?? []) as Run[];

  const byInvestor = new Map<string, Assessment[]>();
  for (const a of assessments) {
    if (a.state === "error") continue; // errors never replace the last good assessment
    const list = byInvestor.get(a.investor_id) ?? [];
    if (!list.some((x) => x.run_id === a.run_id)) list.push(a);
    byInvestor.set(a.investor_id, list);
  }

  const rows: Row[] = investors.map((i) => {
    const list = byInvestor.get(i.id) ?? [];
    return { inv: i, latest: list[0] ?? null, previous: list[1] ?? null };
  });

  const changes: Change[] = [];
  for (const r of rows) {
    if (!r.latest || !r.previous) continue;
    const was = r.previous.state === "active";
    const is = r.latest.state === "active";
    if (is && !was) changes.push({ kind: "new_signal", row: r });
    else if (!is && was) changes.push({ kind: "went_quiet", row: r });
    else if (is && was && r.latest.score !== null && r.previous.score !== null) {
      const delta = r.latest.score - r.previous.score;
      if (Math.abs(delta) >= 5) changes.push({ kind: delta > 0 ? "score_up" : "score_down", row: r, delta });
    }
  }

  const lastDone = allRuns.find((r) => r.status === "succeeded" || r.status === "partial") ?? null;
  return { rows, runs: allRuns, current: current ?? allRuns[0] ?? null, lastDone, changes };
}

export async function getInvestor(id: string) {
  const s = db();
  const [inv, asm, edits] = await Promise.all([
    s.from("vc_investors").select("*").eq("id", id).maybeSingle(),
    s.from("vc_assessments").select("*").eq("investor_id", id).order("created_at", { ascending: false }).limit(20),
    s.from("vc_manual_edits").select("*").eq("investor_id", id).order("edited_at", { ascending: false }).limit(20),
  ]);
  return {
    inv: inv.data as Investor | null,
    history: (asm.data ?? []) as Assessment[],
    edits: (edits.data ?? []) as { field: string; old_value: string | null; new_value: string | null; edited_at: string }[],
  };
}

// Next scheduled cron: Mon & Thu 04:00 UTC (09:30 IST).
export function nextScheduled(from = new Date()) {
  for (let i = 0; i < 8; i++) {
    const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate() + i, 4, 0));
    if ((d.getUTCDay() === 1 || d.getUTCDay() === 4) && d > from) return d;
  }
  return null;
}

export function fmtIST(iso: string | Date, withTime = true) {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return d.toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "short",
    ...(withTime ? { hour: "2-digit", minute: "2-digit", hour12: false } : { year: "numeric" }),
  }) + (withTime ? " IST" : "");
}

export function ago(iso: string) {
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86400)} d ago`;
}

export function daysAgo(dateIso: string) {
  const d = Math.floor((Date.now() - new Date(dateIso + "T00:00:00Z").getTime()) / 86_400_000);
  return d <= 0 ? "today" : d === 1 ? "yesterday" : `${d} days ago`;
}

// "Reach out this week" list: same rule as the priority queue (active signal, hot action), best first.
export async function getOutreachList() {
  const { rows, lastDone } = await getSnapshot();
  const list = rows
    .filter((r) => r.latest?.state === "active" && r.latest.best_signal && actionTone(r.latest.action) === "hot")
    .sort((a, b) => (b.latest!.score ?? 0) - (a.latest!.score ?? 0))
    .map((r) => ({ inv: r.inv, a: r.latest! }));
  return { list, lastDone };
}
