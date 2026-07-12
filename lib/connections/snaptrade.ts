import { Snaptrade } from "snaptrade-typescript-sdk";
import { createAdminClient } from "@/lib/supabase/admin";

// SnapTrade read-only brokerage sync (Robinhood + others). The SDK talks to the
// live SnapTrade API; everything here is server-only and gated by feature access.

export function snaptradeConfigured(): boolean {
  return !!(process.env.SNAPTRADE_CLIENT_ID && process.env.SNAPTRADE_CONSUMER_KEY);
}

export function getSnaptrade(): Snaptrade | null {
  if (!snaptradeConfigured()) return null;
  return new Snaptrade({
    clientId: process.env.SNAPTRADE_CLIENT_ID!,
    consumerKey: process.env.SNAPTRADE_CONSUMER_KEY!,
  });
}

export type BrokerageConnectionRow = {
  user_id: string;
  provider: string;
  snaptrade_user_id: string | null;
  snaptrade_user_secret: string | null;
  connected: boolean;
  portfolio_id: string | null;
  last_synced_at: string | null;
  last_error: string | null;
};

// Status a user may safely see (never includes the secret).
export type ConnectionStatus = {
  configured: boolean;
  connected: boolean;
  portfolioId: string | null;
  lastSyncedAt: string | null;
  lastError: string | null;
};

export async function getBrokerageStatus(userId: string): Promise<ConnectionStatus> {
  const base: ConnectionStatus = {
    configured: snaptradeConfigured(), connected: false, portfolioId: null, lastSyncedAt: null, lastError: null,
  };
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("brokerage_connections")
      .select("connected, portfolio_id, last_synced_at, last_error")
      .eq("user_id", userId).eq("provider", "snaptrade").maybeSingle();
    if (data) {
      base.connected = !!data.connected;
      base.portfolioId = data.portfolio_id ?? null;
      base.lastSyncedAt = data.last_synced_at ?? null;
      base.lastError = data.last_error ?? null;
    }
  } catch { /* table may not exist yet */ }
  return base;
}

// Full row incl. secret — server/route use only.
export async function getBrokerageRow(userId: string): Promise<BrokerageConnectionRow | null> {
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("brokerage_connections").select("*").eq("user_id", userId).eq("provider", "snaptrade").maybeSingle();
    return (data as BrokerageConnectionRow) ?? null;
  } catch {
    return null;
  }
}

export type SnapAccount = { id: string; label: string };
export type BrokeragePosition = {
  ticker: string; name: string | null; shares: number; avgCost: number | null; price: number | null; value: number; assetType: string;
};

function mapAssetType(code: string | undefined | null): string {
  const c = (code ?? "").toLowerCase();
  if (c.includes("crypto")) return "crypto";
  if (c === "et" || c.includes("etf")) return "etf";
  return "stock";
}

// The user's linked brokerage accounts.
export async function fetchAccounts(
  st: Snaptrade, creds: { userId: string; userSecret: string },
): Promise<SnapAccount[]> {
  const res = await st.accountInformation.listUserAccounts(creds);
  return (res.data ?? []).map((a) => {
    const acc = a as { id?: string; name?: string; institution_name?: string; number?: string };
    const name = (acc.name ?? "").trim();
    const inst = (acc.institution_name ?? "").trim();
    // Avoid "Robinhood · Robinhood Individual" — if the account name already leads with
    // the institution, just use the name.
    const label = name && inst && name.toLowerCase().startsWith(inst.toLowerCase())
      ? name
      : [inst, name].filter(Boolean).join(" · ") || name || acc.number || "Account";
    return { id: acc.id ?? "", label };
  }).filter((a) => a.id);
}

// Cash balance for one account (sum of currency balances). Non-fatal on failure.
export async function fetchAccountCash(
  st: Snaptrade, creds: { userId: string; userSecret: string }, accountId: string,
): Promise<number> {
  try {
    const res = await st.accountInformation.getUserAccountBalance({ ...creds, accountId });
    let cash = 0;
    for (const b of (res.data ?? []) as Array<{ cash?: number | null }>) cash += Number(b?.cash ?? 0) || 0;
    return Math.round(cash * 100) / 100;
  } catch {
    return 0;
  }
}

