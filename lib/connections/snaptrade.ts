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
