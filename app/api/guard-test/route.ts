import { NextResponse } from "next/server";
import { db } from "@/lib/supabase";

// Live proof: asks the database to let the pipeline overwrite a note, and reports the refusal.
export async function POST() {
  const { data, error } = await db().rpc("vc_guard_selftest");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
