import type { Snaptrade } from "snaptrade-typescript-sdk";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAccountPositions, fetchAccountCash, fetchAccountActivities, fetchAccountReturnRate } from "./snaptrade";
import { reconstructValueSeries } from "./reconstruct";

// Sync a linked portfolio's chart + return directly from the broker's data.
//
// SnapTrade's "Portfolio Performance" endpoints (return rates, balance history, custom
// reporting) are 403 on the free tier, so we CANNOT read the broker's own return or
// value history. We compute both from the endpoints that work everywhere — current
// positions + cash + activity history — plus FMP historical prices:
//
//  - RETURN: if the deposit history is clean (deposits reconcile with buys/value) we use
//    the net-deposit return, which matches Robinhood exactly (verified on a Roth: our
//    +14.66% vs RH +14.74%). If deposits are polluted with internal sweeps (Robinhood
//    reports cash sweeps as "contributions", e.g. $40k of "deposits" on a $1.1k account),
//    net-deposit is garbage, so we use a reconstructed Modified-Dietz windowed return
//    that only counts trade cash flows, never deposits.
//  - CHART: we reconstruct the real daily value by replaying trades against historical
//    market prices (reconstruct.ts), respecting the user's chart_start_date so they can
//    trim off an old loss. Falls back to a clean baseline→current line if price coverage
//    is poor. Either way this replaces the corrupt performance-index snapshots that made
//    the chart read ~$1.6k on an $859 account.
//
// The broker's own endpoints are still tried first, so this auto-upgrades to the exact
// broker figure if the paid add-on is ever enabled. Returns snapshots written.
export async function rebuildLinkedPortfolioHistory(
  st: Snaptrade, portfolioId: string, creds: Creds, accountId: string,
): Promise<number> {
  const admin = createAdminClient();
  const { data: p } = await admin
    .from("portfolios").select("chart_start_date").eq("id", portfolioId).maybeSingle()
    .then((r) => r, () => ({ data: null }));
  const startDatePref = (p?.chart_start_date as string | null)?.slice(0, 10) || null;

  // Drop external cash flows (they'd double-count against a value-based chart).
  await admin.from("cash_ledger").delete().eq("portfolio_id", portfolioId)
    .in("reason", ["deposit", "withdrawal", "adjustment_in", "adjustment_out", "fee"]).then((r) => r, () => ({}));

  // Account-level data (all work on every SnapTrade tier).
  const [allPositions, cash, allActivities] = await Promise.all([
    fetchAccountPositions(st, creds, accountId).catch(() => []),
    fetchAccountCash(st, creds, accountId).catch(() => 0),
    fetchAccountActivities(st, creds, accountId, 500).catch(() => []),
  ]);

  // One brokerage account can feed several portfolios (split by holding period). Rebuild
  // THIS portfolio from only the tickers assigned to it (its holdings ∩ the account's
  // positions). Cash lives with the account's default portfolio.
  const { data: myHoldings } = await admin.from("holdings").select("ticker").eq("portfolio_id", portfolioId)
    .then((r) => r, () => ({ data: null }));
  const myTickers = new Set((myHoldings ?? []).map((h) => String(h.ticker).toUpperCase()));
  const accountTickers = new Set(allPositions.map((p) => p.ticker.toUpperCase()));
  // Only filter when this portfolio is a strict subset (a real split); a 1:1 link holds
  // everything, so keep the whole account (also covers the not-yet-migrated case).
  const isSplit = myTickers.size > 0 && [...accountTickers].some((t) => !myTickers.has(t));
  const positions = isSplit ? allPositions.filter((p) => myTickers.has(p.ticker.toUpperCase())) : allPositions;
  const activities = isSplit ? allActivities.filter((a) => a.ticker && myTickers.has(a.ticker.toUpperCase())) : allActivities;

  // Cash goes to the account's default (cash) portfolio only.
  const { data: link } = await admin.from("brokerage_account_links").select("default_portfolio_id")
    .eq("snaptrade_account_id", accountId).limit(1).maybeSingle().then((r) => r, () => ({ data: null }));
  const includeCash = (!isSplit || link?.default_portfolio_id === portfolioId) ? cash : 0;

  let positionsValue = 0, positionsCost = 0;
  for (const pos of positions) {
    positionsValue += pos.value || (pos.price != null ? pos.price * pos.shares : 0);
    if (pos.avgCost != null && pos.avgCost > 0) positionsCost += pos.avgCost * pos.shares;
  }
  const currentValue = Math.round((positionsValue + includeCash) * 100) / 100;
  if (currentValue <= 0) return 0;

  // Net-deposit stats → is the deposit history clean enough to trust? Deposits are
  // account-level, so this only applies to a 1:1 link (not a split, where deposits can't
  // be attributed to one side).
  let deposits = 0, withdrawals = 0, totalBuys = 0, earliestActivity: string | null = null;
  for (const a of activities) {
    const t = a.type.toLowerCase();
    const gross = Math.abs(a.amount) || Math.abs(a.units * a.price) || 0;
    if (t.includes("deposit") || t.includes("contribution")) deposits += gross;
    else if (t.includes("withdraw")) withdrawals += gross;
    if (t.includes("buy")) totalBuys += gross;
    const d = (a.date ?? "").slice(0, 10);
    if (d && (!earliestActivity || d < earliestActivity)) earliestActivity = d;
  }
  const netInvested = deposits - withdrawals;
  const netDepositPct = netInvested > 0 ? ((currentValue - netInvested) / netInvested) * 100 : null;
  // Clean = deposits reconcile: a plausible return, and deposits aren't wildly larger
  // than the money that actually bought stock or sits in the account (sweep pollution).
  // Never for a split (deposits can't be attributed to one side of the split).
  const depositsClean = !isSplit && netDepositPct != null && netDepositPct > -60 && netDepositPct < 1000
    && deposits <= 3 * (currentValue + totalBuys);

  // Reconstruction window. User's chosen start wins. Otherwise default to the last year
  // (avoids ancient distortion like long-closed options positions), but not before the
  // account's earliest activity if it's younger than that.
  const today = new Date().toISOString().slice(0, 10);
  const oneYearAgo = new Date(Date.now() - 365 * 86_400_000).toISOString().slice(0, 10);
  let startDate = startDatePref
    || (earliestActivity && earliestActivity > oneYearAgo ? earliestActivity : oneYearAgo);
  if (startDate >= today) startDate = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);

  const recon = await reconstructValueSeries(positions, activities, includeCash, currentValue, startDate, today);

  // Return: broker's own number first (paid tier). Then, when the user hasn't trimmed the
  // window and deposits are clean → net-deposit (exact broker match). Otherwise the
  // reconstructed windowed return (pollution-proof). Cost-basis is the last resort.
  const brokerReturn = await fetchAccountReturnRate(st, creds, accountId);
  let returnPct: number | null = brokerReturn;
  if (returnPct == null) {
    if (depositsClean && !startDatePref) returnPct = netDepositPct!;
    else if (recon.pricedCoverage >= 0.85 && recon.returnPct != null) returnPct = recon.returnPct;
    else if (depositsClean) returnPct = netDepositPct!;
    else if (positionsCost > 0) returnPct = ((positionsValue - positionsCost) / positionsCost) * 100;
  }
  if (returnPct != null && Number.isFinite(returnPct)) {
    await admin.from("portfolios")
      .update({ broker_return_pct: Math.round(returnPct * 100) / 100, broker_return_as_of: new Date().toISOString() })
      .eq("id", portfolioId).then((r) => r, () => ({}));
  }

  // Value chart.
  const useRecon = recon.coverage >= 0.7 && recon.series.length >= 2;
  let series: Array<{ date: string; value: number }>;
  if (useRecon) {
    // Reconstruction fully defines the line → clean slate so no stale rows survive.
    await admin.from("portfolio_snapshots").delete().eq("portfolio_id", portfolioId).then((r) => r, () => ({}));
    series = recon.series;
    // Anchor the last point to the exact live value (FMP EOD can lag intraday).
    series[series.length - 1] = { date: series[series.length - 1].date, value: currentValue };
  } else {
    // Fallback: purge our synthetic rows + any implausible legacy row (corrupt index
    // values), then draw a baseline→current line whose growth equals the return above.
    await admin.from("portfolio_snapshots").delete().eq("portfolio_id", portfolioId).eq("notes", "Synced from brokerage").then((r) => r, () => ({}));
    await admin.from("portfolio_snapshots").delete().eq("portfolio_id", portfolioId)
      .gt("total_value", Math.round(currentValue * 1.6 * 100) / 100).then((r) => r, () => ({}));
    const rp = returnPct != null && Number.isFinite(returnPct) && returnPct > -100 ? returnPct : null;
    const baseVal = rp != null
      ? Math.round((currentValue / (1 + rp / 100)) * 100) / 100
      : (positionsCost > 0 ? Math.round(positionsCost * 100) / 100 : currentValue);
    series = [{ date: startDate, value: baseVal }, { date: today, value: currentValue }];
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
//
// The holdings/cash/activity refresh is cheap and always runs. The chart+return rebuild
// (rebuildLinkedPortfolioHistory) fetches FMP price history and rewrites snapshots, so it
// is throttled: it only runs on `forceRebuild` (the manual "Sync all now" + daily cron)
// or when the last rebuild is older than 4h. This keeps the every-2-min AutoResync from
// burning the FMP quota / churning the DB while the live value stays fresh via quotes.
export async function resyncBrokerageAccount(
  st: Snaptrade, userId: string, creds: Creds, accountId: string, defaultPortfolioId: string,
  opts?: { forceRebuild?: boolean },
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
      await admin.from("holdings").update({ shares: p.shares, average_cost_basis: p.avgCost, company_name: p.name, asset_type: p.assetType, brokerage_account_id: accountId }).eq("id", existing.id)
        .then((r) => r, () => admin.from("holdings").update({ shares: p.shares, average_cost_basis: p.avgCost, company_name: p.name, asset_type: p.assetType }).eq("id", existing.id));
      updated++;
    } else {
      await admin.from("holdings").insert({ portfolio_id: target, ticker: p.ticker, company_name: p.name, asset_type: p.assetType, shares: p.shares, average_cost_basis: p.avgCost, brokerage_account_id: accountId })
        .then((r) => r, () => admin.from("holdings").insert({ portfolio_id: target, ticker: p.ticker, company_name: p.name, asset_type: p.assetType, shares: p.shares, average_cost_basis: p.avgCost }));
      added++;
    }
  }

  const cash = await fetchAccountCash(st, creds, accountId);
  await admin.from("portfolios").update({ cash_balance: cash }).eq("id", defaultPortfolioId).eq("user_id", userId).then((r) => r, () => ({}));

  const activities = await importAccountActivities(st, userId, creds, accountId, defaultPortfolioId);

  // Rebuild the chart/return only when forced or stale (>4h) — see note above.
  let shouldRebuild = opts?.forceRebuild ?? false;
  if (!shouldRebuild) {
    const { data: pr } = await admin.from("portfolios").select("broker_return_as_of").eq("id", defaultPortfolioId).maybeSingle().then((r) => r, () => ({ data: null }));
    const asOf = pr?.broker_return_as_of ? new Date(pr.broker_return_as_of as string).getTime() : 0;
    shouldRebuild = !asOf || Date.now() - asOf > 4 * 60 * 60 * 1000;
  }
  if (shouldRebuild) {
    // Rebuild every portfolio this account feeds (a split account feeds several), each
    // from its own tickers. Falls back to just the default if the marker isn't migrated.
    const targets = new Set<string>([defaultPortfolioId]);
    const { data: fed } = await admin.from("holdings").select("portfolio_id").eq("brokerage_account_id", accountId)
      .then((r) => r, () => ({ data: null }));
    for (const row of fed ?? []) if (row.portfolio_id && own.has(row.portfolio_id)) targets.add(row.portfolio_id);
    for (const pid of targets) await rebuildLinkedPortfolioHistory(st, pid, creds, accountId);
  }
  return { updated, added, activities };
}
