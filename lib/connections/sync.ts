import type { Snaptrade } from "snaptrade-typescript-sdk";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAccountPositions, fetchAccountCash, fetchAccountActivities, fetchAccountValueHistory, fetchAccountReturnRate } from "./snaptrade";

// Sync a linked portfolio's chart + return directly from the broker.
//
// SnapTrade's "Portfolio Performance" endpoints (return rates, balance history, custom
// reporting) are 403 on the free tier, so we CANNOT rely on the broker's own return or
// value history. Instead we compute both from the endpoints that DO work everywhere:
// current positions (shares, price, average_purchase_price) + cash. The broker
// endpoints are still attempted first, so this auto-upgrades to the exact broker number
// if the paid add-on is ever enabled.
//
// Return = cost-basis total return on the current holdings (matches the "total return"
// Robinhood shows on your positions). The value chart is a clean baseline→current line
// whose growth equals that return, with the real live value as the endpoint — replacing
// the stale performance-index snapshots that made the chart read ~$1.6k on an $859
// account. Returns the number of snapshots written.
export async function rebuildLinkedPortfolioHistory(
  st: Snaptrade, portfolioId: string, creds: Creds, accountId: string,
): Promise<number> {
  const admin = createAdminClient();
  const { data: p } = await admin
    .from("portfolios").select("chart_start_date").eq("id", portfolioId).maybeSingle()
    .then((r) => r, () => ({ data: null }));
  const startDate = (p?.chart_start_date as string | null) || null;

  // Drop external cash flows (broker value is truth; dividends are income and kept).
  await admin.from("cash_ledger").delete().eq("portfolio_id", portfolioId)
    .in("reason", ["deposit", "withdrawal", "adjustment_in", "adjustment_out", "fee"]).then((r) => r, () => ({}));

  // Live holdings + cash (these endpoints work on every SnapTrade tier).
  const [positions, cash] = await Promise.all([
    fetchAccountPositions(st, creds, accountId).catch(() => []),
    fetchAccountCash(st, creds, accountId).catch(() => 0),
  ]);
  let positionsValue = 0, positionsCost = 0;
  for (const pos of positions) {
    positionsValue += pos.value || (pos.price != null ? pos.price * pos.shares : 0);
    if (pos.avgCost != null && pos.avgCost > 0) positionsCost += pos.avgCost * pos.shares;
  }
  const currentValue = Math.round((positionsValue + cash) * 100) / 100;

  // Return: prefer the broker's own number (paid tier); else cost-basis total return on
  // the current holdings (free tier). Cash is neutral (not "invested"), so it's excluded.
  const brokerReturn = await fetchAccountReturnRate(st, creds, accountId);
  let returnPct: number | null = brokerReturn;
  if (returnPct == null && positionsCost > 0) {
    returnPct = ((positionsValue - positionsCost) / positionsCost) * 100;
  }
  if (returnPct != null && Number.isFinite(returnPct)) {
    await admin.from("portfolios")
      .update({ broker_return_pct: Math.round(returnPct * 100) / 100, broker_return_as_of: new Date().toISOString() })
      .eq("id", portfolioId).then((r) => r, () => ({}));
  }

  // Purge our synthetic snapshots so the stale performance-index values can't linger.
  await admin.from("portfolio_snapshots").delete().eq("portfolio_id", portfolioId).eq("notes", "Synced from brokerage").then((r) => r, () => ({}));

  // Value chart. Prefer the broker's real value history (paid tier); else build a clean
  // baseline→current line whose growth equals the return above, ending at the live value.
  let series = await fetchAccountValueHistory(st, creds, accountId);
  if (startDate) series = series.filter((pt) => pt.date >= startDate);
  if (series.length < 2) {
    if (currentValue <= 0) return 0;
    // Free-tier path: also purge any legacy snapshot whose value is implausibly far
    // above the real live value — these are the corrupt performance-index rows (~$1.6k
    // on an $859 account) left by earlier versions, whatever they were labeled.
    await admin.from("portfolio_snapshots").delete().eq("portfolio_id", portfolioId)
      .gt("total_value", Math.round(currentValue * 1.4 * 100) / 100).then((r) => r, () => ({}));
    const rp = returnPct != null && Number.isFinite(returnPct) && returnPct > -100 ? returnPct : null;
    const baseVal = rp != null
      ? Math.round((currentValue / (1 + rp / 100)) * 100) / 100
      : (positionsCost > 0 ? Math.round(positionsCost * 100) / 100 : currentValue);
    // Baseline date: the user's chosen chart start, else the earliest holding open date,
    // else 90 days back so the line has a sensible span.
    let baseDate = startDate;
    if (!baseDate) {
      const { data: h } = await admin.from("holdings").select("opened_at").eq("portfolio_id", portfolioId)
        .not("opened_at", "is", null).order("opened_at", { ascending: true }).limit(1).maybeSingle()
        .then((r) => r, () => ({ data: null }));
      baseDate = (h?.opened_at as string | null)?.slice(0, 10) || new Date(Date.now() - 90 * 86_400_000).toISOString().slice(0, 10);
    }
    const today = new Date().toISOString().slice(0, 10);
    if (baseDate >= today) baseDate = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    series = [{ date: baseDate, value: baseVal }, { date: today, value: currentValue }];
  }
  const rows = series.map((pt) => ({
    portfolio_id: portfolioId, total_value: Math.round(pt.value * 100) / 100, cash_balance: 0,
    snapshot_date: pt.date, notes: "Synced from brokerage",
  }));
  for (let i = 0; i < rows.length; i += 500) {
    await admin.from("portfolio_snapshots").insert(rows.slice(i, i + 500)).then((r) => r, () => ({}));
  }
  return rows.length;
}

