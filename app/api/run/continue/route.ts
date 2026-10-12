import { after, NextResponse } from "next/server";
import { processChunk } from "@/lib/pipeline";

export const maxDuration = 300;

// Internal: continues a run in a fresh invocation. Requires the shared secret.
export async function POST(request: Request) {
  if (!process.env.CRON_SECRET || request.headers.get("x-run-secret") !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { runId } = await request.json();
  const origin = new URL(request.url).origin;
  after(() => processChunk(runId, origin));
  return NextResponse.json({ accepted: true }, { status: 202 });
}
