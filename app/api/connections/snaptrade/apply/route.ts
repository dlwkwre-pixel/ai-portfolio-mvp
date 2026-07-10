import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasFeatureAccess } from "@/lib/access/feature-access";
import { getSnaptrade, fetchAccountPositions } from "@/lib/connections/snaptrade";

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

  const body = await req.json().catch(() => null) as { accountId?: string; defaultPortfolioId?: string | null; assignments?: Record<string, string> } | null;
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
    await admin.from("brokerage_account_links").upsert(
      { user_id: user.id, provider: "snaptrade", snaptrade_account_id: accountId, default_portfolio_id: defaultPortfolioId, updated_at: new Date().toISOString() },
      { onConflict: "user_id,provider,snaptrade_account_id" },
    ).then((r) => r, () => ({}));
    await admin.from("brokerage_connections").update({
      connected: true, last_synced_at: new Date().toISOString(), last_error: null, updated_at: new Date().toISOString(),
    }).eq("user_id", user.id).eq("provider", "snaptrade");

    // Revalidate affected portfolio pages.
    return NextResponse.json({ updated, added, skipped });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Import failed.";
    return NextResponse.json({ error: msg.includes("brokerage_account_links") ? "Run supabase/brokerage-account-links.sql first." : msg }, { status: 500 });
  }
}
