"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { CashFlowItem } from "./planning-actions";
import { addManualTransaction } from "./planning-actions";
import { NEW_EXPENSE_BUCKET_PREFIX, NEW_PAYCHECK_BUCKET } from "@/lib/planning/transactions";
import { likelyPaycheckSource } from "@/lib/planning/pay-schedule";
import { EXPENSE_CATEGORIES, categoryOf } from "@/lib/planning/expense-categories";
import { Button } from "@/app/components/ui-primitives";
import { MONTH_NAMES } from "./planning-shared";

// Records one transaction in the selected month by hand. The Lego-sale case: "Facebook
// Marketplace, $340, extra" lands in that month only and leaves the plan alone. The
// variable-pay case: each paycheck goes in as "regular pay" against an income source and
// replaces that source's expected amount for the month.

type Kind = "income" | "spend" | "refund" | "save";

const EXTRA = "__extra__";

const fieldStyle: React.CSSProperties = {
  background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-sm)",
  color: "var(--text-primary)", fontFamily: "var(--font-body)", fontSize: "var(--text-xs)", padding: "7px 9px",
  minHeight: "36px", minWidth: 0, width: "100%", boxSizing: "border-box",
};

const labelStyle: React.CSSProperties = {
  fontSize: "var(--text-2xs)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em",
  color: "var(--text-tertiary)", fontFamily: "var(--font-body)", display: "flex", flexDirection: "column", gap: "4px", minWidth: 0,
};

