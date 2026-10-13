import { NextResponse } from "next/server";
import { db } from "@/lib/supabase";

const STATUSES = ["not_contacted", "waiting_response", "in_conversation", "passed"];

// Vikram's own edits: manual columns only (status, last contact, notes).
export async function PATCH(request: Request, ctx: RouteContext<"/api/investors/[id]">) {
  const { id } = await ctx.params;
  const body = await request.json().catch(() => null);
  if (!body || !STATUSES.includes(body.status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }
  const date = body.last_contact_date || null;
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "Invalid date" }, { status: 400 });
  }
  const notes = String(body.notes ?? "").slice(0, 2000);
  const { error } = await db().rpc("vc_update_manual", {
    p_id: id,
    p_status: body.status,
    p_last_contact_date: date,
    p_notes: notes,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}

// Removes an investor that was added from the app. The original 50 cannot be deleted here.
export async function DELETE(_request: Request, ctx: RouteContext<"/api/investors/[id]">) {
  const { id } = await ctx.params;
  const s = db();
  const { data: inv } = await s.from("vc_investors").select("id, source").eq("id", id).maybeSingle();
  if (!inv) return NextResponse.json({ error: "Investor not found" }, { status: 404 });
  if (inv.source !== "added") return NextResponse.json({ error: "Only investors added from the app can be removed" }, { status: 403 });
  const { error } = await s.from("vc_investors").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
