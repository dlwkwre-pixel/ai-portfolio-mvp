import { createAdminClient } from "@/lib/supabase/admin";
import type { BankTransaction } from "./plaid";
import { getDismissedPlaidIds, getSeenTransferIds, markTransfersSeen } from "./plaid";
import { findDuplicateAccounts } from "./account-dedupe";
import {
  cleanMerchant, findDuplicates, suggestBucket, looksLikeSave, looksLikeTransfer, looksLikeRefund,
  type CashFlowTransaction, type MerchantRule, type ParsedTxn, type TxnKind,
} from "@/lib/planning/transactions";
import { getCategoryForExpense } from "@/lib/planning/expense-categories";

// Linked-bank transactions → Cash Flow. Runs after every Plaid sync (connect, refresh,
// daily cron) with the service-role client, always scoped by user_id.
//
// Rules:
// - Posted transactions only; pending ones arrive again (with a new id) once they post.
// - Upserted by Plaid's transaction_id (external_id), so the user's bucket choice survives
//   later syncs and Plaid's own edits/removals are applied.
// - Skipped when the same transaction already exists from a statement import or a manual
//   entry (incl. one-tap "Paid" bills), so connecting a bank never double counts.
// - Transactions the user deleted stay deleted (dismissed list).

// Plaid detailed categories that are money moving between the user's OWN accounts.
const OWN_ACCOUNT_DETAILED = new Set([
  "TRANSFER_IN_ACCOUNT_TRANSFER", "TRANSFER_OUT_ACCOUNT_TRANSFER",
  "TRANSFER_IN_CASH_ADVANCES_AND_LOANS", "LOAN_PAYMENTS_CREDIT_CARD_PAYMENT",
]);
const SAVE_DETAILED = new Set(["TRANSFER_OUT_SAVINGS", "TRANSFER_OUT_INVESTMENT_AND_RETIREMENT_FUNDS"]);
const FROM_SAVINGS_DETAILED = new Set(["TRANSFER_IN_SAVINGS", "TRANSFER_IN_INVESTMENT_AND_RETIREMENT_FUNDS"]);

const PFC_DETAILED_CATEGORY: Record<string, string> = {
  RENT_AND_UTILITIES_RENT: "Housing",
  LOAN_PAYMENTS_MORTGAGE_PAYMENT: "Housing",
  LOAN_PAYMENTS_CAR_PAYMENT: "Transportation",
  PERSONAL_CARE_GYMS_AND_FITNESS_CENTERS: "Fitness",
  GENERAL_SERVICES_INSURANCE: "Insurance",
  GENERAL_SERVICES_CHILDCARE: "Childcare",
  ENTERTAINMENT_TV_AND_MOVIES: "Entertainment",
};
const PFC_PRIMARY_CATEGORY: Record<string, string> = {
  FOOD_AND_DRINK: "Food & Dining",
  TRANSPORTATION: "Transportation",
  TRAVEL: "Travel",
  ENTERTAINMENT: "Entertainment",
  MEDICAL: "Healthcare",
  HOME_IMPROVEMENT: "Housing",
  RENT_AND_UTILITIES: "Utilities",
};

export function classifyBankTransaction(t: BankTransaction): { kind: TxnKind; category?: string } {
  const text = `${t.merchant ?? ""} ${t.name}`;
  const out = t.amount > 0; // Plaid: positive = money out
  const detailed = t.detailed ?? "";
  const primary = t.category ?? "";

  // Card payments / own-account moves first: "ROBINHOOD CARD PAYMENT" must not read as investing.
  if (OWN_ACCOUNT_DETAILED.has(detailed)) return { kind: "transfer" };
  if (SAVE_DETAILED.has(detailed) || (out && looksLikeSave(text))) return { kind: out ? "save" : "transfer" };
  if (FROM_SAVINGS_DETAILED.has(detailed) || (!out && looksLikeSave(text))) return { kind: "transfer" };
  if (looksLikeTransfer(text)) return { kind: "transfer" };
  // Older stored rows have no detailed category: a bare TRANSFER_* with nothing else to go
  // on is treated as moving money between accounts rather than guessed as income/spending.
  if (!detailed && (primary === "TRANSFER_IN" || primary === "TRANSFER_OUT")) return { kind: "transfer" };

  if (!out) {
    // Money in that isn't a transfer: pay, a Zelle from a buyer, or a merchant refund.
    const isRefund = primary !== "INCOME" && !primary.startsWith("TRANSFER_IN") && (looksLikeRefund(text) || !!PFC_PRIMARY_CATEGORY[primary] || primary === "GENERAL_MERCHANDISE");
    return isRefund ? { kind: "refund", category: categoryFor(t) } : { kind: "income" };
  }
  return { kind: "spend", category: categoryFor(t) };
}

