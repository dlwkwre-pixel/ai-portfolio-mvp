"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { CashFlowItem } from "./planning-actions";
import { closeCashFlowMonth, reopenCashFlowMonth } from "./planning-actions";
import AddTransactionForm from "./add-transaction-form";
import { Button } from "@/app/components/ui-primitives";
import { MONTH_NAMES } from "./planning-shared";

// The monthly ritual: once a month ends, check it's complete (pay recorded, statement in,
// bills recorded, nothing unsorted), see what you kept, decide where it goes, close it.

export type MonthCloseFacts = {
  year: number;
  month: number;
  income: number;
  expectedIncome: number;
  paychecksRecorded: number;
  spendingRecorded: number;
  spendingAssumed: number;
  transactionCount: number;
  unrecordedCount: number;
  unsortedCount: number;
  unsortedTotal: number;
  saved: number;
};

export type MonthCloseRow = { period_year: number; period_month: number; income: number; spending: number; saved: number; closed_at: string };

type Check = { ok: boolean; text: string };

export default function MonthCloseCard({
  facts, closed, isPrivate, expenseItems, incomeItems, onGoToMonth,
}: {
  facts: MonthCloseFacts;
  closed: MonthCloseRow | null;
  isPrivate: boolean;
  expenseItems: CashFlowItem[];
  incomeItems: CashFlowItem[];
  onGoToMonth: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [addingSave, setAddingSave] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const name = MONTH_NAMES[facts.month - 1];
  const money = (n: number) => (isPrivate ? "••••" : `$${Math.abs(n).toLocaleString(undefined, { maximumFractionDigits: 0 })}`);

  if (closed) {
    return (
      <div className="cfo-zone" style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap", padding: "10px 14px", marginBottom: "10px", borderRadius: "var(--radius-lg)", border: "1px solid var(--green-border)", background: "var(--green-bg)" }}>
        <span style={{ fontSize: "var(--text-sm)", color: "var(--text-primary)", fontFamily: "var(--font-body)", flex: 1, minWidth: 0 }}>
          <strong>{name} closed ✓</strong> You kept <span style={{ fontFamily: "var(--font-mono)" }}>{money(closed.income - closed.spending)}</span>
          {closed.saved > 0 && <>{" "}and moved <span style={{ fontFamily: "var(--font-mono)" }}>{money(closed.saved)}</span> to savings</>}.
        </span>
        <button type="button" disabled={pending}
          onClick={() => startTransition(async () => { await reopenCashFlowMonth(facts.year, facts.month); router.refresh(); })}
          style={{ background: "none", border: "none", color: "var(--text-secondary)", textDecoration: "underline", fontSize: "var(--text-xs)", fontFamily: "var(--font-body)", cursor: "pointer", minHeight: "32px" }}>
          Reopen
        </button>
      </div>
    );
  }

  const kept = facts.income - facts.spendingRecorded - facts.spendingAssumed;
  const unallocated = kept - facts.saved;
  const checks: Check[] = [
    facts.paychecksRecorded > 0
      ? { ok: true, text: `Income recorded: ${money(facts.income)}` }
      : { ok: false, text: `No paychecks recorded, so this uses your expected ${money(facts.expectedIncome)}` },
    facts.transactionCount > 0
      ? { ok: true, text: `${facts.transactionCount} transaction${facts.transactionCount !== 1 ? "s" : ""} recorded` }
      : { ok: false, text: "No statement imported yet" },
    facts.unrecordedCount === 0
      ? { ok: true, text: "Every planned bill is recorded" }
      : { ok: false, text: `${facts.unrecordedCount} planned bill${facts.unrecordedCount !== 1 ? "s" : ""} not recorded (${money(facts.spendingAssumed)} assumed)` },
    facts.unsortedCount === 0
      ? { ok: true, text: "Everything is sorted" }
      : { ok: false, text: `${facts.unsortedCount} transaction${facts.unsortedCount !== 1 ? "s" : ""} not sorted (${money(facts.unsortedTotal)} not counted)` },
  ];
  const allDone = checks.every((c) => c.ok);

  function close() {
    setError(null);
    startTransition(async () => {
      const res = await closeCashFlowMonth({
        year: facts.year, month: facts.month, income: facts.income,
        spending: facts.spendingRecorded + facts.spendingAssumed, saved: facts.saved,
      });
      if (res.error) { setError(res.error); return; }
      router.refresh();
    });
  }

  return (
    <div className="cfo-zone" style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-lg)", padding: "16px 20px", marginBottom: "10px", display: "flex", flexDirection: "column", gap: "12px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "10px", flexWrap: "wrap" }}>
        <div>
          <div style={{ fontFamily: "var(--font-display)", fontSize: "var(--text-base)", fontWeight: 700, color: "var(--text-primary)" }}>Close out {name}</div>
          <div style={{ fontSize: "var(--text-xs)", color: "var(--text-tertiary)", fontFamily: "var(--font-body)", marginTop: "2px" }}>
            A two-minute check that last month is complete, then decide what to do with what&apos;s left.
          </div>
        </div>
        <Button size="sm" onClick={onGoToMonth}>Review {name}</Button>
      </div>

      <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "6px" }}>
        {checks.map((c, i) => (
          <li key={i} style={{ display: "flex", gap: "8px", alignItems: "flex-start", fontSize: "var(--text-sm)", color: "var(--text-secondary)", fontFamily: "var(--font-body)", lineHeight: 1.45 }}>
            <span aria-hidden="true" style={{ flexShrink: 0, width: "18px", height: "18px", borderRadius: "var(--radius-full)", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: "var(--text-2xs)", fontWeight: 700, marginTop: "1px",
              background: c.ok ? "var(--green-bg)" : "var(--amber-bg)", color: c.ok ? "var(--green)" : "var(--amber)", border: `1px solid ${c.ok ? "var(--green-border)" : "var(--amber)"}` }}>
              {c.ok ? "✓" : "!"}
            </span>
            <span><span className="bt-sr-only">{c.ok ? "Done: " : "To do: "}</span>{c.text}</span>
          </li>
        ))}
      </ul>

      <div style={{ borderTop: "1px solid var(--border-subtle)", paddingTop: "12px", display: "flex", flexDirection: "column", gap: "8px" }}>
        <div style={{ fontSize: "var(--text-sm)", color: "var(--text-secondary)", fontFamily: "var(--font-body)" }}>
          {kept >= 0 ? "You kept " : "You spent more than you made by "}
          <strong style={{ fontFamily: "var(--font-mono)", color: kept >= 0 ? "var(--green)" : "var(--red)", fontSize: "var(--text-base)" }}>{money(kept)}</strong>
          {facts.saved > 0 && <>{" "}· already moved <strong style={{ fontFamily: "var(--font-mono)", color: "var(--text-primary)" }}>{money(facts.saved)}</strong> to savings or investments</>}
        </div>
        {kept > 0 && unallocated > 1 && (
          <div style={{ fontSize: "var(--text-xs)", color: "var(--text-tertiary)", fontFamily: "var(--font-body)" }}>
            {`${money(unallocated)} hasn't been moved anywhere yet. Recording the transfer counts it as saved.`}
          </div>
        )}
        {addingSave ? (
          <AddTransactionForm selYear={facts.year} selMonth={facts.month} expenseItems={expenseItems} incomeItems={incomeItems}
            initialKind="save" lockKind onDone={() => setAddingSave(false)} />
        ) : (
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            {kept > 0 && <Button size="sm" onClick={() => setAddingSave(true)}>Record a move to savings</Button>}
            <Button variant="primary" size="sm" onClick={close} disabled={pending}>
              {pending ? "Closing…" : allDone ? `Close ${name}` : `Close ${name} anyway`}
            </Button>
          </div>
        )}
        {error && <div role="alert" style={{ fontSize: "var(--text-xs)", color: "var(--red)", fontFamily: "var(--font-body)" }}>{error}</div>}
      </div>
    </div>
  );
}
