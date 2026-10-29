"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { CashFlowItem, ExpenseActual } from "./planning-actions";
import { updateTransactionBucket, deleteTransaction, deleteExpenseActual, bulkSetTransactionBuckets, markTransactionsReviewed } from "./planning-actions";
import { NEW_PAYCHECK_BUCKET, guessBucket, isSavingsAdjustment, needsReview, payEvents, type CashFlowTransaction } from "@/lib/planning/transactions";
import AddTransactionForm from "./add-transaction-form";
import { EXPENSE_CATEGORIES, categoryOf } from "@/lib/planning/expense-categories";
import { MONTH_NAMES } from "./planning-shared";

// Every transaction in the selected month — the answer to "what did I actually put in?"
// Re-bucketing here is the one place to move a merchant; with "remember" on, it moves the
// same merchant's other transactions this month and every future import too.

type Filter = "unsorted" | "spending" | "income" | "saved" | "all";

const PAGE = 30;

function money(n: number, isPrivate: boolean): string {
  return isPrivate ? "••••" : `$${Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const selectStyle: React.CSSProperties = {
  background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-sm)",
  color: "var(--text-primary)", fontFamily: "var(--font-body)", fontSize: "var(--text-xs)", padding: "6px 8px",
  minHeight: "32px", minWidth: 0, width: "100%",
};

export default function MonthTransactions({
  transactions, loggedTotals = [], selYear, selMonth, expenseItems, incomeItems, isPrivate,
}: {
  transactions: CashFlowTransaction[];
  // Month totals typed in before transactions existed (expense_actuals). Still counted for
  // their item-month, so they're listed here where they can be seen and removed.
  loggedTotals?: ExpenseActual[];
  selYear: number;
  selMonth: number;
  expenseItems: CashFlowItem[];
  incomeItems: CashFlowItem[];
  isPrivate: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [filter, setFilter] = useState<Filter | null>(null);
  const [query, setQuery] = useState("");
  const [remember, setRemember] = useState(true);
  const [showAll, setShowAll] = useState(false);
  const [notice, setNotice] = useState<{ text: string; tone: "ok" | "err" } | null>(null);
  const [adding, setAdding] = useState(false);
  const [scope, setScope] = useState<"month" | "all">("month");
  const [showList, setShowList] = useState(false);

  const month = useMemo(
    () => transactions.filter((t) => t.period_year === selYear && t.period_month === selMonth)
      .sort((a, b) => b.txn_date.localeCompare(a.txn_date)),
    [transactions, selYear, selMonth],
  );

  const itemLabel = useMemo(() => new Map([...expenseItems, ...incomeItems].map((i) => [i.id, i.label])), [expenseItems, incomeItems]);
  const missingCategories = useMemo(() => {
    const have = new Set(expenseItems.map((i) => categoryOf(i)));
    return EXPENSE_CATEGORIES.map((c) => c.label).filter((c) => !have.has(c));
  }, [expenseItems]);

  const unsortedOut = month.filter((t) => t.direction === "out" && !t.cash_flow_item_id);
  const totals = {
    out: month.filter((t) => t.direction === "out").reduce((s, t) => s + t.amount, 0),
    in: month.filter((t) => t.direction === "in").reduce((s, t) => s + t.amount, 0),
    unsorted: unsortedOut.reduce((s, t) => s + t.amount, 0),
    saved: month.filter((t) => t.direction === "save").reduce((s, t) => s + t.amount, 0),
  };

  // Default to the work that needs doing; fall back to everything once it's sorted.
  const activeFilter: Filter = filter ?? (unsortedOut.length > 0 ? "unsorted" : "all");
  const q = query.trim().toLowerCase();
  // "All months" search answers "how much at Costco this year?" across everything loaded.
  const searchAll = scope === "all" && q.length > 0;
  const base = searchAll ? transactions.slice().sort((a, b) => b.txn_date.localeCompare(a.txn_date)) : month;
  // Savings bookkeeping rows count toward "Saved" but never show as rows of their own.
  const adjustments = month.filter((t) => isSavingsAdjustment(t));
  const filtered = base.filter((t) => {
    if (isSavingsAdjustment(t)) return false;
    if (activeFilter === "unsorted" && !(t.direction === "out" && !t.cash_flow_item_id)) return false;
    if (activeFilter === "spending" && t.direction !== "out") return false;
    if (activeFilter === "income" && t.direction !== "in") return false;
    if (activeFilter === "saved" && t.direction !== "save") return false;
    if (q && !t.merchant.toLowerCase().includes(q) && !t.description.toLowerCase().includes(q)) return false;
    return true;
  });
  const shown = showAll ? filtered : filtered.slice(0, PAGE);

  function handleBucket(t: CashFlowTransaction, value: string) {
    setNotice(null);
    if (value === "__transfer__") {
      // Money moved between the user's own accounts: not income or spending. Removing it
      // (bank rows are remembered so they don't come back) is exactly that.
      if (!confirm(`Treat ${t.merchant} (${money(t.amount, false)}) as a transfer between your own accounts? It won't count as income or spending.`)) return;
      startTransition(async () => {
        const res = await deleteTransaction(t.id);
        setNotice(res.error ? { text: res.error, tone: "err" } : { text: `${t.merchant} is now treated as a transfer.`, tone: "ok" });
        router.refresh();
      });
      return;
    }
    startTransition(async () => {
      // Still unreviewed → keep it in To review until the ✓ is tapped.
      const res = await updateTransactionBucket(t.id, value || null, remember && !!value, t.reviewed_at !== null);
      if (res.error) { setNotice({ text: res.error, tone: "err" }); return; }
      const dest = value === NEW_PAYCHECK_BUCKET ? "Paycheck"
        : value.startsWith("new:") ? value.slice(4)
        : value ? itemLabel.get(value) ?? "that bucket"
        : t.direction === "in" ? "extra income" : "unsorted";
      const n = res.moved ?? 1;
      setNotice({
        text: n > 1
          ? `Moved ${n} ${t.merchant} transactions to ${dest}${remember ? " and remembered it for future imports" : ""}.`
          : `Moved ${t.merchant} to ${dest}${remember && value ? ". Future imports will do the same" : ""}.`,
        tone: "ok",
      });
      router.refresh();
    });
  }

  // One tap for the whole unsorted pile: our category guess for each (an existing budget
  // line in that category, else a new one), remembered for future imports.
  function handleSortAll() {
    const assignments = unsortedOut
      .map((t) => ({ id: t.id, bucket: guessBucket({ merchant: t.merchant, kind: t.amount < 0 ? "refund" : "spend" }, expenseItems) }))
      .filter((a): a is { id: string; bucket: string } => !!a.bucket);
    if (assignments.length === 0) return;
    setNotice(null);
    startTransition(async () => {
      const res = await bulkSetTransactionBuckets(assignments);
      if (res.error) { setNotice({ text: res.error, tone: "err" }); return; }
      setNotice({ text: `Sorted ${res.updated ?? 0} transaction${res.updated === 1 ? "" : "s"}. Change any that look wrong below.`, tone: "ok" });
      setFilter("all");
      router.refresh();
    });
  }

  function handleDeleteTotal(a: ExpenseActual) {
    if (!confirm(`Remove the ${money(a.actual_amount, false)} total logged for ${a.label}? Your plan isn't affected.`)) return;
    startTransition(async () => {
      const res = await deleteExpenseActual(a.id);
      if (res.error) setNotice({ text: res.error, tone: "err" });
      router.refresh();
    });
  }

  // The bank only has ~90 days of history; within that window its transactions should be
  // the single source, so old hand-logged totals for the month can go in one tap.
  const bankCoversMonth = month.some((t) => t.source === "plaid");
  function handleReplaceTotals() {
    if (!confirm(`Remove ${loggedTotals.length} old total${loggedTotals.length !== 1 ? "s" : ""} for ${MONTH_NAMES[selMonth - 1]} and use your bank's transactions instead? Your plan isn't affected.`)) return;
    startTransition(async () => {
      for (const a of loggedTotals) {
        const res = await deleteExpenseActual(a.id);
        if (res.error) { setNotice({ text: res.error, tone: "err" }); break; }
      }
      router.refresh();
    });
  }

  const totalsList = loggedTotals.length > 0 && (
    <div style={{ border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-md)", padding: "8px 10px", display: "flex", flexDirection: "column", gap: "4px" }}>
      <div style={{ fontSize: "var(--text-xs)", color: "var(--text-secondary)", fontFamily: "var(--font-body)", lineHeight: 1.5 }}>
        {`Totals logged the old way for ${MONTH_NAMES[selMonth - 1]}. They count until that bucket gets transactions.`}
        {bankCoversMonth && " Your bank already has this month's transactions, so these may double count spending the bank put in a different bucket."}
      </div>
      {bankCoversMonth && (
        <button type="button" disabled={pending} onClick={handleReplaceTotals}
          style={{ alignSelf: "flex-start", minHeight: "32px", padding: "0 12px", borderRadius: "var(--radius-sm)", border: "1px solid var(--green-border)", background: "var(--green-bg)", color: "var(--green)", fontSize: "var(--text-xs)", fontWeight: 600, fontFamily: "var(--font-body)", cursor: "pointer" }}>
          {`Use bank data instead (remove these ${loggedTotals.length})`}
        </button>
      )}
      {loggedTotals.map((a) => (
        <div key={a.id} style={{ display: "flex", alignItems: "center", gap: "8px", justifyContent: "space-between" }}>
          <span style={{ fontSize: "var(--text-sm)", color: "var(--text-primary)", fontFamily: "var(--font-body)", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {itemLabel.get(a.cash_flow_item_id ?? "") ?? a.label}
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: "6px", flexShrink: 0 }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-sm)", color: "var(--text-primary)" }}>{money(a.actual_amount, isPrivate)}</span>
            <button type="button" onClick={() => handleDeleteTotal(a)} disabled={pending} aria-label={`Remove logged total for ${a.label}`} title="Remove this logged total"
              style={{ minWidth: "36px", minHeight: "32px", borderRadius: "var(--radius-sm)", background: "transparent", border: "1px solid var(--border-subtle)", color: "var(--text-tertiary)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd"/></svg>
            </button>
          </span>
        </div>
      ))}
    </div>
  );

  function handleDelete(t: CashFlowTransaction) {
    if (!confirm(`Delete ${t.merchant} (${money(t.amount, false)}) on ${t.txn_date}?`)) return;
    startTransition(async () => {
      const res = await deleteTransaction(t.id);
      if (res.error) setNotice({ text: res.error, tone: "err" });
      router.refresh();
    });
  }

  const addControl = adding ? (
    <AddTransactionForm selYear={selYear} selMonth={selMonth} expenseItems={expenseItems} incomeItems={incomeItems}
      initialKind="spend" onDone={() => setAdding(false)} />
  ) : (
    <button type="button" onClick={() => setAdding(true)}
      style={{ alignSelf: "flex-start", background: "none", border: "1px dashed var(--border-subtle)", borderRadius: "var(--radius-sm)", color: "var(--text-secondary)", fontSize: "var(--text-xs)", fontFamily: "var(--font-body)", padding: "6px 12px", minHeight: "32px", cursor: "pointer" }}>
      + Add a transaction by hand
    </button>
  );

  function handleReviewed(ids: string[]) {
    setNotice(null);
    startTransition(async () => {
      const res = await markTransactionsReviewed(ids);
      if (res.error) setNotice({ text: res.error, tone: "err" });
      router.refresh();
    });
  }

  // One transaction row — used by "To review" and by the full list popup.
  function renderRow(t: CashFlowTransaction, withReview: boolean) {
    const pool = t.direction === "in" ? incomeItems : expenseItems;
    const isRefund = t.direction === "out" && t.amount < 0;
    const canMarkReviewed = withReview && t.source === "plaid" && t.reviewed_at === null && !(t.direction === "out" && !t.cash_flow_item_id);
    // Twice-a-month pay looks like a duplicate (same name, same amount): say which one this is.
    // (split deposits — $1,773 + $500 a day apart — are one paycheck, via payEvents)
    const otherPaychecks = t.direction === "in" && t.cash_flow_item_id
      ? payEvents(transactions.filter((o) => o.direction === "in" && o.cash_flow_item_id === t.cash_flow_item_id
          && o.period_year === t.period_year && o.period_month === t.period_month))
          .filter((e) => Math.abs(Date.parse(e.date) - Date.parse(t.txn_date)) / 86_400_000 > 3)
      : [];
    return (
      <div key={t.id} style={{ display: "flex", flexDirection: "column", gap: "6px", padding: "8px 10px", borderBottom: "1px solid var(--border-subtle)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: "8px", alignItems: "baseline" }}>
          <span title={t.description} style={{ fontSize: "var(--text-sm)", color: "var(--text-primary)", fontFamily: "var(--font-body)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>
            {t.merchant}
            {isRefund && <span style={{ fontSize: "var(--text-2xs)", color: "var(--text-tertiary)", marginLeft: "6px", textTransform: "uppercase", letterSpacing: "0.05em" }}>Refund</span>}
            {t.source === "plaid" && <span title="Synced from a linked bank or card" style={{ fontSize: "var(--text-2xs)", color: "var(--text-tertiary)", marginLeft: "6px", textTransform: "uppercase", letterSpacing: "0.05em" }}>Bank</span>}
          </span>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-sm)", color: t.direction === "in" ? "var(--green)" : "var(--text-primary)", whiteSpace: "nowrap" }}>
            {t.direction === "in" ? "+" : isRefund ? "−" : ""}{money(t.amount, isPrivate)}
          </span>
        </div>
        {otherPaychecks.length > 0 && (
          <div style={{ fontSize: "var(--text-2xs)", color: "var(--text-tertiary)", fontFamily: "var(--font-body)" }}>
            {`Not a duplicate: 1 of ${otherPaychecks.length + 1} ${itemLabel.get(t.cash_flow_item_id!) ?? "pay"} paychecks in ${MONTH_NAMES[t.period_month - 1]} (also ${otherPaychecks.map((e) => `${MONTH_NAMES[Number(e.date.slice(5, 7)) - 1].slice(0, 3)} ${Number(e.date.slice(8, 10))}`).join(", ")}).`}
          </div>
        )}
        <div style={{ display: "grid", gridTemplateColumns: `52px minmax(0, 1fr)${canMarkReviewed ? " auto" : ""} 36px`, gap: "6px", alignItems: "center" }}>
          <span style={{ fontSize: "var(--text-xs)", color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>
            {`${MONTH_NAMES[t.period_month - 1]} ${Number(t.txn_date.slice(8, 10))}${searchAll && t.period_year !== selYear ? ` '${String(t.period_year).slice(2)}` : ""}`}
          </span>
          {t.direction === "save" ? (
            <span style={{ fontSize: "var(--text-xs)", color: t.amount < 0 ? "var(--amber)" : "var(--text-secondary)", fontFamily: "var(--font-body)" }}>
              {t.amount < 0 ? "Taken out of savings (lowers saved)" : "Saved / invested"}
            </span>
          ) : (
            <select value={t.cash_flow_item_id ?? ""} disabled={pending} onChange={(e) => handleBucket(t, e.target.value)} aria-label={`Bucket for ${t.merchant}`}
              style={{ ...selectStyle, borderColor: t.direction === "out" && !t.cash_flow_item_id ? "var(--amber)" : "var(--border-subtle)", color: t.cash_flow_item_id ? "var(--text-primary)" : t.direction === "out" ? "var(--amber)" : "var(--text-secondary)" }}>
              <option value="">{t.direction === "in" ? "Extra, one-time" : "Needs a bucket"}</option>
              {pool.length > 0 && (
                <optgroup label={t.direction === "in" ? "Regular pay (replaces expected)" : "Your budget"}>
                  {pool.map((i) => <option key={i.id} value={i.id}>{t.direction === "in" ? `Pay from ${i.label}` : i.label}</option>)}
                </optgroup>
              )}
              {t.direction === "in" && pool.length === 0 && (
                <option value={NEW_PAYCHECK_BUCKET}>Regular paycheck (replaces estimate)</option>
              )}
              <option value="__transfer__">Transfer between my own accounts (not counted)</option>
              {t.direction === "out" && missingCategories.length > 0 && (
                <optgroup label="Create new budget line">
                  {missingCategories.map((c) => <option key={c} value={`new:${c}`}>New: {c}</option>)}
                </optgroup>
              )}
            </select>
          )}
          {canMarkReviewed && (
            <button type="button" onClick={() => handleReviewed([t.id])} disabled={pending} title="Looks right — move it out of To review"
              style={{ minHeight: "32px", padding: "0 10px", borderRadius: "var(--radius-sm)", border: "1px solid var(--green-border)", background: "var(--green-bg)", color: "var(--green)", fontSize: "var(--text-xs)", fontWeight: 600, fontFamily: "var(--font-body)", cursor: "pointer", whiteSpace: "nowrap" }}>
              ✓<span className="bt-sr-only"> Mark {t.merchant} reviewed</span>
            </button>
          )}
          <button type="button" onClick={() => handleDelete(t)} disabled={pending} aria-label={`Delete ${t.merchant}`} title="Delete this transaction"
            style={{ minWidth: "36px", minHeight: "32px", borderRadius: "var(--radius-sm)", background: "transparent", border: "1px solid var(--border-subtle)", color: "var(--text-tertiary)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd"/></svg>
          </button>
        </div>
      </div>
    );
  }

  const noticeEl = notice && (
    <div role="status" style={{ fontSize: "var(--text-xs)", color: notice.tone === "ok" ? "var(--green)" : "var(--red)", fontFamily: "var(--font-body)" }}>{notice.text}</div>
  );

  if (month.length === 0) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "18px" }}>
        <p style={{ fontSize: "var(--text-xs)", color: "var(--text-tertiary)", fontFamily: "var(--font-body)", margin: 0, lineHeight: 1.5 }}>
          No transactions for {MONTH_NAMES[selMonth - 1]} {selYear} yet. Import a statement or add one by hand.
        </p>
        {totalsList}
        {addControl}
      </div>
    );
  }

  const toReview = month.filter(needsReview);
  const reviewableIds = toReview.filter((t) => t.source === "plaid" && t.reviewed_at === null && !(t.direction === "out" && !t.cash_flow_item_id)).map((t) => t.id);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginBottom: "18px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "8px", flexWrap: "wrap" }}>
        <span style={{ fontSize: "var(--text-sm)", fontWeight: 600, color: "var(--text-primary)", fontFamily: "var(--font-body)" }}>
          {toReview.length > 0 ? "To review" : `${MONTH_NAMES[selMonth - 1]} transactions`}
          <span style={{ color: "var(--text-tertiary)", fontWeight: 400 }}>{toReview.length > 0 ? ` (${toReview.length})` : ""}</span>
        </span>
        <span style={{ fontSize: "var(--text-xs)", color: "var(--text-secondary)", fontFamily: "var(--font-body)", display: "flex", gap: "10px" }}>
          <span>Out <span style={{ fontFamily: "var(--font-mono)", color: "var(--text-primary)" }}>{money(totals.out, isPrivate)}</span></span>
          <span>In <span style={{ fontFamily: "var(--font-mono)", color: "var(--green)" }}>{money(totals.in, isPrivate)}</span></span>
          {totals.saved > 0 && <span>Saved <span style={{ fontFamily: "var(--font-mono)", color: "var(--text-primary)" }}>{money(totals.saved, isPrivate)}</span></span>}
        </span>
      </div>

      {unsortedOut.length > 0 && (
        <div style={{ fontSize: "var(--text-xs)", color: "var(--amber)", background: "var(--amber-bg)", borderRadius: "var(--radius-sm)", padding: "8px 10px", fontFamily: "var(--font-body)", lineHeight: 1.5 }}>
          <div>
            {unsortedOut.length === 1
              ? `1 transaction (${money(totals.unsorted, isPrivate)}) isn't in a bucket yet, so it's not counted in this month's spending.`
              : `${unsortedOut.length} transactions (${money(totals.unsorted, isPrivate)}) aren't in a bucket yet, so they're not counted in this month's spending.`}
          </div>
          <button type="button" onClick={handleSortAll} disabled={pending}
            style={{ marginTop: "6px", minHeight: "32px", padding: "0 12px", borderRadius: "var(--radius-sm)", border: "1px solid var(--amber)", background: "var(--bg-surface)", color: "var(--amber)", fontFamily: "var(--font-body)", fontSize: "var(--text-xs)", fontWeight: 600, cursor: "pointer" }}>
            Sort all with suggestions
          </button>
        </div>
      )}

      {noticeEl}

      {toReview.length > 0 ? (
        <>
          <p style={{ margin: 0, fontSize: "var(--text-xs)", color: "var(--text-tertiary)", fontFamily: "var(--font-body)", lineHeight: 1.5 }}>
            New from your bank. Fix any bucket that&apos;s off, then mark them reviewed and they move into the full list.
          </p>
          <div style={{ border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-md)", opacity: pending ? 0.7 : 1, transition: "opacity 0.15s" }}>
            {toReview.slice(0, showAll ? undefined : PAGE).map((t) => renderRow(t, true))}
            {toReview.length > PAGE && !showAll && (
              <button type="button" onClick={() => setShowAll(true)}
                style={{ width: "100%", minHeight: "40px", background: "transparent", border: "none", color: "var(--brand-blue)", fontSize: "var(--text-xs)", fontFamily: "var(--font-body)", cursor: "pointer" }}>
                {`Show all ${toReview.length}`}
              </button>
            )}
          </div>
        </>
      ) : (
        <p style={{ margin: 0, fontSize: "var(--text-xs)", color: "var(--text-secondary)", fontFamily: "var(--font-body)", lineHeight: 1.5 }}>
          {`All caught up. ${month.length} transaction${month.length !== 1 ? "s" : ""} this month, all reviewed.`}
        </p>
      )}

      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
        {reviewableIds.length > 0 && (
          <button type="button" onClick={() => handleReviewed(reviewableIds)} disabled={pending}
            style={{ minHeight: "34px", padding: "0 12px", borderRadius: "var(--radius-sm)", border: "1px solid var(--green-border)", background: "var(--green-bg)", color: "var(--green)", fontSize: "var(--text-xs)", fontWeight: 600, fontFamily: "var(--font-body)", cursor: "pointer" }}>
            {`Mark ${reviewableIds.length === toReview.length ? "all" : reviewableIds.length} reviewed`}
          </button>
        )}
        <button type="button" onClick={() => { setShowList((v) => !v); setShowAll(false); }} aria-expanded={showList}
          style={{ minHeight: "34px", padding: "0 12px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-subtle)", background: showList ? "var(--surface-005)" : "transparent", color: "var(--text-secondary)", fontSize: "var(--text-xs)", fontWeight: 600, fontFamily: "var(--font-body)", cursor: "pointer" }}>
          {showList ? "Hide transactions ▲" : `View all ${month.length} transactions ▼`}
        </button>
      </div>

      {totalsList}
      {addControl}

      {showList && (
        <div style={{ display: "flex", flexDirection: "column", gap: "10px", paddingTop: "4px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            <span style={{ fontSize: "var(--text-sm)", fontWeight: 600, color: "var(--text-primary)", fontFamily: "var(--font-body)" }}>
              {`${MONTH_NAMES[selMonth - 1]} transactions`}
              <span style={{ color: "var(--text-tertiary)", fontWeight: 400 }}>{` (${month.length})`}</span>
            </span>

            <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", alignItems: "center" }}>
              {([
                ["unsorted", `Unsorted (${unsortedOut.length})`],
                ["spending", "Spending"],
                ["income", "Income"],
                ...(totals.saved > 0 || filter === "saved" ? [["saved", "Saved"] as [Filter, string]] : []),
                ["all", "All"],
              ] as [Filter, string][]).map(([f, label]) => (
                <button key={f} type="button" onClick={() => { setFilter(f); setShowAll(false); }}
                  style={{
                    padding: "6px 10px", minHeight: "32px", borderRadius: "var(--radius-full)", fontSize: "var(--text-xs)", fontFamily: "var(--font-body)", cursor: "pointer",
                    border: `1px solid ${activeFilter === f ? "var(--brand-blue)" : "var(--border-subtle)"}`,
                    background: activeFilter === f ? "rgba(14,165,160,0.12)" : "transparent",
                    color: activeFilter === f ? "var(--brand-blue)" : "var(--text-secondary)",
                  }}>
                  {label}
                </button>
              ))}
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search merchant"
                aria-label="Search transactions"
                style={{ ...selectStyle, width: "auto", flex: "1 1 140px", maxWidth: "220px" }} />
              <select value={scope} onChange={(e) => { setScope(e.target.value as "month" | "all"); setShowAll(false); }} aria-label="Search range"
                style={{ ...selectStyle, width: "auto" }}>
                <option value="month">This month</option>
                <option value="all">All months</option>
              </select>
            </div>

            <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "var(--text-xs)", color: "var(--text-secondary)", fontFamily: "var(--font-body)", cursor: "pointer" }}>
              <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} style={{ accentColor: "var(--brand-blue)" }} />
              When I move a merchant, move its other transactions this month and remember it for next time
            </label>

            {noticeEl}

            {searchAll && (
              <div style={{ fontSize: "var(--text-xs)", color: "var(--text-secondary)", fontFamily: "var(--font-body)" }}>
                {`${filtered.length} match${filtered.length !== 1 ? "es" : ""} for "${query.trim()}" across all months · `}
                <span style={{ fontFamily: "var(--font-mono)", color: "var(--text-primary)" }}>
                  {money(filtered.filter((t) => t.direction === "out").reduce((sum, t) => sum + t.amount, 0), isPrivate)}
                </span>
                {" spent"}
              </div>
            )}

            <div style={{ border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-md)", opacity: pending ? 0.7 : 1, transition: "opacity 0.15s" }}>
              {shown.length === 0 && (
                <p style={{ fontSize: "var(--text-xs)", color: "var(--text-tertiary)", fontFamily: "var(--font-body)", margin: 0, padding: "14px", textAlign: "center" }}>
                  {activeFilter === "unsorted" ? "Everything's sorted." : "No matching transactions."}
                </p>
              )}
              {shown.map((t) => renderRow(t, false))}
              {activeFilter === "saved" && adjustments.length > 0 && (
                <p style={{ fontSize: "var(--text-xs)", color: "var(--text-tertiary)", fontFamily: "var(--font-body)", margin: 0, padding: "10px 12px", lineHeight: 1.5 }}>
                  {"The Saved total is net: "}
                  {adjustments.map((a) => `${a.amount < 0 ? "−" : "+"}${money(Math.abs(a.amount), isPrivate)} ${a.merchant.replace(/^(Paid from savings|Went straight to savings): /, a.amount < 0 ? "paid from savings (" : "went straight to savings (")})`).join(", ")}
                  {". These aren't separate purchases; the spending itself is listed once."}
                </p>
              )}
              {filtered.length > PAGE && !showAll && (
                <button type="button" onClick={() => setShowAll(true)}
                  style={{ width: "100%", minHeight: "40px", background: "transparent", border: "none", color: "var(--brand-blue)", fontSize: "var(--text-xs)", fontFamily: "var(--font-body)", cursor: "pointer" }}>
                  Show all {filtered.length}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
