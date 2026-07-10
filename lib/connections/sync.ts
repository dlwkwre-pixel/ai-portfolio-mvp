import type { Snaptrade } from "snaptrade-typescript-sdk";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAccountPositions, fetchAccountCash, fetchAccountActivities } from "./snaptrade";

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
        if (gross > 0) cashRows.push({ portfolio_id: targetPortfolioId, amount: gross, direction: "IN", reason: "dividend", effective_at: when });
      } else if (t.includes("withdraw")) {
        if (gross > 0) cashRows.push({ portfolio_id: targetPortfolioId, amount: gross, direction: "OUT", reason: "withdrawal", effective_at: when });
      } else if (t.includes("contribution") || t.includes("deposit") || t.includes("transfer")) {
        if (gross > 0) cashRows.push({ portfolio_id: targetPortfolioId, amount: gross, direction: "IN", reason: "deposit", effective_at: when });
      } else if (t.includes("fee")) {
        if (gross > 0) cashRows.push({ portfolio_id: targetPortfolioId, amount: gross, direction: "OUT", reason: "fee", effective_at: when });
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
  return { updated, added, activities };
}