type Creds = { userId: string; userSecret: string };

// Import an account's new transaction activity into a target portfolio, deduped by
// activity id. Dividends/interest/deposits/withdrawals/fees → cash_ledger; buys/sells
// → portfolio_transactions. Skipped entirely if the dedup table is missing, so it can
// never double-count. Returns the number of rows imported.
export async function importAccountActivities(
  st: Snaptrade, userId: string, creds: Creds, accountId: string, targetPortfolioId: string,
): Promise<number> {
  const admin = createAdminClient();
  try {
    const activities = await fetchAccountActivities(st, creds, accountId);
    if (activities.length === 0) return 0;
    const { data: already, error: dedupErr } = await admin
      .from("brokerage_synced_activities").select("activity_id")
      .eq("user_id", userId).eq("provider", "snaptrade").in("activity_id", activities.map((a) => a.id));
    if (dedupErr) return 0; // table missing → skip, never import un-deduped

    const done = new Set((already ?? []).map((r) => r.activity_id));
    const cashRows: Record<string, unknown>[] = [];
    const txRows: Record<string, unknown>[] = [];
    const syncedIds: Record<string, unknown>[] = [];
    for (const a of activities) {
      if (done.has(a.id)) continue;
      const t = a.type.toLowerCase();
      const when = a.date ? new Date(a.date).toISOString() : new Date().toISOString();
      const gross = Math.abs(a.amount) || Math.abs(a.units * a.price) || 0;
      let handled = true;
      if (t.includes("buy") || t.includes("reinvest") || t === "rei") {
        txRows.push({ portfolio_id: targetPortfolioId, transaction_type: "buy", ticker: a.ticker, company_name: a.name, quantity: a.units || null, price_per_share: a.price || null, gross_amount: gross || null, fees: a.fee || 0, net_cash_impact: -(gross + (a.fee || 0)), notes: "Imported from your brokerage.", traded_at: when });
      } else if (t.includes("sell")) {
        txRows.push({ portfolio_id: targetPortfolioId, transaction_type: "sell", ticker: a.ticker, company_name: a.name, quantity: a.units ? Math.abs(a.units) : null, price_per_share: a.price || null, gross_amount: gross || null, fees: a.fee || 0, net_cash_impact: gross - (a.fee || 0), notes: "Imported from your brokerage.", traded_at: when });
      } else if (t.includes("div") || t.includes("interest")) {
        // Income — counts toward return and shows on the income page.
        if (gross > 0) cashRows.push({ portfolio_id: targetPortfolioId, amount: gross, direction: "IN", reason: "dividend", effective_at: when });
      } else if (t.includes("withdraw") || t.includes("contribution") || t.includes("deposit") || t.includes("transfer") || t.includes("fee")) {
        // External cash movement (deposit/withdrawal/fee/transfer). The broker's value
        // series already reflects these, so we do NOT book them as cash_ledger flows —
        // netting them out again distorts the return (TWR blows up on big flows vs a
        // small balance). Mark them seen so they aren't reprocessed.
      } else {
        handled = false;
      }
      if (handled) syncedIds.push({ user_id: userId, provider: "snaptrade", activity_id: a.id });
    }
    if (cashRows.length > 0) await admin.from("cash_ledger").insert(cashRows).then((r) => r, () => ({}));
    if (txRows.length > 0) await admin.from("portfolio_transactions").insert(txRows).then((r) => r, () => ({}));
    if (syncedIds.length > 0) await admin.from("brokerage_synced_activities").insert(syncedIds).then((r) => r, () => ({}));
    return cashRows.length + txRows.length;
  } catch {
    return 0;
  }
}

