import { createAdminClient } from "@/lib/supabase/admin";
import type { BankTransaction } from "./plaid";
import { getDismissedPlaidIds } from "./plaid";
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

export async function syncPlaidIntoCashFlow(userId: string, store: BankTransaction[], removedIds: string[]): Promise<number> {
  const admin = createAdminClient();

  if (removedIds.length > 0) {
    await admin.from("cash_flow_transactions").delete()
      .eq("user_id", userId).eq("source", "plaid").in("external_id", removedIds);
  }

  const [{ data: accts }, dismissed] = await Promise.all([
    admin.from("bank_accounts").select("account_id, type").eq("user_id", userId),
    getDismissedPlaidIds(userId),
  ]);
  // Brokerage and loan accounts: their activity isn't spending (and SnapTrade covers holdings).
  const skipAccounts = new Set((accts ?? []).filter((a) => a.type === "investment" || a.type === "loan").map((a) => a.account_id));
  const posted = store.filter((t) => !t.pending && t.amount !== 0 && t.date && !skipAccounts.has(t.accountId) && !dismissed.has(t.id));
  if (posted.length === 0) return 0;

  const minDate = posted.reduce((m, t) => (t.date < m ? t.date : m), posted[0].date);
  const [{ data: existingRows, error: exErr }, { data: items }, { data: rules }] = await Promise.all([
    admin.from("cash_flow_transactions")
      .select("id, txn_date, period_year, period_month, description, merchant, amount, direction, cash_flow_item_id, source, import_batch_id, note, external_id")
      .eq("user_id", userId).gte("txn_date", minDate),
    admin.from("cash_flow_items").select("id, label, type, category, amount").eq("user_id", userId),
    admin.from("cash_flow_merchant_rules").select("merchant_key, cash_flow_item_id").eq("user_id", userId),
  ]);
  if (exErr) return 0; // e.g. external_id column not added yet — try again next sync

  type Row = CashFlowTransaction & { external_id: string | null };
  const existing = (existingRows ?? []).map((r) => ({ ...r, amount: Number(r.amount) }) as Row);
  const byExternal = new Map(existing.filter((r) => r.external_id).map((r) => [r.external_id as string, r]));
  const others = existing.filter((r) => r.source !== "plaid");
  const bucketItems = (items ?? []).map((i) => ({ ...i, amount: Number(i.amount) })) as { id: string; label: string; type: "income" | "expense"; category: string | null; amount: number }[];
  const ruleList = (rules ?? []) as MerchantRule[];

  // Classify; update rows we already have; collect the rest as candidates.
  const candidates: { t: BankTransaction; parsed: ParsedTxn }[] = [];
  for (const t of posted) {
    const { kind, category } = classifyBankTransaction(t);
    const amount = Math.abs(t.amount);
    const have = byExternal.get(t.id);
    if (have) {
      const signed = kind === "refund" ? -amount : amount;
      if (have.txn_date !== t.date || Math.abs(have.amount - signed) >= 0.005) {
        await admin.from("cash_flow_transactions")
          .update({ txn_date: t.date, period_year: Number(t.date.slice(0, 4)), period_month: Number(t.date.slice(5, 7)), amount: signed, updated_at: new Date().toISOString() })
          .eq("id", have.id).eq("user_id", userId);
      }
      continue;
    }
    if (kind === "transfer") continue;
    const merchant = (t.merchant || cleanMerchant(t.name)).slice(0, 60);
    candidates.push({ t, parsed: { date: t.date, description: t.name.slice(0, 200), merchant, amount, kind, category } });
  }
  if (candidates.length === 0) return 0;

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
      amount: parsed.kind === "refund" ? -parsed.amount : parsed.amount,
      direction: parsed.kind === "income" ? "in" : parsed.kind === "save" ? "save" : "out",
      cash_flow_item_id: bucket && !bucket.startsWith("new") ? bucket : null,
      source: "plaid",
      external_id: t.id,
    });
  });

  let inserted = 0;
  for (let i = 0; i < records.length; i += 500) {
    const chunk = records.slice(i, i + 500);
    const { error } = await admin.from("cash_flow_transactions")
      .upsert(chunk, { onConflict: "user_id,external_id", ignoreDuplicates: true });
    if (!error) inserted += chunk.length;
  }
  return inserted;
}
