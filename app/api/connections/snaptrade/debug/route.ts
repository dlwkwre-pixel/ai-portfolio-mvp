import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasFeatureAccess } from "@/lib/access/feature-access";
import { getSnaptrade, fetchAccounts, fetchAccountPositions, fetchAccountCash, fetchAccountActivities } from "@/lib/connections/snaptrade";
import { reconstructValueSeries, fetchDailyCloses } from "@/lib/connections/reconstruct";

export const maxDuration = 300;

const round = (n: number) => Math.round(n * 100) / 100;

// Diagnostic for linked-portfolio returns. Computes both candidate return numbers from
// the endpoints that work on the free tier (positions + cash + activities), so we can
// compare them to what Robinhood shows and pick the right one. Also reports whether the
// broker's paid "Portfolio Performance" endpoints are reachable, and whether the activity
// history looks complete (needed for the all-time / net-deposit number). Gated to the
// user + brokerage_connect. Open it in the browser.
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

    // Live value + cost basis from current positions.
    const positions = await fetchAccountPositions(snaptrade, creds, a.id).catch(() => []);
    const cash = await fetchAccountCash(snaptrade, creds, a.id).catch(() => 0);
    let positionsValue = 0, positionsCost = 0;
    for (const p of positions) {
      positionsValue += p.value || (p.price != null ? p.price * p.shares : 0);
      if (p.avgCost != null && p.avgCost > 0) positionsCost += p.avgCost * p.shares;
    }
    const currentValue = round(positionsValue + cash);
    const costBasisReturnPct = positionsCost > 0 ? round(((positionsValue - positionsCost) / positionsCost) * 100) : null;

    // Activity history — needed for the all-time (net-deposit) return.
    const activities = await fetchAccountActivities(snaptrade, creds, a.id, 500).catch(() => []);
    const byType: Record<string, { count: number; sum: number }> = {};
    let deposits = 0, withdrawals = 0, dividends = 0;
    let earliest: string | null = null, latest: string | null = null;
    for (const act of activities) {
      const t = (act.type || "unknown").toLowerCase();
      const gross = Math.abs(act.amount) || Math.abs(act.units * act.price) || 0;
      byType[t] = byType[t] || { count: 0, sum: 0 };
      byType[t].count++; byType[t].sum = round(byType[t].sum + gross);
      if (t.includes("deposit") || t.includes("contribution")) deposits += gross;
      else if (t.includes("withdraw")) withdrawals += gross;
      else if (t.includes("div") || t.includes("interest")) dividends += gross;
      if (act.date) { const d = act.date.slice(0, 10); if (!earliest || d < earliest) earliest = d; if (!latest || d > latest) latest = d; }
    }
    const netInvested = round(deposits - withdrawals);
    const allTimeReturnDollars = netInvested > 0 ? round(currentValue - netInvested) : null;
    const allTimeReturnPct = netInvested > 0 ? round(((currentValue - netInvested) / netInvested) * 100) : null;

    rec.currentValue = currentValue;
    rec.positionsValue = round(positionsValue);
    rec.positionsCostBasis = round(positionsCost);
    rec.cash = round(cash);
    rec.holdingsCostBasisReturnPct = costBasisReturnPct;
    rec.activities = {
      count: activities.length,
      hitLimit: activities.length >= 500, // if true, history is truncated → net-deposit unreliable
      dateRange: { earliest, latest },
      deposits: round(deposits), withdrawals: round(withdrawals), dividends: round(dividends),
      netInvested, allTimeReturnDollars, allTimeReturnPct,
      byType,
    };

    // Reconstruction preview over a ~3-month window (matches "up 23% in 3 months").
    // Runs first so it warms the durable price cache before the per-holding probe reads it.
    if (currentValue > 0) {
      const end = new Date().toISOString().slice(0, 10);
      const start90 = new Date(Date.now() - 90 * 86_400_000).toISOString().slice(0, 10);
      const r = await reconstructValueSeries(positions, activities, cash, currentValue, start90, end).catch(() => null);
      if (r) rec.reconstruct90d = {
        returnPct: r.returnPct, coverage: round(r.coverage), pricedCoverage: round(r.pricedCoverage),
        valueStart: r.series[0]?.value ?? null, valueEnd: r.series[r.series.length - 1]?.value ?? null,
        points: r.series.length,
      };
    }

    // Per-holding price coverage (cache-first) — which tickers still can't be valued.
    if (currentValue > 0) {
      const probes: Array<{ ticker: string; value: number; assetType: string; priced: boolean }> = [];
      for (const p of positions) {
        const closes = await fetchDailyCloses(p.ticker.toUpperCase()).catch(() => new Map());
        probes.push({ ticker: p.ticker.toUpperCase(), value: round(p.value || (p.price != null ? p.price * p.shares : 0)), assetType: p.assetType, priced: closes.size > 0 });
      }
      rec.holdings = probes.sort((a, b) => b.value - a.value);
      rec.unpricedValue = round(probes.filter((x) => !x.priced).reduce((s, x) => s + x.value, 0));
    }

    // Is the paid Portfolio Performance API reachable? (403 = free tier.)
    rec.brokerPerfApi = {};
    try { await snaptrade.accountInformation.getUserAccountReturnRates({ ...creds, accountId: a.id }); (rec.brokerPerfApi as Record<string, string>).returnRates = "ok"; }
    catch (e) { (rec.brokerPerfApi as Record<string, string>).returnRates = e instanceof Error && e.message.includes("403") ? "403 (paid add-on)" : "error"; }

    out.push(rec);
  }

  // What BuyTune actually stores per portfolio — reveals duplicates / mis-assignment
  // behind a wrong portfolio value (e.g. a "split" portfolio reading higher than the account).
  const { data: pfs } = await admin.from("portfolios").select("id, name, cash_balance").eq("user_id", user.id).eq("status", "active").then((r) => r, () => ({ data: null }));
  const pfIds = (pfs ?? []).map((p) => p.id);
  const { data: hold } = pfIds.length
    ? await admin.from("holdings").select("portfolio_id, ticker, shares, average_cost_basis, brokerage_account_id").in("portfolio_id", pfIds).then((r) => r, () => ({ data: null }))
    : { data: null };
  const portfolios = (pfs ?? []).map((p) => {
    const hs = (hold ?? []).filter((h) => h.portfolio_id === p.id);
    return {
      id: p.id, name: p.name, cash: round(Number(p.cash_balance ?? 0)),
      holdingsCount: hs.length,
      costBasisSum: round(hs.reduce((s, h) => s + (Number(h.shares) || 0) * (Number(h.average_cost_basis) || 0), 0)),
      holdings: hs.map((h) => ({ ticker: h.ticker, shares: Number(h.shares) || 0, cost: Number(h.average_cost_basis) || 0, acct: h.brokerage_account_id ?? null })),
    };
  });

  return NextResponse.json({ accounts: accounts.length, data: out, portfolios }, { status: 200 });
}
