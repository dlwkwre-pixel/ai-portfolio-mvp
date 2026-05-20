import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const revalidate = 3600; // 1-hour cache — history changes slowly

export async function GET() {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("market_regime_snapshots")
      .select("date, level, score, label")
      .order("date", { ascending: false })
      .limit(30);

    if (error) return NextResponse.json([]);

    // Return oldest → newest so the card can render left-to-right
    return NextResponse.json((data ?? []).reverse());
  } catch {
    return NextResponse.json([]);
  }
}
