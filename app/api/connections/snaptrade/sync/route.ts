import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasFeatureAccess } from "@/lib/access/feature-access";
import { getSnaptrade } from "@/lib/connections/snaptrade";

export const maxDuration = 60;

type Agg = { ticker: string; name: string | null; assetType: string; shares: number; costSum: number };

// Maps SnapTrade security type codes to our asset_type buckets.
function assetType(code: string | undefined | null): string {
  const c = (code ?? "").toLowerCase();
  if (c.includes("crypto")) return "crypto";
  if (c === "et" || c.includes("etf")) return "etf";
  return "stock";
}

// Pull the user's positions from SnapTrade and mirror them into a read-only portfolio.
export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!(await hasFeatureAccess(user.id, "brokerage_connect"))) {
    return NextResponse.json({ error: "Brokerage connections are in private beta." }, { status: 403 });
  }

  const snaptrade = getSnaptrade();
  if (!snaptrade) return NextResponse.json({ error: "SnapTrade is not configured." }, { status: 503 });
  const admin = createAdminClient();

  const { data: conn } = await admin
    .from("brokerage_connections").select("*").eq("user_id", user.id).eq("provider", "snaptrade").maybeSingle();
  if (!conn?.snaptrade_user_id || !conn?.snaptrade_user_secret) {
    return NextResponse.json({ error: "Connect a brokerage first." }, { status: 400 });
  }
  const creds = { userId: conn.snaptrade_user_id as string, userSecret: conn.snaptrade_user_secret as string };

  try {
    const accountsRes = await snaptrade.accountInformation.listUserAccounts(creds);
    const accounts = accountsRes.data ?? [];
    if (accounts.length === 0) {
      await admin.from("brokerage_connections").update({ connected: true, last_synced_at: new Date().toISOString(), last_error: "No accounts linked yet." }).eq("user_id", user.id).eq("provider", "snaptrade");
      return NextResponse.json({ imported: 0, note: "No linked accounts found yet." });
    }

    // Aggregate positions across all linked accounts, by ticker.
    const byTicker = new Map<string, Agg>();
    let cash = 0;
    let institution: string | null = null;
    for (const acc of accounts) {
      const accId = (acc as { id?: string }).id;
      if (!accId) continue;
      institution = institution ?? ((acc as { institution_name?: string }).institution_name ?? null);
      // getUserHoldings is deprecated (410 Gone); use the per-account positions endpoint.
      const posRes = await snaptrade.accountInformation.getUserAccountPositions({ ...creds, accountId: accId });
      const posList = (posRes.data ?? []) as Array<{ symbol?: { symbol?: { symbol?: string; description?: string | null; type?: { code?: string } }; description?: string }; units?: number | null; fractional_units?: number | null; average_purchase_price?: number | null }>;
      // Cash balance is a separate endpoint; non-fatal if it fails.
      try {
        const balRes = await snaptrade.accountInformation.getUserAccountBalance({ ...creds, accountId: accId });
        for (const b of (balRes.data ?? []) as Array<{ cash?: number | null }>) cash += Number(b?.cash ?? 0) || 0;
      } catch { /* balances optional */ }
      for (const p of posList) {
        const ticker = p.symbol?.symbol?.symbol;
        if (!ticker) continue;
        const units = Number(p.units ?? p.fractional_units ?? 0) || 0;
        if (units === 0) continue;
        const avg = Number(p.average_purchase_price ?? 0) || 0;
        const key = ticker.toUpperCase();
        const cur = byTicker.get(key) ?? { ticker: key, name: p.symbol?.symbol?.description ?? p.symbol?.description ?? null, assetType: assetType(p.symbol?.symbol?.type?.code), shares: 0, costSum: 0 };
        cur.shares += units;
        cur.costSum += units * avg;
        byTicker.set(key, cur);
      }
    }
    const positions = [...byTicker.values()].filter((a) => a.shares > 0);

    // Ensure the synced portfolio exists.
    let portfolioId = conn.portfolio_id as string | null;
    if (portfolioId) {
      const { data: p } = await admin.from("portfolios").select("id").eq("id", portfolioId).eq("user_id", user.id).maybeSingle();
      if (!p) portfolioId = null;
    }
    if (!portfolioId) {
      const { data: created, error: cErr } = await admin.from("portfolios").insert({
        user_id: user.id, name: `${institution ?? "Brokerage"} (synced)`, account_type: "brokerage",
        description: "Read-only, synced from your connected brokerage via SnapTrade.",
        benchmark_symbol: "SPY", cash_balance: 0, status: "active", is_active: true,
      }).select("id").single();
      if (cErr || !created) throw new Error(cErr?.message ?? "Could not create the synced portfolio.");
      portfolioId = created.id;
    }

    // Reconcile holdings: update matches, insert new, delete the rest.
    const { data: existing } = await admin.from("holdings").select("id, ticker").eq("portfolio_id", portfolioId);
    const existingByTicker = new Map<string, string>();
    for (const h of existing ?? []) existingByTicker.set(String(h.ticker).toUpperCase(), h.id);

    const keep = new Set<string>();
    for (const a of positions) {
      keep.add(a.ticker);
      const avgCost = a.shares > 0 ? a.costSum / a.shares : 0;
      const id = existingByTicker.get(a.ticker);
      if (id) {
        await admin.from("holdings").update({ shares: a.shares, average_cost_basis: avgCost || null, company_name: a.name, asset_type: a.assetType }).eq("id", id);
      } else {
        await admin.from("holdings").insert({ portfolio_id: portfolioId, ticker: a.ticker, company_name: a.name, asset_type: a.assetType, shares: a.shares, average_cost_basis: avgCost || null });
      }
    }
    for (const [ticker, id] of existingByTicker) if (!keep.has(ticker)) await admin.from("holdings").delete().eq("id", id);

    await admin.from("portfolios").update({ cash_balance: Math.max(0, Math.round(cash * 100) / 100) }).eq("id", portfolioId);
    await admin.from("brokerage_connections").update({
      connected: true, portfolio_id: portfolioId, last_synced_at: new Date().toISOString(), last_error: null, updated_at: new Date().toISOString(),
    }).eq("user_id", user.id).eq("provider", "snaptrade");

    return NextResponse.json({ imported: positions.length, portfolioId });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Sync failed.";
    await admin.from("brokerage_connections").update({ last_error: msg.slice(0, 300), updated_at: new Date().toISOString() }).eq("user_id", user.id).eq("provider", "snaptrade").then((r) => r, () => ({}));
    return NextResponse.json({ error: msg.includes("brokerage_connections") ? "Run supabase/brokerage-connections.sql first." : msg }, { status: 500 });
  }
}
