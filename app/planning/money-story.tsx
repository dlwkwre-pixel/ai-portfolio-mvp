"use client";

import Link from "next/link";
import type { NetWorthSnapshot } from "./planning-actions";
import { MONTH_NAMES } from "./planning-shared";

// The month as one story: what came in → what went out → what was moved to savings and
// investments → what's still sitting in checking, then how the balance sheet moved. Cash
// Flow explains the flow; net worth is where it ends up.

function snapshotChange(history: NetWorthSnapshot[], year: number, month: number) {
  if (history.length === 0) return null;
  const sorted = history.slice().sort((a, b) => a.snapshot_date.localeCompare(b.snapshot_date));
  const monthStart = `${year}-${String(month).padStart(2, "0")}-01`;
  const nextMonth = month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, "0")}-01`;
  const before = sorted.filter((s) => s.snapshot_date < monthStart).pop()
    ?? sorted.find((s) => s.snapshot_date >= monthStart && s.snapshot_date < nextMonth);
  const end = sorted.filter((s) => s.snapshot_date < nextMonth).pop();
  if (!before || !end || before === end) return null;
  const nw = end.net_worth - before.net_worth;
  const inv = end.portfolio_value != null && before.portfolio_value != null ? end.portfolio_value - before.portfolio_value : null;
  return { nw, inv, endValue: end.net_worth, from: before.snapshot_date };
}

export default function MoneyStory({
  income, spent, pendingPlanned = 0, setAside = 0, setAsideNotMoved = 0, setAsideLabels = [], saved, year, month, netWorthHistory, isPrivate,
}: {
  income: number;
  spent: number;          // everyday spending recorded this month (bills that aren't monthly excluded)
  pendingPlanned?: number; // planned lines not recorded yet — told, not silently counted
  setAside?: number;       // accrual for bills that aren't monthly (insurance ÷ 6…)
  setAsideNotMoved?: number; // part of the set-aside still sitting in checking
  setAsideLabels?: string[];
  saved: number;           // saved & invested beyond the set-aside
  year: number;
  month: number;
  netWorthHistory: NetWorthSnapshot[];
  isPrivate: boolean;
}) {
  const money = (n: number) => (isPrivate ? "••••" : `$${Math.round(Math.abs(n)).toLocaleString()}`);
  const signed = (n: number) => (isPrivate ? "••••" : `${n >= 0 ? "+" : "−"}$${Math.round(Math.abs(n)).toLocaleString()}`);
  const leftInChecking = income - spent - pendingPlanned - setAside - saved;
  // Short only because more went to savings than the month left over: the extra came out
  // of cash already in the bank, which is a choice, not a problem.
  const fundedFromCash = leftInChecking < 0 && income - spent - pendingPlanned - setAside >= 0;
  const change = snapshotChange(netWorthHistory, year, month);
  const name = MONTH_NAMES[month - 1];

  const steps: { label: string; value: string; tone: string }[] = [
    { label: "Came in", value: money(income), tone: "var(--green)" },
    { label: "Spent", value: money(spent), tone: "var(--text-primary)" },
    ...(setAside > 0.5 ? [{ label: "Set aside for bills", value: money(setAside), tone: "var(--text-secondary)" }] : []),
    { label: "Saved & invested", value: money(saved), tone: "var(--brand-blue)" },
    leftInChecking >= 0
      ? { label: "Still in checking", value: money(leftInChecking), tone: "var(--text-primary)" }
      : fundedFromCash
        ? { label: "From cash you already had", value: money(leftInChecking), tone: "var(--text-secondary)" }
        : { label: "Short this month", value: money(leftInChecking), tone: "var(--red)" },
  ];

  return (
    <div className="cfo-zone" style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-lg)", padding: "14px 18px", marginBottom: "10px", display: "flex", flexDirection: "column", gap: "12px" }}>
      <div style={{ fontSize: "var(--text-sm)", fontWeight: 700, color: "var(--text-primary)", fontFamily: "var(--font-body)" }}>{`Where ${name}'s money went`}</div>
      <div style={{ display: "flex", alignItems: "stretch", gap: "6px", flexWrap: "wrap" }}>
        {steps.map((st, i) => (
          <div key={st.label} style={{ display: "flex", alignItems: "center", gap: "6px", flex: "1 1 130px", minWidth: 0 }}>
            <div style={{ flex: 1, minWidth: 0, border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-md)", padding: "8px 10px", background: "var(--card-bg)" }}>
              <div style={{ fontSize: "var(--text-2xs)", color: "var(--text-tertiary)", fontFamily: "var(--font-body)", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 700 }}>{st.label}</div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-base)", fontWeight: 700, color: st.tone, marginTop: "2px" }}>{st.value}</div>
            </div>
            {i < steps.length - 1 && <span aria-hidden="true" style={{ color: "var(--text-tertiary)", fontSize: "14px", flexShrink: 0 }}>→</span>}
          </div>
        ))}
      </div>
      <p style={{ margin: 0, fontSize: "var(--text-xs)", color: "var(--text-secondary)", fontFamily: "var(--font-body)", lineHeight: 1.55 }}>
        {saved > 0
          ? `${money(saved)} already moved to savings or investments. `
          : "Nothing moved to savings or investments yet this month. "}
        {setAside > 0.5 ? `${money(setAside)} is set aside this month for ${setAsideLabels.join(", ") || "bills that aren't monthly"}, earmarked in savings until the bill comes${setAsideNotMoved > 0.5 ? `; ${money(setAsideNotMoved)} of it is still in checking, so move it over` : ""}. ` : ""}
        {pendingPlanned > 0 ? `${money(pendingPlanned)} of planned bills isn't recorded yet and is held back from what's left. ` : ""}
        {fundedFromCash ? `You moved more to savings than this month left over, so ${money(leftInChecking)} came from cash you already had. ` : ""}
        {leftInChecking > 0 ? `${money(leftInChecking)} is still in checking, so decide below where it should go.` : ""}
      </p>
      {change && (
        <div style={{ borderTop: "1px solid var(--border-subtle)", paddingTop: "10px", display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "10px", flexWrap: "wrap" }}>
          <span style={{ fontSize: "var(--text-xs)", color: "var(--text-secondary)", fontFamily: "var(--font-body)", lineHeight: 1.5 }}>
            {"Net worth this month "}
            <strong style={{ fontFamily: "var(--font-mono)", color: change.nw >= 0 ? "var(--green)" : "var(--red)" }}>{signed(change.nw)}</strong>
            {change.inv !== null && ` (investments ${signed(change.inv)}, cash and everything else ${signed(change.nw - change.inv)})`}
            {` · now ${money(change.endValue)}`}
          </span>
          <Link href="/planning?tab=balance" style={{ fontSize: "var(--text-xs)", color: "var(--brand-blue)", fontWeight: 600, fontFamily: "var(--font-body)" }}>
            See balance sheet
          </Link>
        </div>
      )}
    </div>
  );
}
