import { createAdminClient } from "@/lib/supabase/admin";
import { findDuplicateAccounts } from "@/lib/connections/account-dedupe";

// Bridges connected/manual bank balances into Planning's balance sheet as synthetic,
// read-only items (ids prefixed "linked:"). Read-time merge — no rows are copied into
// balance_sheet_items, so balances can never drift or duplicate: the sheet always shows
// what the last sync (or manual update) said. Every consumer of the merged item list
// (net worth, tax buckets, health score, forecasts, Atlas commentary) picks these up
// with zero special-casing.

export type LinkedBalanceItem = {
  id: string;             // "linked:{account_id}" — the UI treats this prefix as read-only
  user_id: string;
  label: string;
  category: string;       // planning categories: cash | investment | credit_card | personal_loan
  value: number;
  is_liability: boolean;
  sort_order: number;
  tax_treatment: "taxable" | null;
};

const CATEGORY_BY_TYPE: Record<string, { category: string; isLiability: boolean }> = {
  depository: { category: "cash", isLiability: false },
  investment: { category: "investment", isLiability: false },
  credit: { category: "credit_card", isLiability: true },
  loan: { category: "personal_loan", isLiability: true },
};

export async function getLinkedBalanceItems(userId: string): Promise<LinkedBalanceItem[]> {
  if (!userId) return [];
  try {
    const admin = createAdminClient();
    const [{ data }, { count: portfolioCount }, { data: conns }] = await Promise.all([
      admin.from("bank_accounts")
        .select("account_id, item_id, name, official_name, mask, type, subtype, balance_current")
        .eq("user_id", userId)
        .order("name"),
      admin.from("portfolios").select("id", { count: "exact", head: true })
        .eq("user_id", userId).eq("status", "active"),
      admin.from("bank_connections").select("item_id, last_synced_at").eq("user_id", userId),
    ]);
    // Same account linked through two connections → count it once.
    const dupOf = findDuplicateAccounts(data ?? [], new Map((conns ?? []).map((c) => [c.item_id as string, (c.last_synced_at as string | null) ?? null])));
    // Banks like Robinhood expose brokerage/IRA accounts through Plaid too. When the user
    // has portfolios, those are already counted (with holdings and the right tax bucket),
    // so a linked investment account would double-count net worth — skip it.
    const portfoliosCoverInvestments = (portfolioCount ?? 0) > 0;
    const out: LinkedBalanceItem[] = [];
    let i = 0;
    for (const a of data ?? []) {
      const bal = Number(a.balance_current ?? 0);
      if (!Number.isFinite(bal) || bal === 0) continue;
      if (portfoliosCoverInvestments && a.type === "investment" && a.item_id !== "manual") continue;
      if (dupOf.has(a.account_id)) continue;
      const map = CATEGORY_BY_TYPE[a.type as string] ?? CATEGORY_BY_TYPE.depository;
      out.push({
        id: `linked:${a.account_id}`,
        user_id: userId,
        label: `${a.name}${a.mask ? ` ··${a.mask}` : ""}${a.item_id === "manual" ? "" : " (linked)"}`,
        category: map.category,
        value: Math.abs(bal),
        is_liability: map.isLiability,
        sort_order: 9000 + i++,
        tax_treatment: map.isLiability ? null : "taxable",
      });
    }
    return out;
  } catch {
    return []; // table missing / not migrated → planning works exactly as before
  }
}
