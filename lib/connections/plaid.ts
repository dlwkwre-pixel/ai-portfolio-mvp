import { createAdminClient } from "@/lib/supabase/admin";

// Plaid bank connections (balances-first, read-only). Server-only: the access token
// never leaves the service-role tables, and everything is gated by the bank_connect
// feature flag at the route layer. REST via fetch — no SDK dependency.

const PLAID_ENVS: Record<string, string> = {
  sandbox: "https://sandbox.plaid.com",
  development: "https://development.plaid.com",
  production: "https://production.plaid.com",
};

export function plaidConfigured(): boolean {
  return !!(process.env.PLAID_CLIENT_ID && process.env.PLAID_SECRET);
}

function plaidBase(): string {
  const env = (process.env.PLAID_ENV || "production").toLowerCase();
  return PLAID_ENVS[env] ?? PLAID_ENVS.production;
}

async function plaidRequest<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${plaidBase()}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: process.env.PLAID_CLIENT_ID,
      secret: process.env.PLAID_SECRET,
      ...body,
    }),
    cache: "no-store",
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const code = (data as { error_code?: string } | null)?.error_code ?? res.status;
    throw new Error(`Plaid ${path} failed: ${code}`);
  }
  return data as T;
}

export async function createLinkToken(userId: string): Promise<string> {
  const data = await plaidRequest<{ link_token: string }>("/link/token/create", {
    client_name: "BuyTune",
    user: { client_user_id: userId },
    products: ["transactions"],
    transactions: { days_requested: 30 },
    country_codes: ["US"],
    language: "en",
  });
  return data.link_token;
}

export async function exchangePublicToken(publicToken: string): Promise<{ accessToken: string; itemId: string }> {
  const data = await plaidRequest<{ access_token: string; item_id: string }>("/item/public_token/exchange", {
    public_token: publicToken,
  });
  return { accessToken: data.access_token, itemId: data.item_id };
}

export type PlaidAccount = {
  account_id: string;
  name: string;
  official_name: string | null;
  mask: string | null;
  type: string;
  subtype: string | null;
  balances: { current: number | null; available: number | null; iso_currency_code: string | null };
};

export async function getAccountBalances(accessToken: string): Promise<PlaidAccount[]> {
  const data = await plaidRequest<{ accounts: PlaidAccount[] }>("/accounts/balance/get", {
    access_token: accessToken,
  });
  return data.accounts ?? [];
}

// ── Transactions (Phase 3: cash-flow awareness) ────────────────────────────────
// /transactions/sync with a per-Item cursor. Both the cursor and a rolling 120-day
// transaction store live in the chart_cache KV — no new tables/migrations needed, and
// the store rebuilds itself from Plaid if it's ever lost.

export type BankTransaction = {
  id: string;
  date: string;              // YYYY-MM-DD (authorized date when present)
  name: string;
  merchant: string | null;
  amount: number;            // Plaid convention: positive = money OUT, negative = money IN
  category: string | null;   // personal_finance_category.primary (e.g. FOOD_AND_DRINK)
  accountId: string;
  itemId: string;
  pending: boolean;
};

type PlaidTxn = {
  transaction_id: string;
  date: string;
  authorized_date?: string | null;
  name?: string | null;
  merchant_name?: string | null;
  amount: number;
  personal_finance_category?: { primary?: string | null } | null;
  account_id: string;
  pending?: boolean;
};

async function kvGet<T>(key: string): Promise<T | null> {
  try {
    const admin = createAdminClient();
    const { data } = await admin.from("chart_cache").select("result").eq("cache_key", key).maybeSingle();
    return (data?.result as T) ?? null;
  } catch { return null; }
}

async function kvSet(key: string, result: unknown): Promise<void> {
  try {
    const admin = createAdminClient();
    await admin.from("chart_cache").upsert({
      cache_key: key, result,
      expires_at: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: "cache_key" });
  } catch { /* non-fatal */ }
}

// Incrementally sync one Item's transactions into the user's rolling store.
// Best-effort by design: throws only on unexpected shapes, and callers swallow.
export async function syncBankTransactions(userId: string, itemId: string, accessToken: string): Promise<number> {
  let cursor = (await kvGet<{ cursor?: string }>(`plaidcursor:${itemId}`))?.cursor ?? undefined;
  const added: PlaidTxn[] = [];
  const modified: PlaidTxn[] = [];
  const removed: string[] = [];

  for (let page = 0; page < 20; page++) {
    const res = await plaidRequest<{
      added: PlaidTxn[]; modified: PlaidTxn[]; removed: { transaction_id: string }[];
      next_cursor: string; has_more: boolean;
    }>("/transactions/sync", { access_token: accessToken, count: 250, ...(cursor ? { cursor } : {}) });
    added.push(...(res.added ?? []));
    modified.push(...(res.modified ?? []));
    removed.push(...(res.removed ?? []).map((r) => r.transaction_id));
    cursor = res.next_cursor;
    if (!res.has_more) break;
  }
  await kvSet(`plaidcursor:${itemId}`, { cursor });

  const storeKey = `plaidtxns:${userId}`;
  const store = (await kvGet<{ txns?: BankTransaction[] }>(storeKey))?.txns ?? [];
  const byId = new Map(store.map((t) => [t.id, t]));
  const normalize = (t: PlaidTxn): BankTransaction => ({
    id: t.transaction_id,
    date: (t.authorized_date || t.date || "").slice(0, 10),
    name: (t.merchant_name || t.name || "Transaction").slice(0, 80),
    merchant: t.merchant_name?.slice(0, 80) ?? null,
    amount: Math.round(Number(t.amount) * 100) / 100,
    category: t.personal_finance_category?.primary ?? null,
    accountId: t.account_id,
    itemId,
    pending: !!t.pending,
  });
  for (const t of [...added, ...modified]) { const n = normalize(t); if (n.date) byId.set(n.id, n); }
  for (const id of removed) byId.delete(id);

  const cutoff = new Date(Date.now() - 120 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const txns = [...byId.values()]
    .filter((t) => t.date >= cutoff)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 800);
  await kvSet(storeKey, { txns });
  return added.length + modified.length;
}

