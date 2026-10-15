"use client";

import Link from "next/link";
import { planLeftover, type RatedAccount } from "@/lib/planning/money-priorities";

// "Put the leftover to work": a short, ordered plan for this month's money left over —
// high-interest debt first (by APR), then the emergency fund gap, then investing.

export default function LeftoverPlan({
  amount, debts, emergencyGap, isPrivate,
}: {
  amount: number;
  debts: RatedAccount[];
  emergencyGap: number;
  isPrivate: boolean;
}) {
  const { steps, unratedDebts, middleDebts } = planLeftover({ amount, debts, emergencyGap });
  if (steps.length === 0) return null;
  const money = (n: number) => (isPrivate ? "••••" : `$${Math.round(n).toLocaleString()}`);

  return (
    <div style={{ marginTop: "10px", paddingTop: "10px", borderTop: "1px solid var(--border-subtle)" }}>
      <p style={{ fontSize: "12px", color: "var(--text-secondary)", fontFamily: "var(--font-body)", margin: "0 0 8px", lineHeight: 1.5 }}>
        {`Where the ${money(amount)} should go, in order:`}
      </p>
      <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "6px" }}>
        {steps.map((s, i) => (
          <li key={`${s.kind}-${i}`} style={{ display: "flex", gap: "10px", alignItems: "flex-start" }}>
            <span aria-hidden="true" style={{ width: "20px", height: "20px", borderRadius: "50%", border: "1px solid var(--border-default)", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: "10px", fontWeight: 700, color: "var(--text-secondary)", flexShrink: 0, fontFamily: "var(--font-mono)" }}>{i + 1}</span>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: "8px", flexWrap: "wrap" }}>
                <Link href={s.href} style={{ fontSize: "12.5px", fontWeight: 600, color: "var(--text-primary)", fontFamily: "var(--font-body)", textDecoration: "none" }}>{s.label}</Link>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: "12.5px", fontWeight: 600, color: "var(--text-primary)" }}>{money(s.amount)}</span>
              </div>
              <div style={{ fontSize: "11px", color: "var(--text-tertiary)", fontFamily: "var(--font-body)", lineHeight: 1.45 }}>{s.why}</div>
            </div>
          </li>
        ))}
      </ol>
      {middleDebts.length > 0 && (
        <p style={{ margin: "8px 0 0", fontSize: "11px", color: "var(--text-tertiary)", fontFamily: "var(--font-body)", lineHeight: 1.5 }}>
          {`${middleDebts.map((d) => `${d.label} (${d.rate}%)`).join(", ")}: in the 5–8% range, paying extra and investing come out about even, so either is reasonable.`}
        </p>
      )}
      {unratedDebts > 0 && (
        <p style={{ margin: "6px 0 0", fontSize: "11px", color: "var(--text-tertiary)", fontFamily: "var(--font-body)", lineHeight: 1.5 }}>
          {`${unratedDebts} debt${unratedDebts === 1 ? " has" : "s have"} no APR set, so ${unratedDebts === 1 ? "it isn't" : "they aren't"} factored in. `}
          <Link href="/planning?tab=balance" style={{ color: "var(--brand-blue)", fontWeight: 600 }}>Add rates on the Balance Sheet</Link>
        </p>
      )}
    </div>
  );
}
