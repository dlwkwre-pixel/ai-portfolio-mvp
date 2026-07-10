import type { Snaptrade } from "snaptrade-typescript-sdk";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAccountPositions, fetchAccountCash, fetchAccountActivities, fetchAccountEquityHistory } from "./snaptrade";

function defaultHistoryStart(): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 5);
  return d.toISOString().slice(0, 10);
}

// Overwrite a linked portfolio's chart/return history with the broker's own daily
// value series (the source of truth). Respects the portfolio's chart_start_date so
// the user can start the chart at a chosen date (e.g. skip old losses + a dormant
// gap). Only writes when the broker returns a usable series, so it never wipes data
// to nothing. Returns the number of snapshots written.
export async function rebuildLinkedPortfolioHistory(
  st: Snaptrade, portfolioId: string, creds: Creds, accountId: string,
): Promise<number> {
  const admin = createAdminClient();
  const { data: p } = await admin
    .from("portfolios").select("chart_start_date").eq("id", portfolioId).maybeSingle()
    .then((r) => r, () => ({ data: null }));
  const startDate = (p?.chart_start_date as string | null) || defaultHistoryStart();
  const endDate = new Date().toISOString().slice(0, 10);

  const { series } = await fetchAccountEquityHistory(st, creds, accountId, startDate, endDate);
  if (series.length < 2) return 0;

  // Broker value series is deposit-inclusive truth, so drop any external cash flows on
  // this linked portfolio — netting them out again distorts the return (dividends are
  // income and kept). Then overwrite snapshots with the broker's series.
  await admin.from("cash_ledger").delete().eq("portfolio_id", portfolioId)
    .in("reason", ["deposit", "withdrawal", "adjustment_in", "adjustment_out", "fee"]).then((r) => r, () => ({}));
  await admin.from("portfolio_snapshots").delete().eq("portfolio_id", portfolioId).then((r) => r, () => ({}));
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