function categoryFor(t: BankTransaction): string {
  const byKeyword = getCategoryForExpense(t.merchant ?? t.name);
  if (byKeyword !== "Other") return byKeyword;
  return PFC_DETAILED_CATEGORY[t.detailed ?? ""] ?? PFC_PRIMARY_CATEGORY[t.category ?? ""] ?? "Other";
}

export type FoundTransfer = { merchant: string; amount: number; date: string };
export type CashFlowSyncResult = { inserted: number; transfers: FoundTransfer[] };

export async function syncPlaidIntoCashFlow(userId: string, store: BankTransaction[], removedIds: string[]): Promise<CashFlowSyncResult> {
  const admin = createAdminClient();

  if (removedIds.length > 0) {
    const withSynthetic = removedIds.flatMap((id) => [id, `tosavings:${id}`, `fromsavings:${id}`]);
    for (let i = 0; i < withSynthetic.length; i += 200) {
      await admin.from("cash_flow_transactions").delete()
        .eq("user_id", userId).eq("source", "plaid").in("external_id", withSynthetic.slice(i, i + 200));
    }
  }

  const [{ data: accts }, { data: conns }, dismissed] = await Promise.all([
    admin.from("bank_accounts").select("account_id, item_id, name, official_name, mask, type, subtype").eq("user_id", userId),
    admin.from("bank_connections").select("item_id, last_synced_at").eq("user_id", userId),
    getDismissedPlaidIds(userId),
  ]);
  // Brokerage and loan accounts: their activity isn't spending (and SnapTrade covers holdings).
  const skipAccounts = new Set((accts ?? []).filter((a) => a.type === "investment" || a.type === "loan").map((a) => a.account_id));
  // The same account linked through two connections: keep one copy's transactions, and
  // remove any rows the other copy already added (they'd double the month).
  const dupOf = findDuplicateAccounts(accts ?? [], new Map((conns ?? []).map((c) => [c.item_id as string, (c.last_synced_at as string | null) ?? null])));
  for (const id of dupOf.keys()) skipAccounts.add(id);
  const dupTxnIds = store.filter((t) => dupOf.has(t.accountId)).map((t) => t.id);
  for (let i = 0; i < dupTxnIds.length; i += 200) {
    await admin.from("cash_flow_transactions").delete()
      .eq("user_id", userId).eq("source", "plaid").in("external_id", dupTxnIds.slice(i, i + 200));
  }
  const posted = store.filter((t) => !t.pending && t.amount !== 0 && t.date && !skipAccounts.has(t.accountId) && !dismissed.has(t.id));
  if (posted.length === 0) return { inserted: 0, transfers: [] };

  const minDate = posted.reduce((m, t) => (t.date < m ? t.date : m), posted[0].date);
  const [{ data: existingRows, error: exErr }, { data: items }, { data: rules }] = await Promise.all([
    admin.from("cash_flow_transactions")
      .select("id, txn_date, period_year, period_month, description, merchant, amount, direction, cash_flow_item_id, source, import_batch_id, note, external_id")
      .eq("user_id", userId).gte("txn_date", minDate),
    admin.from("cash_flow_items").select("id, label, type, category, amount").eq("user_id", userId),
    admin.from("cash_flow_merchant_rules").select("merchant_key, cash_flow_item_id").eq("user_id", userId),
  ]);
  if (exErr) { // e.g. external_id column not added yet — try again next sync
    console.error("[plaid-cash-flow] reading existing transactions failed:", exErr.code, exErr.message);
    return { inserted: 0, transfers: [] };
  }

  type Row = CashFlowTransaction & { external_id: string | null };
  const existing = (existingRows ?? []).map((r) => ({ ...r, amount: Number(r.amount) }) as Row);
  const byExternal = new Map(existing.filter((r) => r.external_id).map((r) => [r.external_id as string, r]));
  const others = existing.filter((r) => r.source !== "plaid");
  const bucketItems = (items ?? []).map((i) => ({ ...i, amount: Number(i.amount) })) as { id: string; label: string; type: "income" | "expense"; category: string | null; amount: number }[];
  const ruleList = (rules ?? []) as MerchantRule[];

  // Classify, then catch money moving between two of the user's OWN linked accounts
  // (Zelle from Chase to Robinhood savings): it appears as an outflow on one account and
  // an inflow of the same amount on another a day or two later. The inflow isn't income;
  // the outflow is a save when it landed in savings/investments, else a plain transfer.
  const subtypeOf = new Map((accts ?? []).map((a) => [a.account_id as string, String(a.subtype ?? a.type ?? "")]));
  const classified = new Map(posted.map((t) => [t.id, classifyBankTransaction(t)]));
  const MOVE_RE = /zelle|transfer|xfer|venmo|cash\s*app|ach|deposit|payment (from|to)|online/i;
  const usedOut = new Set<string>();
  const destOf = new Map<string, string>(); // paired outflow id → account the money landed in
  const pairedInflows: BankTransaction[] = [];
  const dayDiff = (a: string, b: string) => Math.abs(new Date(`${a}T00:00:00Z`).getTime() - new Date(`${b}T00:00:00Z`).getTime()) / 86_400_000;
  for (const inflow of posted) {
    const c = classified.get(inflow.id)!;
    if (inflow.amount >= 0 || c.kind !== "income" || inflow.detailed === "INCOME_WAGES") continue;
    // Looks like money arriving from somewhere (not a purchase refund or a paycheck): a
    // transfer-ish description, "From <bank>", or Plaid calling it a transfer/deposit. The
    // exact-amount outflow on ANOTHER linked account (below) is what confirms it — e.g.
    // Chase "Robinhood −$825.95" + Robinhood savings "From Chase +$825.95" the same day.
    const inText = `${inflow.merchant ?? ""} ${inflow.name}`;
    if (!MOVE_RE.test(inText) && !/^\s*from\s/i.test(inText) && !(inflow.detailed ?? "").startsWith("TRANSFER_IN")) continue;
    const outflow = posted.find((o) => o.amount > 0 && !usedOut.has(o.id) && o.accountId !== inflow.accountId
      && Math.abs(o.amount + inflow.amount) < 0.005 && dayDiff(o.date, inflow.date) <= 4
      && (["save", "transfer"].includes(classified.get(o.id)!.kind) || MOVE_RE.test(`${o.merchant ?? ""} ${o.name}`)));
    if (!outflow) continue;
    usedOut.add(outflow.id);
    destOf.set(outflow.id, inflow.accountId);
    classified.set(inflow.id, { kind: "transfer" });
    pairedInflows.push(inflow);
    const destination = subtypeOf.get(inflow.accountId) ?? "";
    if (classified.get(outflow.id)!.kind === "spend") {
      classified.set(outflow.id, { kind: /saving|money market|cd|investment|brokerage|ira/i.test(destination) ? "save" : "transfer" });
    }
  }

  // ── Net savings ──────────────────────────────────────────────────────────────
  // "Saved" should be money that ENTERED savings/investing minus money that LEFT it for
  // spending, not every move that touches a savings account:
  //  - savings → brokerage/another savings: already-saved money changing buckets → neutral
  //    (counting it as a save double counted it: "To Brokerage" from Robinhood savings)
  //  - savings → checking (or any transfer out): money coming back out → negative save
  //  - spending straight from savings (rent paid from savings): stays spending, plus a
  //    negative save row so "saved" isn't overstated
  //  - income landing in savings (paycheck split to savings, interest): stays income, plus a
  //    positive save row — it was saved without passing through checking
  // Checking → savings stays a save, as before. Brokerage accounts themselves are skipped.
  const SAVINGS_SUBTYPE = /saving|money market|\bcd\b|hsa|cash management/i;
  const acctById = new Map((accts ?? []).map((a) => [a.account_id as string, a]));
  const isSavingsAcct = (id: string) => {
    const a = acctById.get(id);
    return !!a && a.type === "depository" && SAVINGS_SUBTYPE.test(String(a.subtype ?? ""));
  };
  const negativeSave = new Set<string>();
  const synthetic: { id: string; t: BankTransaction; amount: number; merchant: string }[] = [];
  for (const t of posted) {
    if (!isSavingsAcct(t.accountId)) continue;
    const c = classified.get(t.id)!;
    const label = (t.merchant || cleanMerchant(t.name)).slice(0, 40);
    if (t.amount > 0) { // money out of savings
      // Where it went: the matched inflow's account when we paired it, else Plaid's category
      // or the description (not the bare word "savings" — "Transfer from Savings" names the source).
      const dest = destOf.get(t.id);
      const toSavingsOrInvesting = dest
        ? isSavingsAcct(dest) || acctById.get(dest)?.type === "investment"
        : SAVE_DETAILED.has(t.detailed ?? "") || /brokerage|invest|\bira\b|roth/i.test(`${t.merchant ?? ""} ${t.name}`);
      if (c.kind === "save" || (c.kind === "transfer" && toSavingsOrInvesting)) {
        classified.set(t.id, { kind: "transfer" });
      } else if (c.kind === "transfer") {
        classified.set(t.id, { kind: "save" });
        negativeSave.add(t.id);
      } else if (c.kind === "spend") {
        synthetic.push({ id: `fromsavings:${t.id}`, t, amount: -Math.abs(t.amount), merchant: `Paid from savings: ${label}` });
      }
    } else if (c.kind === "income") { // money landing in savings from outside
      synthetic.push({ id: `tosavings:${t.id}`, t, amount: Math.abs(t.amount), merchant: `Went straight to savings: ${label}` });
    }
  }

  // Tell the user about transfers the first time they're found, not on every sync.
  const seen = await getSeenTransferIds(userId);
  const fresh = pairedInflows.filter((t) => !seen.has(t.id));
  const transfers: FoundTransfer[] = fresh.map((t) => ({ merchant: (t.merchant || cleanMerchant(t.name)).slice(0, 60), amount: Math.abs(t.amount), date: t.date }));
  if (fresh.length > 0) await markTransfersSeen(userId, fresh.map((t) => t.id));

  // Update rows we already have (incl. ones whose classification changed); collect the rest.
  const candidates: { t: BankTransaction; parsed: ParsedTxn }[] = [];
  for (const t of posted) {
    const { kind, category } = classified.get(t.id)!;
    const amount = Math.abs(t.amount);
    const have = byExternal.get(t.id);
    if (have) {
      if (kind === "transfer") {
        // Now known to be a move between the user's own accounts — not income/spending.
        await admin.from("cash_flow_transactions").delete().eq("id", have.id).eq("user_id", userId);
        continue;
      }
      const signed = kind === "refund" || negativeSave.has(t.id) ? -amount : amount;
      const direction = kind === "income" ? "in" : kind === "save" ? "save" : "out";
      if (have.txn_date !== t.date || Math.abs(have.amount - signed) >= 0.005 || have.direction !== direction) {
        await admin.from("cash_flow_transactions")
          .update({
            txn_date: t.date, period_year: Number(t.date.slice(0, 4)), period_month: Number(t.date.slice(5, 7)), amount: signed,
            ...(have.direction !== direction ? { direction, cash_flow_item_id: null } : {}),
            updated_at: new Date().toISOString(),
          })
          .eq("id", have.id).eq("user_id", userId);
      }
      continue;
    }
    if (kind === "transfer") continue;
    const merchant = (t.merchant || cleanMerchant(t.name)).slice(0, 60);
    candidates.push({ t, parsed: { date: t.date, description: t.name.slice(0, 200), merchant, amount, kind, category } });
  }
  // Synthetic savings rows (see Net savings above): create/update by their own external id,
  // and drop ones whose underlying transaction no longer qualifies.
  const now = new Date().toISOString();
  const syntheticRecords: Record<string, unknown>[] = [];
  const wanted = new Set(synthetic.map((s) => s.id));
  for (const s of synthetic) {
    const have = byExternal.get(s.id);
    if (have) {
      if (have.txn_date !== s.t.date || Math.abs(have.amount - s.amount) >= 0.005) {
        await admin.from("cash_flow_transactions")
          .update({ txn_date: s.t.date, period_year: Number(s.t.date.slice(0, 4)), period_month: Number(s.t.date.slice(5, 7)), amount: s.amount, updated_at: now })
          .eq("id", have.id).eq("user_id", userId);
      }
      continue;
    }
    syntheticRecords.push({
      user_id: userId, txn_date: s.t.date, period_year: Number(s.t.date.slice(0, 4)), period_month: Number(s.t.date.slice(5, 7)),
      description: s.merchant, merchant: s.merchant.slice(0, 60), amount: s.amount, direction: "save",
      cash_flow_item_id: null, source: "plaid", external_id: s.id, reviewed_at: now,
    });
  }
  const postedIds = new Set(posted.map((t) => t.id));
  // Drop bookkeeping rows that no longer apply: reclassified, or their bank transaction
  // was deleted by the user (dismissed) — otherwise "saved" keeps an adjustment for a
  // purchase that's gone.
  const stale = existing.filter((r) => {
    if (!r.external_id || !/^(tosavings|fromsavings):/.test(r.external_id)) return false;
    const base = r.external_id.split(":")[1];
    return dismissed.has(base) || (postedIds.has(base) && !wanted.has(r.external_id));
  }).map((r) => r.id);
  if (stale.length > 0) await admin.from("cash_flow_transactions").delete().eq("user_id", userId).in("id", stale);

  if (candidates.length === 0 && syntheticRecords.length === 0) return { inserted: 0, transfers };

  // Same transaction already imported from a statement / typed in → skip it.
  const dupIdx = new Set(findDuplicates(candidates.map((c) => c.parsed), others).map((d) => d.index));
  // One-tap "Paid" bills: a manual entry in the same bucket and month at ~the same amount.
  const manualPaid = others.filter((r) => r.source === "manual" && r.direction === "out" && r.cash_flow_item_id);
  const usedManual = new Set<string>();

  const records: Record<string, unknown>[] = [];
  candidates.forEach(({ t, parsed }, i) => {
    if (dupIdx.has(i)) return;
    // Plaid's INCOME_WAGES is as good a payroll signal as "PAYROLL" in the description.
    const bucket = parsed.kind === "save" ? null
      : suggestBucket({ ...parsed, description: `${parsed.description} ${t.detailed === "INCOME_WAGES" ? "payroll" : ""}` }, bucketItems, ruleList);
    if (parsed.kind === "spend" && bucket) {
      const match = manualPaid.find((r) => !usedManual.has(r.id) && r.cash_flow_item_id === bucket
        && r.txn_date.slice(0, 7) === parsed.date.slice(0, 7)
        && Math.abs(r.amount - parsed.amount) <= Math.max(1, r.amount * 0.05));
      if (match) { usedManual.add(match.id); return; }
    }
    records.push({
      user_id: userId,
      txn_date: parsed.date,
      period_year: Number(parsed.date.slice(0, 4)),
      period_month: Number(parsed.date.slice(5, 7)),
      description: parsed.description || parsed.merchant,
      merchant: parsed.merchant || "Transaction",
      amount: parsed.kind === "refund" || negativeSave.has(t.id) ? -parsed.amount : parsed.amount,
      direction: parsed.kind === "income" ? "in" : parsed.kind === "save" ? "save" : "out",
      cash_flow_item_id: bucket && !bucket.startsWith("new") ? bucket : null,
      source: "plaid",
      external_id: t.id,
    });
  });

  // Plain inserts — rows already present were filtered out above (byExternal), so this
  // doesn't depend on ON CONFLICT matching a particular index shape. If a concurrent sync
  // got there first, the unique index rejects the chunk; retry row by row and skip those.
  records.push(...syntheticRecords);
  let inserted = 0;
  for (let i = 0; i < records.length; i += 200) {
    const chunk = records.slice(i, i + 200);
    const { error } = await admin.from("cash_flow_transactions").insert(chunk);
    if (!error) { inserted += chunk.length; continue; }
    for (const row of chunk) {
      const { error: rowErr } = await admin.from("cash_flow_transactions").insert(row);
      if (!rowErr) inserted++;
      else if (rowErr.code !== "23505") console.error("[plaid-cash-flow] insert failed:", rowErr.code, rowErr.message);
    }
  }
  return { inserted, transfers };
}