export type ValuePoint = { date: string; value: number };

// The broker's actual account VALUE history (getAccountBalanceHistory → history[]).
// This is the real value over time (not a performance index), so it drives a linked
// portfolio's chart accurately. Non-fatal → empty on failure.
export async function fetchAccountValueHistory(
  st: Snaptrade, creds: { userId: string; userSecret: string }, accountId: string,
): Promise<ValuePoint[]> {
  try {
    const res = await st.accountInformation.getAccountBalanceHistory({ userId: creds.userId, userSecret: creds.userSecret, accountId });
    const hist = ((res.data as { history?: Array<{ date?: string; total_value?: string | number | null }> })?.history ?? []);
    return hist
      .filter((h) => h.date && h.total_value != null)
      .map((h) => ({ date: String(h.date).slice(0, 10), value: Number(h.total_value) }))
      .filter((p) => Number.isFinite(p.value) && p.value > 0);
  } catch {
    return [];
  }
}

// The broker's OWN computed return % for the account (getUserAccountReturnRates).
// Prefers the all-time figure, falling back to the longest available window. This is
// the authoritative return we display for a linked portfolio. Non-fatal → null.
export async function fetchAccountReturnRate(
  st: Snaptrade, creds: { userId: string; userSecret: string }, accountId: string,
): Promise<number | null> {
  try {
    const res = await st.accountInformation.getUserAccountReturnRates({ userId: creds.userId, userSecret: creds.userSecret, accountId });
    const rows = ((res.data as { data?: Array<{ timeframe?: string; return_percent?: number | null }> })?.data ?? []);
    const byTf: Record<string, number> = {};
    for (const r of rows) if (r.timeframe && typeof r.return_percent === "number") byTf[r.timeframe.toUpperCase()] = r.return_percent;
    for (const tf of ["ALL", "1Y", "YTD", "6M", "3M", "1M", "1W", "1D"]) if (byTf[tf] != null) return byTf[tf];
    return null;
  } catch {
    return null;
  }
}

export type BrokerageActivity = {
  id: string; type: string; ticker: string | null; name: string | null;
  units: number; price: number; amount: number; fee: number; date: string | null;
};

// Transaction/activity history for one account (buys, sells, dividends, deposits,
// withdrawals, fees). Non-fatal → empty on failure.
export async function fetchAccountActivities(
  st: Snaptrade, creds: { userId: string; userSecret: string }, accountId: string, limit = 500,
): Promise<BrokerageActivity[]> {
  try {
    const res = await st.accountInformation.getAccountActivities({ ...creds, accountId, limit });
    const data = ((res.data as { data?: unknown[] })?.data ?? []) as Array<{
      id?: string; type?: string; symbol?: { symbol?: string; description?: string | null };
      units?: number | null; price?: number | null; amount?: number | null; fee?: number | null;
      trade_date?: string | null; settlement_date?: string | null;
    }>;
    const out: BrokerageActivity[] = [];
    for (const a of data) {
      if (!a.id) continue;
      out.push({
        id: a.id,
        type: (a.type ?? "").toString(),
        ticker: a.symbol?.symbol ? String(a.symbol.symbol).toUpperCase() : null,
        name: a.symbol?.description ?? null,
        units: Number(a.units ?? 0) || 0,
        price: Number(a.price ?? 0) || 0,
        amount: Number(a.amount ?? 0) || 0,
        fee: Number(a.fee ?? 0) || 0,
        date: a.trade_date ?? a.settlement_date ?? null,
      });
    }
    return out;
  } catch {
    return [];
  }
}

