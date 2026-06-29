import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { cadenceLabel, annualizedAmount, type Cadence } from "@/lib/planning/contributions";

export const dynamic = "force-dynamic";

// Next upcoming contribution(s) for the dashboard nudge card.
// Graceful if the contribution_schedules table hasn't been migrated yet.
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("contribution_schedules")
    .select("id, label, amount, cadence, anchor_day, next_due, active")
    .eq("user_id", user.id).eq("active", true)
    .order("next_due", { ascending: true }).limit(3)
    .then((r) => r, () => ({ data: null, error: { message: "missing" } }));

  if (error) return NextResponse.json({ available: false, schedules: [] });

  const rows = (data ?? []).map((s) => ({
    id: s.id,
    label: s.label,
    amount: Number(s.amount ?? 0),
    nextDue: s.next_due as string,
    cadenceText: cadenceLabel(s.cadence as Cadence, Number(s.anchor_day ?? 1)),
  }));

  const monthlyPace = (data ?? []).reduce((sum, s) => sum + annualizedAmount(s.cadence as Cadence, Number(s.amount ?? 0)) / 12, 0);

  return NextResponse.json({
    available: true,
    count: rows.length,
    monthlyPace: Math.round(monthlyPace),
    next: rows[0] ?? null,
    schedules: rows,
  });
}