// Full auto-resync of one linked account (no review): reconcile positions in place
// (a held ticker updates wherever it lives; a new ticker lands in the default
// portfolio), set the default portfolio's cash, and import new activities. Does NOT
// delete holdings (mirror-delete is a separate, opt-in step). Used by the cron and
// the manual refresh.
export async function resyncBrokerageAccount(
  st: Snaptrade, userId: string, creds: Creds, accountId: string, defaultPortfolioId: string,
): Promise<{ updated: number; added: number; activities: number }> {
  const admin = createAdminClient();

  const { data: portfolios } = await admin.from("portfolios").select("id").eq("user_id", userId).eq("status", "active");
  const own = new Set((portfolios ?? []).map((p) => p.id));
  if (!own.has(defaultPortfolioId)) return { updated: 0, added: 0, activities: 0 };
  const pids = [...own];

  const tickerToPortfolio: Record<string, string> = {};
  if (pids.length > 0) {
    const { data: holdings } = await admin.from("holdings").select("ticker, portfolio_id").in("portfolio_id", pids);
    for (const h of holdings ?? []) {
      const t = String(h.ticker).toUpperCase();
      if (!tickerToPortfolio[t]) tickerToPortfolio[t] = h.portfolio_id;
    }
  }

  const positions = await fetchAccountPositions(st, creds, accountId);
  let updated = 0, added = 0;
  for (const p of positions) {
    const existingPid = tickerToPortfolio[p.ticker];
    const target = existingPid && own.has(existingPid) ? existingPid : defaultPortfolioId;
    const { data: existing } = await admin.from("holdings").select("id").eq("portfolio_id", target).ilike("ticker", p.ticker).maybeSingle();
    if (existing) {
      await admin.from("holdings").update({ shares: p.shares, average_cost_basis: p.avgCost, company_name: p.name, asset_type: p.assetType }).eq("id", existing.id);
      updated++;
    } else {
      await admin.from("holdings").insert({ portfolio_id: target, ticker: p.ticker, company_name: p.name, asset_type: p.assetType, shares: p.shares, average_cost_basis: p.avgCost });
      added++;
    }
  }

  const cash = await fetchAccountCash(st, creds, accountId);
  await admin.from("portfolios").update({ cash_balance: cash }).eq("id", defaultPortfolioId).eq("user_id", userId).then((r) => r, () => ({}));

  const activities = await importAccountActivities(st, userId, creds, accountId, defaultPortfolioId);
  // Overwrite the chart/return history with the broker's own value series.
  await rebuildLinkedPortfolioHistory(st, defaultPortfolioId, creds, accountId);
  return { updated, added, activities };
}
