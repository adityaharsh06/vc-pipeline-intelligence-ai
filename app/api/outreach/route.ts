import { NextResponse } from "next/server";
import { getOutreachList } from "@/lib/data";
import { ensureDrafts, TONES, type Tone } from "@/lib/outreach";

export const maxDuration = 120;

// Drafts emails for this week's "reach out" list (missing ones only), or regenerates one investor's
// draft in a given tone. Drafts are stored and shown on /outreach; nothing is ever sent.
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const tone: Tone = TONES.includes(body.tone) ? body.tone : "default";
  const { list } = await getOutreachList();
  const pairs = body.investorId ? list.filter((p) => p.inv.id === body.investorId) : list;
  if (body.investorId && !pairs.length) {
    return NextResponse.json({ error: "This investor is not on this week's reach-out list" }, { status: 404 });
  }
  try {
    const res = await ensureDrafts(pairs, tone, Boolean(body.replace && body.investorId));
    return NextResponse.json(res);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: /limit/i.test(msg) ? 429 : 502 });
  }
}
