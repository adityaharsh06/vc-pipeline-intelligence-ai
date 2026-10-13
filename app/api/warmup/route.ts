import { NextResponse } from "next/server";
import { getWarmupList } from "@/lib/data";
import { ensureWarmups } from "@/lib/warmup";

export const maxDuration = 120;

// Drafts the warm-up kit (LinkedIn note + intro request) for "worth a tailored note" VCs,
// or regenerates one investor's kit. Drafts only; nothing is sent.
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const { list } = await getWarmupList();
  const pairs = body.investorId ? list.filter((p) => p.inv.id === body.investorId) : list;
  if (body.investorId && !pairs.length) {
    return NextResponse.json({ error: "This investor is not on this week's tailored-note list" }, { status: 404 });
  }
  try {
    return NextResponse.json(await ensureWarmups(pairs, Boolean(body.replace && body.investorId)));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: /limit/i.test(msg) ? 429 : 502 });
  }
}