export async function getBankTransactions(userId: string): Promise<BankTransaction[]> {
  return (await kvGet<{ txns?: BankTransaction[] }>(`plaidtxns:${userId}`))?.txns ?? [];
}

// Pull fresh balances for one connection and upsert them into bank_accounts.
// Returns the number of accounts updated. Throws on Plaid errors (caller records them).
export async function syncBankConnection(
  userId: string, itemId: string, accessToken: string,
): Promise<number> {
  const admin = createAdminClient();
  const accounts = await getAccountBalances(accessToken);
  for (const a of accounts) {
    await admin.from("bank_accounts").upsert({
      user_id: userId,
      item_id: itemId,
      account_id: a.account_id,
      name: a.name,
      official_name: a.official_name,
      mask: a.mask,
      type: a.type,
      subtype: a.subtype,
      balance_current: a.balances?.current ?? null,
      balance_available: a.balances?.available ?? null,
      iso_currency: a.balances?.iso_currency_code ?? "USD",
      updated_at: new Date().toISOString(),
    }, { onConflict: "account_id" }).then((r) => r, () => ({}));
  }
  await admin.from("bank_connections")
    .update({ last_synced_at: new Date().toISOString(), last_error: null, updated_at: new Date().toISOString() })
    .eq("user_id", userId).eq("item_id", itemId).then((r) => r, () => ({}));

  // Transactions ride along with every balance sync (exchange, manual refresh, daily
  // cron) — incremental via cursor, so repeat syncs are cheap. Never fails the sync.
  try { await syncBankTransactions(userId, itemId, accessToken); } catch { /* best-effort */ }

  return accounts.length;
}

// Revoke a Plaid Item (used by account deletion — removes our access at Plaid's side,
// and on the Trial frees the Item slot). Best-effort; throws on hard failures.
export async function removePlaidItem(accessToken: string): Promise<void> {
  await plaidRequest("/item/remove", { access_token: accessToken });
}

export type BankAccountRow = {
  account_id: string;
  item_id: string;
  name: string;
  mask: string | null;
  type: string;
  subtype: string | null;
  balance_current: number | null;
  balance_available: number | null;
};

export type BankStatus = {
  configured: boolean;
  connections: Array<{ itemId: string; institution: string | null; lastSyncedAt: string | null; lastError: string | null }>;
  accounts: BankAccountRow[];
};

// User-safe status (never includes tokens). Empty on any failure / missing tables.
export async function getBankStatus(userId: string): Promise<BankStatus> {
  const base: BankStatus = { configured: plaidConfigured(), connections: [], accounts: [] };
  if (!userId) return base;
  try {
    const admin = createAdminClient();
    const [{ data: conns }, { data: accts }] = await Promise.all([
      admin.from("bank_connections").select("item_id, institution_name, last_synced_at, last_error").eq("user_id", userId),
      admin.from("bank_accounts").select("account_id, item_id, name, mask, type, subtype, balance_current, balance_available").eq("user_id", userId).order("name"),
    ]);
    base.connections = (conns ?? []).map((c) => ({
      itemId: c.item_id, institution: c.institution_name ?? null, lastSyncedAt: c.last_synced_at ?? null, lastError: c.last_error ?? null,
    }));
    base.accounts = (accts ?? []) as BankAccountRow[];
  } catch { /* tables may not exist yet */ }
  return base;
}

// Net bank worth for planning/net-worth surfaces: depository/investment assets positive,
// credit/loan balances negative. Zero on any failure (fail quiet, additive feature).
export async function getBankTotals(userId: string): Promise<{ assets: number; liabilities: number; net: number }> {
  const zero = { assets: 0, liabilities: 0, net: 0 };
  try {
    const { accounts } = await getBankStatus(userId);
    let assets = 0, liabilities = 0;
    for (const a of accounts) {
      const bal = Number(a.balance_current ?? 0);
      if (!Number.isFinite(bal)) continue;
      if (a.type === "credit" || a.type === "loan") liabilities += bal;
      else assets += bal;
    }
    return { assets: Math.round(assets * 100) / 100, liabilities: Math.round(liabilities * 100) / 100, net: Math.round((assets - liabilities) * 100) / 100 };
  } catch {
    return zero;
  }
}
