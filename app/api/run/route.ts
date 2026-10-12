import { after, NextResponse } from "next/server";
import { latestRun, processChunk, startRun } from "@/lib/pipeline";

export const maxDuration = 300;

// GET: live status of the latest run (polled by the dashboard).
export async function GET() {
  const run = await latestRun();
  return NextResponse.json({ run }, { headers: { "cache-control": "no-store" } });
}

// POST: public "Refresh now" button. No login by design; protected by a cooldown instead.
export async function POST(request: Request) {
  const res = await startRun("manual");
  if ("error" in res) return NextResponse.json(res, { status: 429 });
  const origin = new URL(request.url).origin;
  if (res.resumed) after(() => processChunk(res.run.id, origin));
  return NextResponse.json({ run: res.run, started: res.resumed });
}