function defaultDate(year: number, month: number): string {
  const now = new Date();
  const day = now.getFullYear() === year && now.getMonth() + 1 === month
    ? now.getDate()
    : Math.min(15, new Date(year, month, 0).getDate());
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export default function AddTransactionForm({
  selYear, selMonth, expenseItems, incomeItems, initialKind = "income", lockKind = false, onDone,
}: {
  selYear: number;
  selMonth: number;
  expenseItems: CashFlowItem[];
  incomeItems: CashFlowItem[];
  initialKind?: Kind;
  lockKind?: boolean;
  onDone: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [kind, setKind] = useState<Kind>(initialKind);
  const [merchant, setMerchant] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(() => defaultDate(selYear, selMonth));
  const [incomeBucket, setIncomeBucket] = useState<string>(EXTRA);
  const [expenseBucket, setExpenseBucket] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  // Set when "Extra" income looks like a paycheck — ask before it gets counted on top of
  // expected pay (the easy way to count the same paycheck twice).
  const [askPaycheck, setAskPaycheck] = useState<CashFlowItem | null>(null);

  const missingCategories = useMemo(() => {
    const have = new Set(expenseItems.map((i) => categoryOf(i)));
    return EXPENSE_CATEGORIES.map((c) => c.label).filter((c) => !have.has(c));
  }, [expenseItems]);

  const lastDay = new Date(selYear, selMonth, 0).getDate();
  const monthStart = `${selYear}-${String(selMonth).padStart(2, "0")}-01`;
  const monthEnd = `${selYear}-${String(selMonth).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (kind === "income" && incomeBucket === EXTRA) {
      const match = likelyPaycheckSource(Number(amount), merchant, incomeItems);
      if (match) { setAskPaycheck(incomeItems.find((i) => i.id === match.id) ?? null); return; }
    }
    save(kind === "income" ? (incomeBucket === EXTRA ? null : incomeBucket) : (expenseBucket || null));
  }

  function save(bucket: string | null) {
    setAskPaycheck(null);
    startTransition(async () => {
      const res = await addManualTransaction({ date, merchant, amount: Number(amount), kind, bucket });
      if (res.error) { setError(res.error); return; }
      router.refresh();
      onDone();
    });
  }

  return (
    <form onSubmit={submit} style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)", borderRadius: "var(--radius-md)", padding: "12px", display: "flex", flexDirection: "column", gap: "10px" }}>
      <div style={{ fontSize: "var(--text-sm)", fontWeight: 600, color: "var(--text-primary)", fontFamily: "var(--font-body)" }}>
        {kind === "income" ? "Add income" : kind === "save" ? "Record a move to savings" : "Add a transaction"} for {MONTH_NAMES[selMonth - 1]} {selYear}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: "8px" }}>
        {!lockKind && (
          <label style={labelStyle}>
            Type
            <select value={kind} onChange={(e) => setKind(e.target.value as Kind)} style={fieldStyle}>
              <option value="income">Income</option>
              <option value="spend">Spending</option>
              <option value="refund">Refund</option>
              <option value="save">Saved / invested</option>
            </select>
          </label>
        )}
        <label style={labelStyle}>
          What
          <input value={merchant} onChange={(e) => setMerchant(e.target.value)} required maxLength={60}
            placeholder={kind === "income" ? "e.g. Marketplace sale" : kind === "save" ? "e.g. Transfer to savings" : "e.g. Farmers market"} style={fieldStyle} />
        </label>
        <label style={labelStyle}>
          Amount
          <input value={amount} onChange={(e) => setAmount(e.target.value)} required type="number" min="0.01" step="0.01" inputMode="decimal"
            placeholder="0.00" style={{ ...fieldStyle, fontFamily: "var(--font-mono)" }} />
        </label>
        <label style={labelStyle}>
          Date
          <input value={date} onChange={(e) => setDate(e.target.value)} required type="date" min={monthStart} max={monthEnd} style={fieldStyle} />
        </label>
      </div>

      {kind === "save" ? (
        <p style={{ margin: 0, fontSize: "var(--text-xs)", color: "var(--text-tertiary)", fontFamily: "var(--font-body)", lineHeight: 1.5 }}>
          Money you moved into your own savings or investment account. It counts as saved, not as spending.
        </p>
      ) : kind === "income" ? (
        <label style={labelStyle}>
          Counts as
          <select value={incomeBucket} onChange={(e) => setIncomeBucket(e.target.value)} style={fieldStyle}>
            <option value={EXTRA}>Extra, one-time (added on top of expected income)</option>
            {incomeItems.length > 0 ? (
              <optgroup label="Regular pay (replaces expected for that source)">
                {incomeItems.map((i) => <option key={i.id} value={i.id}>Pay from {i.label}</option>)}
              </optgroup>
            ) : (
              <option value={NEW_PAYCHECK_BUCKET}>Regular paycheck (replaces estimated income)</option>
            )}
          </select>
          <span style={{ fontSize: "var(--text-2xs)", fontWeight: 400, textTransform: "none", letterSpacing: 0, color: "var(--text-muted)", lineHeight: 1.5 }}>
            {incomeBucket === EXTRA
              ? "Only affects this month. Your plan stays the same."
              : "Log each paycheck this month. Together they become this month's real income instead of the estimate."}
          </span>
        </label>
      ) : (
        <label style={labelStyle}>
          Bucket
          <select value={expenseBucket} onChange={(e) => setExpenseBucket(e.target.value)} style={fieldStyle}>
            <option value="">Needs a bucket</option>
            {expenseItems.length > 0 && (
              <optgroup label="Your budget">
                {expenseItems.map((i) => <option key={i.id} value={i.id}>{i.label}</option>)}
              </optgroup>
            )}
            {missingCategories.length > 0 && (
              <optgroup label="Create new budget line">
                {missingCategories.map((c) => <option key={c} value={`${NEW_EXPENSE_BUCKET_PREFIX}${c}`}>New: {c}</option>)}
              </optgroup>
            )}
          </select>
        </label>
      )}

      {error && <div role="alert" style={{ fontSize: "var(--text-xs)", color: "var(--red)", fontFamily: "var(--font-body)" }}>{error}</div>}

      {askPaycheck ? (
        <div role="alertdialog" aria-label="Is this your paycheck?" style={{ border: "1px solid var(--amber)", borderRadius: "var(--radius-md)", padding: "10px 12px", display: "flex", flexDirection: "column", gap: "8px" }}>
          <div style={{ fontSize: "var(--text-sm)", fontWeight: 600, color: "var(--text-primary)", fontFamily: "var(--font-body)" }}>
            {`Is this your paycheck from ${askPaycheck.label}?`}
          </div>
          <div style={{ fontSize: "var(--text-xs)", color: "var(--text-secondary)", fontFamily: "var(--font-body)", lineHeight: 1.5 }}>
            {`A paycheck replaces the expected pay for ${askPaycheck.label}, so it isn't counted twice. Extra income (like selling something) is added on top.`}
          </div>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <Button variant="primary" size="sm" disabled={pending} onClick={() => save(askPaycheck.id)}>Yes, it&apos;s my paycheck</Button>
            <Button size="sm" disabled={pending} onClick={() => save(null)}>No, it&apos;s extra</Button>
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", gap: "8px" }}>
          <Button type="submit" variant="primary" size="sm" disabled={pending}>{pending ? "Saving…" : "Save"}</Button>
          <Button size="sm" onClick={onDone}>Cancel</Button>
        </div>
      )}
    </form>
  );
}
