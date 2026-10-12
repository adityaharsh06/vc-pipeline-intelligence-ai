import { assessInvestor } from "../lib/pipeline";
import { db } from "../lib/supabase";
import type { Investor } from "../lib/types";

async function main() {
  const firm = process.argv[2] ?? "Kae Capital";
  const { data } = await db().from("vc_investors").select("*").eq("firm", firm).single();
  const counter = { calls: 0 };
  const t = Date.now();
  const r = await assessInvestor(data as Investor, new Date(), counter);
  console.log(JSON.stringify({ ms: Date.now() - t, calls: counter.calls, ...r }, null, 2));
}
main().catch((e) => { console.error("FAILED:", e.message); process.exit(1); });
