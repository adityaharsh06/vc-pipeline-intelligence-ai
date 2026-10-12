import { after, NextResponse } from "next/server";
import { latestRun, processChunk, startRun } from "@/lib/pipeline";

export const maxDuration = 300;

// Vercel Cron: Monday and Thursday 04:00 UTC (09:30 IST), before Vikram works his pipeline.
// A second trigger at 04:30 UTC only resumes a run that stalled; it never starts a duplicate.
export async function GET(request: Request) {
  if (!process.env.CRON_SECRET || request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const last = await latestRun();
  if (last && last.status !== "stalled" && Date.now() - new Date(last.started_at).getTime() < 3 * 3600_000) {
    return NextResponse.json({ skipped: `latest run is ${last.status}` });
  }
  const res = await startRun("cron");
  if ("error" in res) return NextResponse.json(res, { status: 409 });
  const origin = new URL(request.url).origin;
  if (res.resumed) after(() => processChunk(res.run.id, origin));
  return NextResponse.json({ run: res.run.id });
}
