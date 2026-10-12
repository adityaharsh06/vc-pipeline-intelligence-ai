import { after, NextResponse } from "next/server";
import { processChunk, startRun } from "@/lib/pipeline";

export const maxDuration = 300;

// Vercel Cron: Monday and Thursday 04:00 UTC (09:30 IST), before Vikram works his pipeline.
export async function GET(request: Request) {
  if (!process.env.CRON_SECRET || request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const res = await startRun("cron");
  if ("error" in res) return NextResponse.json(res, { status: 409 });
  const origin = new URL(request.url).origin;
  if (res.resumed) after(() => processChunk(res.run.id, origin));
  return NextResponse.json({ run: res.run.id });
}
