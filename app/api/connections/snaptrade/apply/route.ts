import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasFeatureAccess } from "@/lib/access/feature-access";
import { getSnaptrade, fetchAccountPositions, fetchAccountCash, fetchAccountActivities } from "@/lib/connections/snaptrade";

export const maxDuration = 60;

// Reconcile a linked account's positions INTO existing portfolios, in place. Each
// ticker is assigned to a portfolio (or omitted to skip). Matches update shares +
// cost (keeping the holding's id/history); new tickers are inserted. Nothing is
// deleted, and no portfolio is created — so net worth doesn't duplicate and AI
// recs/journal/snapshots stay attached. Positions are re-fetched server-side; the
// client only supplies the ticker→portfolio assignment.
export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!(await hasFeatureAccess(user.id, "brokerage_connect"))) {
    return NextResponse.json({ error: "Brokerage connections are in private beta." }, { status: 403 });
  }
  const snaptrade = getSnaptrade();
  if (!snaptrade) return NextResponse.json({ error: "SnapTrade is not configured." }, { status: 503 });

  const body = await req.json().catch(() => null) as { accountId?: string; defaultPortfolioId?: string | null; cashPortfolioId?: string | null; assignments?: Record<string, string> } | null;
  const accountId = body?.accountId;
  const assignments = body?.assignments ?? {};
  if (!accountId) return NextResponse.json({ error: "Missing account." }, { status: 400 });

  const admin = createAdminClient();
  const { data: conn } = await admin
    .from("brokerage_connections").select("snaptrade_user_id, snaptrade_user_secret").eq("user_id", user.id).eq("provider", "snaptrade").maybeSingle();
  if (!conn?.snaptrade_user_id || !conn?.snaptrade_user_secret) {
    return NextResponse.json({ error: "Connect a brokerage first." }, { status: 400 });
  }

  try {
    // Only allow assigning into the user's own active portfolios.
    const { data: portfolios } = await admin.from("portfolios").select("id").eq("user_id", user.id).eq("status", "active");
    const ownPortfolios = new Set((portfolios ?? []).map((p) => p.id));

    const positions = await fetchAccountPositions(snaptrade, { userId: conn.snaptrade_user_id, userSecret: conn.snaptrade_user_secret }, accountId);
    const posByTicker = new Map(positions.map((p) => [p.ticker, p]));

    let updated = 0, added = 0, skipped = 0;
    for (const [tickerRaw, portfolioId] of Object.entries(assignments)) {
      const ticker = tickerRaw.toUpperCase();
      const pos = posByTicker.get(ticker);
      if (!pos || !portfolioId || !ownPortfolios.has(portfolioId)) { skipped++; continue; }

      const { data: existing } = await admin
        .from("holdings").select("id").eq("portfolio_id", portfolioId).ilike("ticker", ticker).maybeSingle();
      if (existing) {
        await admin.from("holdings").update({
          shares: pos.shares, average_cost_basis: pos.avgCost, company_name: pos.name, asset_type: pos.assetType,
        }).eq("id", existing.id);
        updated++;
      } else {
        await admin.from("holdings").insert({
          portfolio_id: portfolioId, ticker, company_name: pos.name, asset_type: pos.assetType,
          shares: pos.shares, average_cost_basis: pos.avgCost,
        });
        added++;
      }
    }

    // Remember the account's default portfolio for next time.
    const defaultPortfolioId = body?.defaultPortfolioId && ownPortfolios.has(body.defaultPortfolioId) ? body.defaultPortfolioId : null;

    // Cash is assignable like a holding: the account's single cash pool goes to the
    // chosen portfolio (defaults to the account default; null = skip / leave as-is).
    const rawCashPid = body?.cashPortfolioId;
    const cashPortfolioId = rawCashPid === null
      ? null
      : (rawCashPid && ownPortfolios.has(rawCashPid)) ? rawCashPid : defaultPortfolioId;
    if (cashPortfolioId) {
      const cash = await fetchAccountCash(snaptrade, { userId: conn.snaptrade_user_id, userSecret: conn.snaptrade_user_secret }, accountId);
      await admin.from("portfolios").update({ cash_balance: cash }).eq("id", cashPortfolioId).eq("user_id", user.id).then((r) => r, () => ({}));
    }

    // Auto-import the account's transaction history into the primary portfolio, once
    // each (deduped by activity id). Dividends/deposits/withdrawals → cash_ledger (so
    // returns are correct); buys/sells → portfolio_transactions (history + realized P/L).
    // Skipped entirely if the dedup table is missing, to avoid ever double-counting.
    let activitiesImported = 0;
    const activityTarget = cashPortfolioId || defaultPortfolioId;
    if (activityTarget) {
      try {
        const activities = await fetchAccountActivities(snaptrade, { userId: conn.snaptrade_user_id, userSecret: conn.snaptrade_user_secret }, accountId);
        if (activities.length > 0) {
          const { data: already, error: dedupErr } = await admin
            .from("brokerage_synced_activities").select("activity_id")
            .eq("user_id", user.id).eq("provider", "snaptrade").in("activity_id", activities.map((a) => a.id));
          if (!dedupErr) { // table exists → safe to import
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
                txRows.push({ portfolio_id: activityTarget, transaction_type: "buy", ticker: a.ticker, company_name: a.name, quantity: a.units || null, price_per_share: a.price || null, gross_amount: gross || null, fees: a.fee || 0, net_cash_impact: -(gross + (a.fee || 0)), notes: "Imported from your brokerage.", traded_at: when });
              } else if (t.includes("sell")) {
                txRows.push({ portfolio_id: activityTarget, transaction_type: "sell", ticker: a.ticker, company_name: a.name, quantity: a.units ? Math.abs(a.units) : null, price_per_share: a.price || null, gross_amount: gross || null, fees: a.fee || 0, net_cash_impact: gross - (a.fee || 0), notes: "Imported from your brokerage.", traded_at: when });
              } else if (t.includes("div") || t.includes("interest")) {
                if (gross > 0) cashRows.push({ portfolio_id: activityTarget, amount: gross, direction: "IN", reason: "dividend", effective_at: when });
              } else if (t.includes("withdraw")) {
                if (gross > 0) cashRows.push({ portfolio_id: activityTarget, amount: gross, direction: "OUT", reason: "withdrawal", effective_at: when });
              } else if (t.includes("contribution") || t.includes("deposit") || t.includes("transfer")) {
                if (gross > 0) cashRows.push({ portfolio_id: activityTarget, amount: gross, direction: "IN", reason: "deposit", effective_at: when });
              } else if (t.includes("fee")) {
                if (gross > 0) cashRows.push({ portfolio_id: activityTarget, amount: gross, direction: "OUT", reason: "fee", effective_at: when });
              } else {
                handled = false; // unknown type — leave un-synced so we can handle later
              }
              if (handled) syncedIds.push({ user_id: user.id, provider: "snaptrade", activity_id: a.id });
            }
            if (cashRows.length > 0) await admin.from("cash_ledger").insert(cashRows).then((r) => r, () => ({}));
            if (txRows.length > 0) await admin.from("portfolio_transactions").insert(txRows).then((r) => r, () => ({}));
            if (syncedIds.length > 0) await admin.from("brokerage_synced_activities").insert(syncedIds).then((r) => r, () => ({}));
            activitiesImported = cashRows.length + txRows.length;
          }
        }
      } catch { /* activity import is best-effort */ }
    }

    await admin.from("brokerage_account_links").upsert(
      { user_id: user.id, provider: "snaptrade", snaptrade_account_id: accountId, default_portfolio_id: defaultPortfolioId, updated_at: new Date().toISOString() },
      { onConflict: "user_id,provider,snaptrade_account_id" },
    ).then((r) => r, () => ({}));
    await admin.from("brokerage_connections").update({
      connected: true, last_synced_at: new Date().toISOString(), last_error: null, updated_at: new Date().toISOString(),
    }).eq("user_id", user.id).eq("provider", "snaptrade");

    return NextResponse.json({ updated, added, skipped, activitiesImported });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Import failed.";
    return NextResponse.json({ error: msg.includes("brokerage_account_links") ? "Run supabase/brokerage-account-links.sql first." : msg }, { status: 500 });
  }
}
