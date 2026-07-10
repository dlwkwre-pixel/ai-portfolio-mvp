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
