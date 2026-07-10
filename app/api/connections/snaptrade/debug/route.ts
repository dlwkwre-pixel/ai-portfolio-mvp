import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasFeatureAccess } from "@/lib/access/feature-access";
import { getSnaptrade, fetchAccounts } from "@/lib/connections/snaptrade";

export const maxDuration = 60;

// Diagnostic: shows what SnapTrade actually returns for the user's linked accounts —
// the broker's return rates, its value history, and the performance report — so we can
// pick the right fields. Gated to the user + brokerage_connect. Open it in the browser.
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!(await hasFeatureAccess(user.id, "brokerage_connect"))) {
    return NextResponse.json({ error: "no access" }, { status: 403 });
  }
  const snaptrade = getSnaptrade();
  if (!snaptrade) return NextResponse.json({ error: "not configured" }, { status: 503 });

  const admin = createAdminClient();
  const { data: conn } = await admin.from("brokerage_connections").select("snaptrade_user_id, snaptrade_user_secret").eq("user_id", user.id).eq("provider", "snaptrade").maybeSingle();
  if (!conn?.snaptrade_user_id || !conn?.snaptrade_user_secret) return NextResponse.json({ error: "not connected" });
  const creds = { userId: conn.snaptrade_user_id, userSecret: conn.snaptrade_user_secret };

  const accounts = await fetchAccounts(snaptrade, creds).catch(() => []);
  const out: unknown[] = [];
  for (const a of accounts) {
    const rec: Record<string, unknown> = { accountId: a.id, label: a.label };
    try {
      const rr = await snaptrade.accountInformation.getUserAccountReturnRates({ ...creds, accountId: a.id });
      rec.returnRates = (rr.data as { data?: unknown[] })?.data ?? rr.data;
    } catch (e) { rec.returnRatesError = e instanceof Error ? e.message : String(e); }
    try {
      const bh = await snaptrade.accountInformation.getAccountBalanceHistory({ ...creds, accountId: a.id });
      const hist = ((bh.data as { history?: Array<{ date?: string; total_value?: unknown }> })?.history ?? []);
      rec.balanceHistory = { count: hist.length, first: hist[0] ?? null, last: hist[hist.length - 1] ?? null };
    } catch (e) { rec.balanceHistoryError = e instanceof Error ? e.message : String(e); }
    try {
      const end = new Date().toISOString().slice(0, 10);
      const start = new Date(Date.now() - 400 * 86_400_000).toISOString().slice(0, 10);
      const rep = await snaptrade.transactionsAndReporting.getReportingCustomRange({ ...creds, accounts: a.id, startDate: start, endDate: end, frequency: "daily" });
      const perf = rep.data as { rateOfReturn?: number; totalEquityTimeframe?: Array<{ date?: string; value?: number }> };
      const te = perf.totalEquityTimeframe ?? [];
      rec.reporting = { rateOfReturn: perf.rateOfReturn, equityCount: te.length, equityFirst: te[0] ?? null, equityLast: te[te.length - 1] ?? null };
    } catch (e) { rec.reportingError = e instanceof Error ? e.message : String(e); }
    out.push(rec);
  }

  return NextResponse.json({ accounts: accounts.length, data: out }, { status: 200 });
}