// Portfolio ids that are fed by a linked brokerage account (= mirrors). A single account
// can feed several portfolios (a taxable account split by holding period), so this is the
// union of the recorded default targets AND any portfolio that holds broker-sourced
// positions (holdings.brokerage_account_id). Manual editing is locked on these and sync is
// the source of truth. Empty set on any failure, so nothing changes for users without a
// connection.
export async function getLinkedPortfolioIds(userId: string): Promise<Set<string>> {
  if (!userId) return new Set();
  const out = new Set<string>();
  const admin = createAdminClient();
  try {
    const { data } = await admin.from("brokerage_account_links").select("default_portfolio_id").eq("user_id", userId);
    for (const r of data ?? []) if (r.default_portfolio_id) out.add(r.default_portfolio_id);
  } catch { /* table may not exist */ }
  try {
    const { data: pf } = await admin.from("portfolios").select("id").eq("user_id", userId);
    const ids = (pf ?? []).map((p) => p.id);
    if (ids.length > 0) {
      const { data: h } = await admin.from("holdings").select("portfolio_id").in("portfolio_id", ids).not("brokerage_account_id", "is", null);
      for (const r of h ?? []) if (r.portfolio_id) out.add(r.portfolio_id);
    }
  } catch { /* column may not exist yet */ }
  return out;
}

// Return-health metrics the sync stores with the chart rebuild — used for the linked
// badge's confidence tooltip ("Return method: … · price coverage …% · verified …").
// Null on any failure or before the first v8 rebuild.
export type LinkedReturnHealth = {
  method: string | null;
  coverage: number | null;
  pricedCoverage: number | null;
  verifiedAt: string | null;
};

export async function getLinkedReturnHealth(portfolioId: string): Promise<LinkedReturnHealth | null> {
  if (!portfolioId) return null;
  try {
    const admin = createAdminClient();
    const { data } = await admin.from("chart_cache").select("result").eq("cache_key", `benchmirror:${portfolioId}`).maybeSingle();
    const health = (data?.result as { health?: LinkedReturnHealth } | null)?.health;
    return health ?? null;
  } catch {
    return null;
  }
}

// Is this specific portfolio a linked mirror? Used by the mutation actions to block
// manual edits and by the page to show the linked UI. True if it's a recorded default
// target OR holds any broker-sourced position. Returns false on any failure (fail open).
export async function isPortfolioLinked(portfolioId: string): Promise<boolean> {
  if (!portfolioId) return false;
  const admin = createAdminClient();
  try {
    const { data } = await admin.from("holdings").select("id").eq("portfolio_id", portfolioId).not("brokerage_account_id", "is", null).limit(1).maybeSingle();
    if (data) return true;
  } catch { /* column may not exist yet */ }
  try {
    const { data } = await admin.from("brokerage_account_links").select("id").eq("default_portfolio_id", portfolioId).limit(1).maybeSingle();
    return !!data;
  } catch {
    return false;
  }
}

// Normalized positions for one account (getUserHoldings is deprecated → per-account positions).
export async function fetchAccountPositions(
  st: Snaptrade, creds: { userId: string; userSecret: string }, accountId: string,
): Promise<BrokeragePosition[]> {
  const res = await st.accountInformation.getUserAccountPositions({ ...creds, accountId });
  const list = (res.data ?? []) as Array<{
    symbol?: { symbol?: { symbol?: string; description?: string | null; type?: { code?: string } }; description?: string };
    units?: number | null; fractional_units?: number | null; price?: number | null; average_purchase_price?: number | null;
  }>;
  const out: BrokeragePosition[] = [];
  for (const p of list) {
    const ticker = p.symbol?.symbol?.symbol;
    if (!ticker) continue;
    const shares = Number(p.units ?? p.fractional_units ?? 0) || 0;
    if (shares === 0) continue;
    const price = p.price != null ? Number(p.price) : null;
    out.push({
      ticker: ticker.toUpperCase(),
      name: p.symbol?.symbol?.description ?? p.symbol?.description ?? null,
      shares,
      avgCost: p.average_purchase_price != null ? Number(p.average_purchase_price) : null,
      price,
      value: price != null ? Math.round(price * shares * 100) / 100 : 0,
      assetType: mapAssetType(p.symbol?.symbol?.type?.code),
    });
  }
  return out;
}
