import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { toMonthlyAmount } from "@/lib/planning/frequency";
import { findUnusualCharges } from "@/lib/planning/unusual-charges";
import { kvGetIds } from "@/lib/kv";
import type { CashFlowTransaction } from "@/lib/planning/transactions";

// Vercel Cron, Sundays. One in-app "your week in money" notification per user who budgets
// in Cash Flow: spending pace this month, bills due in the next 7 days, charges worth a
// look, and how portfolio value moved over the week.

export const maxDuration = 60;

const money = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const DAY = 86_400_000;

export async function GET(request: Request) {
  if (request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const admin = createAdminClient();
  const now = new Date();
  const y = now.getUTCFullYear(), m = now.getUTCMonth() + 1, day = now.getUTCDate();
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const monthStart = `${y}-${String(m).padStart(2, "0")}-01`;

  const { data: items } = await admin.from("cash_flow_items").select("user_id, label, type, amount, frequency, due_day");
  const byUser = new Map<string, NonNullable<typeof items>>();
  for (const it of items ?? []) {
    const list = byUser.get(it.user_id) ?? [];
    list.push(it);
    byUser.set(it.user_id, list);
  }

  let sent = 0;
  for (const [userId, userItems] of byUser) {
    try {
      const expenses = userItems.filter((i) => i.type === "expense");
      if (expenses.length === 0) continue;
      const budget = expenses.reduce((s, i) => s + toMonthlyAmount(Number(i.amount), i.frequency), 0);

      const since = new Date(now.getTime() - 400 * DAY).toISOString().slice(0, 10);
      const { data: txRows } = await admin.from("cash_flow_transactions")
        .select("id, txn_date, period_year, period_month, description, merchant, amount, direction, cash_flow_item_id, source, import_batch_id, note")
        .eq("user_id", userId).gte("txn_date", since).limit(8000);
      const txns = (txRows ?? []).map((r) => ({ ...r, amount: Number(r.amount) })) as unknown as CashFlowTransaction[];
      const spentThisMonth = txns.filter((t) => t.direction === "out" && t.txn_date >= monthStart).reduce((s, t) => s + t.amount, 0);

      const lines: string[] = [];
      if (budget > 0 && spentThisMonth > 0) {
        const pct = Math.round((spentThisMonth / budget) * 100);
        const gone = Math.round((day / daysInMonth) * 100);
        lines.push(`Spent ${money(spentThisMonth)} of your ${money(budget)} budget (${pct}%) with ${gone}% of the month gone${pct > gone + 10 ? ", running ahead of pace" : pct < gone - 10 ? ", comfortably under pace" : ", about on pace"}.`);
      }

      // Monthly bills with a due day in the next 7 days.
      const due: string[] = [];
      for (const i of expenses) {
        if (i.frequency !== "monthly" || !i.due_day) continue;
        for (let k = 1; k <= 7; k++) {
          const d = new Date(now.getTime() + k * DAY);
          const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
          if (d.getUTCDate() === Math.min(Number(i.due_day), lastDay)) { due.push(`${i.label} ${money(Number(i.amount))}`); break; }
        }
      }
      if (due.length > 0) lines.push(`Due this week: ${due.slice(0, 4).join(", ")}${due.length > 4 ? ` and ${due.length - 4} more` : ""}.`);

      const ok = new Set(await kvGetIds(`unusualok:${userId}`));
      const unusual = findUnusualCharges(txns, now).filter((a) => !ok.has(a.id));
      if (unusual.length > 0) lines.push(`${unusual.length} charge${unusual.length === 1 ? "" : "s"} worth a look in Cash Flow.`);

      // Portfolio value now vs a week ago (includes any deposits/withdrawals, so it's
      // labeled as a value change, not a return).
      const { data: portfolios } = await admin.from("portfolios").select("id").eq("user_id", userId).eq("status", "active");
      if (portfolios && portfolios.length > 0) {
        const weekAgo = new Date(now.getTime() - 7 * DAY).toISOString().slice(0, 10);
        let nowTotal = 0, thenTotal = 0, complete = true;
        for (const p of portfolios) {
          const [{ data: latest }, { data: prior }] = await Promise.all([
            admin.from("portfolio_snapshots").select("total_value").eq("portfolio_id", p.id).order("snapshot_date", { ascending: false }).limit(1).maybeSingle(),
            admin.from("portfolio_snapshots").select("total_value").eq("portfolio_id", p.id).lte("snapshot_date", weekAgo).order("snapshot_date", { ascending: false }).limit(1).maybeSingle(),
          ]);
          if (!latest || !prior) { complete = false; break; }
          nowTotal += Number(latest.total_value);
          thenTotal += Number(prior.total_value);
        }
        if (complete && thenTotal > 0) {
          const diff = nowTotal - thenTotal;
          lines.push(`Portfolios ${diff >= 0 ? "up" : "down"} ${money(Math.abs(diff))} this week to ${money(nowTotal)} (including any deposits).`);
        }
      }

      if (lines.length === 0) continue;
      const { error } = await admin.from("app_notifications").insert({
        title: "Your week in money",
        body: lines.join(" "),
        target_user_id: userId,
      });
      if (!error) sent++;
    } catch (e) {
      console.error("[weekly-checkin] user failed:", e instanceof Error ? e.message : e);
    }
  }
  return NextResponse.json({ message: `Sent ${sent} weekly check-in(s).` });
}
