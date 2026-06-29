import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { advanceDue, annualizedAmount, type Cadence } from "@/lib/planning/contributions";

// Vercel Cron (daily). Fires an in-app notification for every contribution
// schedule due today, then advances next_due to the following period.
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let supabase: ReturnType<typeof createAdminClient>;
  try {
    supabase = createAdminClient();
  } catch {
    return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY not configured." }, { status: 500 });
  }

  const today = new Date().toISOString().slice(0, 10);

  const { data: due, error } = await supabase
    .from("contribution_schedules")
    .select("id, user_id, label, amount, cadence, anchor_day, next_due")
    .eq("active", true)
    .lte("next_due", today)
    .then((r) => r, () => ({ data: null, error: { message: "table missing" } }));

  if (error) return NextResponse.json({ error: error.message }, { status: 200 }); // graceful if table not migrated
  if (!due || due.length === 0) return NextResponse.json({ message: "No contributions due." });

  const money = (n: number) => "$" + Math.round(Number(n)).toLocaleString();
  let notified = 0;

  for (const s of due) {
    const amount = Number(s.amount ?? 0);
    const cadence = (s.cadence ?? "monthly") as Cadence;

    const { error: notifErr } = await supabase.from("app_notifications").insert({
      title: "Time to invest 💸",
      body: `Your scheduled ${money(amount)} contribution — "${s.label}" — is due today. That's about ${money(annualizedAmount(cadence, amount))}/yr at this pace. Open BuyTune to log it.`,
      target_user_id: s.user_id,
    });
    if (notifErr) { console.error("[contribution-reminders] notify failed:", notifErr.message); continue; }

    const nextDue = advanceDue(cadence, Number(s.anchor_day ?? 1), s.next_due);
    await supabase.from("contribution_schedules")
      .update({ next_due: nextDue, last_notified_at: new Date().toISOString() })
      .eq("id", s.id);
    notified++;
  }

  return NextResponse.json({ message: `Sent ${notified} contribution reminder(s).`, due: due.length });
}
