import { db } from "@/lib/supabase";

const COLS = [
  "name", "firm", "kind", "status", "last_contact_date", "notes",
  "last_signal_date", "signal_summary", "follow_up_score", "recommended_action",
];

function cell(v: unknown) {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET() {
  const { data } = await db().from("vc_investors").select(COLS.join(",")).order("follow_up_score", { ascending: false, nullsFirst: false });
  const rows = (data ?? []) as unknown as Record<string, unknown>[];
  const csv = [COLS.join(","), ...rows.map((r) => COLS.map((c) => cell(r[c])).join(","))].join("\n");
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="vc-pipeline-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
