import { createAdminClient } from "@/lib/supabase/admin";
import { syncPlaidIntoCashFlow } from "./plaid-cash-flow";
import { findDuplicateAccounts } from "./account-dedupe";

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
    // 90 days so a new connection fills the last few months of Cash Flow, not just one.
    transactions: { days_requested: 90 },
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

// /accounts/get returns the balances Plaid already has (refreshed with each transactions
// update) — fast and part of the base product. /accounts/balance/get forces a live call
// to the bank on every request: slow (seconds per Item) and billed separately, which a
// 10-Item refresh can't afford inside one request.
export async function getAccountBalances(accessToken: string): Promise<PlaidAccount[]> {
  const data = await plaidRequest<{ accounts: PlaidAccount[] }>("/accounts/get", {
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
  detailed?: string | null;  // personal_finance_category.detailed (e.g. TRANSFER_IN_ACCOUNT_TRANSFER); absent on older stored rows
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
  personal_finance_category?: { primary?: string | null; detailed?: string | null } | null;
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

// Plaid's /transactions/sync status: NOT_READY right after linking (history still being
// pulled from the bank — can take minutes), then INITIAL_UPDATE_COMPLETE (~30 days),
// then HISTORICAL_UPDATE_COMPLETE (everything requested).
export type TxnUpdateStatus = "NOT_READY" | "INITIAL_UPDATE_COMPLETE" | "HISTORICAL_UPDATE_COMPLETE" | "UNKNOWN";

export type ItemTxnSync = { changed: number; removed: string[]; status: TxnUpdateStatus };

// Incrementally sync one Item's transactions into ITS OWN rolling store (one KV key per
// Item, so several Items can sync in parallel without overwriting each other).
// Best-effort by design: throws only on unexpected shapes, and callers swallow.
export async function syncBankTransactions(userId: string, itemId: string, accessToken: string): Promise<ItemTxnSync> {
  let cursor = (await kvGet<{ cursor?: string }>(`plaidcursor:${itemId}`))?.cursor ?? undefined;
  const added: PlaidTxn[] = [];
  const modified: PlaidTxn[] = [];
  const removed: string[] = [];
  let status: TxnUpdateStatus = "UNKNOWN";

  for (let page = 0; page < 20; page++) {
    const res = await plaidRequest<{
      added: PlaidTxn[]; modified: PlaidTxn[]; removed: { transaction_id: string }[];
      next_cursor: string; has_more: boolean; transactions_update_status?: TxnUpdateStatus;
    }>("/transactions/sync", { access_token: accessToken, count: 250, ...(cursor ? { cursor } : {}) });
    added.push(...(res.added ?? []));
    modified.push(...(res.modified ?? []));
    removed.push(...(res.removed ?? []).map((r) => r.transaction_id));
    if (res.transactions_update_status) status = res.transactions_update_status;
    cursor = res.next_cursor;
    if (!res.has_more) break;
  }
  await kvSet(`plaidcursor:${itemId}`, { cursor });

  const storeKey = `plaidtxns:${userId}:${itemId}`;
  const store = (await kvGet<{ txns?: BankTransaction[] }>(storeKey))?.txns ?? [];
  const byId = new Map(store.map((t) => [t.id, t]));
  const normalize = (t: PlaidTxn): BankTransaction => ({
    id: t.transaction_id,
    date: (t.authorized_date || t.date || "").slice(0, 10),
    name: (t.merchant_name || t.name || "Transaction").slice(0, 80),
    merchant: t.merchant_name?.slice(0, 80) ?? null,
    amount: Math.round(Number(t.amount) * 100) / 100,
    category: t.personal_finance_category?.primary ?? null,
    detailed: t.personal_finance_category?.detailed ?? null,
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

  return { changed: added.length + modified.length, removed, status };
}

// Feed every linked Item's posted transactions into Cash Flow — once per user, after
// their Items have synced (dedupes against statement imports and duplicate accounts).
// Never throws: the bank card and balances matter more than this.
export async function syncUserCashFlow(userId: string, removedIds: string[]): Promise<number> {
  try {
    return await syncPlaidIntoCashFlow(userId, await getBankTransactions(userId), removedIds);
  } catch {
    return 0;
  }
}

// Transactions the user deleted from Cash Flow — remembered so the next sync doesn't
// quietly re-add them.
export async function dismissPlaidTransaction(userId: string, externalId: string): Promise<void> {
  const key = `plaiddismissed:${userId}`;
  const ids = (await kvGet<{ ids?: string[] }>(key))?.ids ?? [];
  if (!ids.includes(externalId)) await kvSet(key, { ids: [...ids, externalId].slice(-2000) });
}

export async function getDismissedPlaidIds(userId: string): Promise<Set<string>> {
  return new Set((await kvGet<{ ids?: string[] }>(`plaiddismissed:${userId}`))?.ids ?? []);
}

// All of a user's linked transactions: one store per Item, plus the older single per-user
// store (written before stores were split) so nothing synced earlier is lost.
export async function getBankTransactions(userId: string): Promise<BankTransaction[]> {
  let itemIds: string[] = [];
  try {
    const { data } = await createAdminClient().from("bank_connections").select("item_id").eq("user_id", userId);
    itemIds = (data ?? []).map((c) => c.item_id as string);
  } catch { /* table missing */ }
  const stores = await Promise.all([
    kvGet<{ txns?: BankTransaction[] }>(`plaidtxns:${userId}`),
    ...itemIds.map((id) => kvGet<{ txns?: BankTransaction[] }>(`plaidtxns:${userId}:${id}`)),
  ]);
  const live = new Set(itemIds);
  const byId = new Map<string, BankTransaction>();
  stores.forEach((s, i) => {
    for (const t of s?.txns ?? []) {
      // legacy store (i === 0): drop rows from Items that were unlinked since
      if (i === 0 && !live.has(t.itemId)) continue;
      byId.set(t.id, t);
    }
  });
  return [...byId.values()].sort((a, b) => b.date.localeCompare(a.date));
}

export type ConnectionSyncResult = { accounts: number; txn: ItemTxnSync | null };

// Pull balances for one connection into bank_accounts, then its transactions into the
// Item's store. Cash Flow is fed separately (syncUserCashFlow) once all Items are done.
// Throws on Plaid balance errors (caller records them).
export async function syncBankConnection(
  userId: string, itemId: string, accessToken: string,
): Promise<ConnectionSyncResult> {
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
  let txn: ItemTxnSync | null = null;
  try { txn = await syncBankTransactions(userId, itemId, accessToken); } catch { /* best-effort */ }

  return { accounts: accounts.length, txn };
}

// Sync several of one user's connections at a time (each is a few Plaid round-trips),
// then feed Cash Flow once. Used by the manual refresh and the daily cron.
export async function syncUserConnections(
  userId: string,
  conns: { item_id: string; access_token: string }[],
  onError: (itemId: string, message: string) => Promise<void>,
): Promise<{ synced: number; accounts: number; newTransactions: number; loading: number }> {
  let synced = 0, accounts = 0, loading = 0;
  const removed: string[] = [];
  const queue = [...conns];
  async function worker() {
    for (let c = queue.shift(); c; c = queue.shift()) {
      try {
        const r = await syncBankConnection(userId, c.item_id, c.access_token);
        synced++;
        accounts += r.accounts;
        if (r.txn) {
          removed.push(...r.txn.removed);
          if (r.txn.status === "NOT_READY") loading++;
        }
      } catch (e) {
        await onError(c.item_id, e instanceof Error ? e.message.slice(0, 300) : "sync failed");
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(4, conns.length) }, worker));
  const newTransactions = await syncUserCashFlow(userId, removed);
  return { synced, accounts, newTransactions, loading };
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
  official_name?: string | null;
  duplicate_of?: string | null; // set when the same account is already linked via another connection
};

export type BankStatus = {
  configured: boolean;
  connections: Array<{
    itemId: string; institution: string | null; lastSyncedAt: string | null; lastError: string | null;
    accountCount: number; duplicateCount: number; // duplicateCount === accountCount → safe to unlink
  }>;
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
      admin.from("bank_accounts").select("account_id, item_id, name, official_name, mask, type, subtype, balance_current, balance_available").eq("user_id", userId).order("name"),
    ]);
    const accounts = (accts ?? []) as BankAccountRow[];
    const dupOf = findDuplicateAccounts(accounts, new Map((conns ?? []).map((c) => [c.item_id as string, (c.last_synced_at as string | null) ?? null])));
    base.accounts = accounts.map((a) => ({ ...a, duplicate_of: dupOf.get(a.account_id) ?? null }));
    base.connections = (conns ?? []).map((c) => {
      const mine = base.accounts.filter((a) => a.item_id === c.item_id);
      return {
        itemId: c.item_id, institution: c.institution_name ?? null, lastSyncedAt: c.last_synced_at ?? null, lastError: c.last_error ?? null,
        accountCount: mine.length, duplicateCount: mine.filter((a) => a.duplicate_of).length,
      };
    });
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
      if (a.duplicate_of) continue;
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
