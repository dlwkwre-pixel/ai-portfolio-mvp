// Same bank account linked through two Plaid connections (re-linking a bank, or linking a
// bank and its card separately) shows up as two bank_accounts rows with different
// account_ids. Counting both doubles net worth and Cash Flow, so every consumer collapses
// them: one copy per real account, preferring the connection that synced most recently.

export type DedupeAccount = {
  account_id: string;
  item_id: string;
  name: string;
  official_name?: string | null;
  mask: string | null;
  type: string;
  subtype?: string | null;
};

function norm(s: string | null | undefined): string {
  return (s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

// Accounts without a mask can only be matched on name + type, which is weaker, but still
// safe in practice: two different accounts at one bank rarely share an exact name.
export function accountIdentity(a: DedupeAccount): string {
  return a.mask
    ? `${a.type}|${a.subtype ?? ""}|${a.mask}|${norm(a.name)}`
    : `${a.type}|${a.subtype ?? ""}|nomask|${norm(a.official_name || a.name)}`;
}

// Returns account_id → the account_id it duplicates (only for the dropped copies).
// Manual accounts (item_id "manual") are never collapsed — the user typed those on purpose.
export function findDuplicateAccounts<T extends DedupeAccount>(
  accounts: T[],
  lastSyncedByItem: Map<string, string | null>,
): Map<string, string> {
  const groups = new Map<string, T[]>();
  for (const a of accounts) {
    if (a.item_id === "manual") continue;
    const key = accountIdentity(a);
    groups.set(key, [...(groups.get(key) ?? []), a]);
  }
  const dupOf = new Map<string, string>();
  for (const list of groups.values()) {
    if (list.length < 2) continue;
    const sorted = list.slice().sort((x, y) =>
      (lastSyncedByItem.get(y.item_id) ?? "").localeCompare(lastSyncedByItem.get(x.item_id) ?? ""));
    const keep = sorted[0];
    for (const a of sorted.slice(1)) dupOf.set(a.account_id, keep.account_id);
  }
  return dupOf;
}
