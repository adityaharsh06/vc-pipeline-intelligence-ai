import { NextResponse } from "next/server";
import { db } from "@/lib/supabase";

const STATUSES = ["not_contacted", "waiting_response", "in_conversation", "passed"];
const KINDS = ["VC firm", "Angel", "Angel network", "Accelerator", "Corporate VC"];
const MAX_INVESTORS = 80; // public page, no login: keep the pipeline from being flooded
const MAX_ADDS_PER_HOUR = 10;

const clean = (v: unknown, max: number) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);

// Adds an investor to Vikram's pipeline (marked source = 'added' so it can be removed from the app).
export async function POST(request: Request) {
  const b = await request.json().catch(() => null);
  if (!b) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const name = clean(b.name, 80);
  const firm = clean(b.firm, 80);
  if (name.length < 2 || firm.length < 2) {
    return NextResponse.json({ error: "Partner name and firm are required" }, { status: 400 });
  }
  const kind = KINDS.includes(b.kind) ? b.kind : "VC firm";
  const status = STATUSES.includes(b.status) ? b.status : "not_contacted";
  const date = b.last_contact_date || null;
  if (date && (!/^\d{4}-\d{2}-\d{2}$/.test(date) || isNaN(Date.parse(date)))) {
    return NextResponse.json({ error: "Invalid last contact date" }, { status: 400 });
  }
  const website = clean(b.website, 100).replace(/^https?:\/\//i, "").replace(/\/$/, "") || null;

  const s = db();
  const since = new Date(Date.now() - 3600_000).toISOString();
  const [{ count: total }, { count: recent }, { data: dupes }] = await Promise.all([
    s.from("vc_investors").select("id", { count: "exact", head: true }),
    s.from("vc_investors").select("id", { count: "exact", head: true }).eq("source", "added").gte("created_at", since),
    s.from("vc_investors").select("id").ilike("firm", firm).ilike("name", name),
  ]);
  if ((total ?? 0) >= MAX_INVESTORS) return NextResponse.json({ error: `The pipeline is limited to ${MAX_INVESTORS} investors` }, { status: 429 });
  if ((recent ?? 0) >= MAX_ADDS_PER_HOUR) return NextResponse.json({ error: "Too many investors added this hour. Please try later." }, { status: 429 });
  if (dupes?.length) return NextResponse.json({ error: `${name} at ${firm} is already in the pipeline` }, { status: 409 });

  const { data, error } = await s
    .from("vc_investors")
    .insert({
      name,
      firm,
      kind,
      thesis: clean(b.thesis, 400),
      website,
      geography: clean(b.geography, 60) || null,
      status,
      last_contact_date: date,
      notes: String(b.notes ?? "").slice(0, 2000),
      source: "added",
    })
    .select("id")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ id: data.id });
}
