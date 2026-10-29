"use client";

import { MONTH_NAMES } from "./planning-shared";

// Sinking funds: bills that come every few months (insurance every 6, a yearly
// subscription) are spread across the months as a set-aside. This turns that set-aside
// into an action — move it to savings each month — and shows how much should already be
// saved toward each bill so the money is there when it's due.

export type SinkingFund = {
  id: string;
  label: string;
  perMonth: number;            // the monthly set-aside
  bill: number;                // the full bill when it comes
  everyMonths: number;
  shouldHave: number | null;   // what should be saved toward it by now (null: no due date set)
  next: { year: number; month: number } | null;
  dueThisMonth: boolean;
};

export default function SinkingFunds({ funds, isPrivate }: { funds: SinkingFund[]; isPrivate: boolean }) {
  if (funds.length === 0) return null;
  const money = (n: number) => (isPrivate ? "••••" : `$${Math.round(n).toLocaleString()}`);
  const monthly = funds.reduce((s, f) => s + f.perMonth, 0);

  return (
    <div className="cfo-zone" style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-lg)", padding: "14px 18px", marginBottom: "10px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "8px", flexWrap: "wrap" }}>
        <span style={{ fontSize: "var(--text-sm)", fontWeight: 700, color: "var(--text-primary)", fontFamily: "var(--font-body)" }}>Set aside for bills that aren&apos;t monthly</span>
        <span style={{ fontSize: "var(--text-xs)", color: "var(--text-tertiary)", fontFamily: "var(--font-body)" }}>
          {"move "}<span style={{ fontFamily: "var(--font-mono)", color: "var(--text-primary)", fontWeight: 600 }}>{money(monthly)}</span>{" to savings each month"}
        </span>
      </div>
      <p style={{ margin: "4px 0 8px", fontSize: "var(--text-xs)", color: "var(--text-tertiary)", fontFamily: "var(--font-body)", lineHeight: 1.5 }}>
        Counted every month as &ldquo;set aside for bills&rdquo; (not spending, not free savings) and kept in savings, so when the bill comes it&apos;s paid from this money instead of landing on one month.
      </p>
      {funds.map((f) => (
        <div key={f.id} style={{ display: "flex", justifyContent: "space-between", gap: "10px", alignItems: "center", padding: "7px 0", borderTop: "1px solid var(--border-subtle)" }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: "var(--text-sm)", color: "var(--text-primary)", fontFamily: "var(--font-body)" }}>{f.label}</div>
            <div style={{ fontSize: "var(--text-2xs)", color: "var(--text-tertiary)", fontFamily: "var(--font-body)" }}>
              {`${money(f.bill)} every ${f.everyMonths} months`}
              {f.dueThisMonth ? " · due this month: pay it from the fund" : f.next ? ` · next due ${MONTH_NAMES[f.next.month - 1].slice(0, 3)} ${f.next.year}` : " · set a due month in Edit my plan to track it"}
            </div>
          </div>
          <div style={{ textAlign: "right", flexShrink: 0 }}>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-sm)", color: "var(--text-primary)" }}>{`${money(f.perMonth)}/mo`}</div>
            {f.shouldHave !== null && !f.dueThisMonth && (
              <div style={{ fontSize: "var(--text-2xs)", fontFamily: "var(--font-mono)", color: "var(--text-tertiary)" }}>{`${money(f.shouldHave)} saved by now`}</div>
            )}
          </div>
        </div>
      ))}
      <p style={{ margin: "6px 0 0", fontSize: "var(--text-2xs)", color: "var(--text-tertiary)", fontFamily: "var(--font-body)", lineHeight: 1.5 }}>
        Costs that come and go without a schedule, like healthcare, can work the same way: in Edit my plan, set the line to a yearly amount and choose &ldquo;spread it out.&rdquo;
      </p>
    </div>
  );
}
