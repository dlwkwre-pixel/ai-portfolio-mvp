"use client";

import { computeIdleCash, type RatedAccount } from "@/lib/planning/money-priorities";
import type { CashBenchmark } from "@/lib/market-data/treasury";

// Idle cash: cash above your emergency fund plus a month of spending, and what it would
// earn at today's 3-month Treasury rate instead of where it sits. Hidden when there's
// nothing meaningful to say.

export default function IdleCashCard({
  cashAccounts, monthlySpend, emergencyMonths, benchmark, isPrivate,
}: {
  cashAccounts: RatedAccount[];
  monthlySpend: number;
  emergencyMonths: number;
  benchmark: CashBenchmark | null;
  isPrivate: boolean;
}) {
  if (!benchmark) return null;
  const idle = computeIdleCash({ cashAccounts, monthlySpend, emergencyMonths, benchmarkPct: benchmark.ratePct });
  if (!idle || idle.excess < 500) return null;
  const money = (n: number) => (isPrivate ? "••••" : `$${Math.round(n).toLocaleString()}`);

  return (
    <div className="bso-z" style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-lg)", padding: "16px 20px", marginBottom: "10px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "8px", flexWrap: "wrap" }}>
        <span style={{ fontSize: "var(--text-sm)", fontWeight: 700, color: "var(--text-primary)", fontFamily: "var(--font-body)" }}>Idle cash</span>
        <span style={{ fontSize: "var(--text-xs)", color: "var(--text-tertiary)", fontFamily: "var(--font-body)" }}>
          {`3-month Treasury: `}<span style={{ fontFamily: "var(--font-mono)", color: "var(--text-secondary)" }}>{`${benchmark.ratePct.toFixed(2)}%`}</span>
        </span>
      </div>
      <p style={{ margin: "6px 0 0", fontSize: "var(--text-sm)", color: "var(--text-secondary)", fontFamily: "var(--font-body)", lineHeight: 1.55 }}>
        {"You have "}<strong style={{ fontFamily: "var(--font-mono)", color: "var(--text-primary)" }}>{money(idle.excess)}</strong>
        {` more in cash than your emergency fund plus a month of spending (${money(idle.keep)}).`}
        {idle.alreadyCompetitive
          ? " It's already earning close to the going rate for safe cash, so there's little to gain by moving it."
          : <>
              {" At today's rate it could earn about "}
              <strong style={{ fontFamily: "var(--font-mono)", color: "var(--green)" }}>{`${money(idle.extraPerYear)} more a year`}</strong>
              {" in a high-yield savings account, money market fund, or T-bills, or it could be invested for the long term."}
            </>}
      </p>
      {!idle.alreadyCompetitive && idle.fromAccounts.length > 0 && (
        <div style={{ marginTop: "8px", display: "flex", flexDirection: "column", gap: "3px" }}>
          {idle.fromAccounts.slice(0, 3).map((a) => (
            <div key={a.label} style={{ display: "flex", justifyContent: "space-between", gap: "10px", fontSize: "var(--text-xs)", fontFamily: "var(--font-body)", color: "var(--text-tertiary)" }}>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{`${a.label} · ${a.rate === null ? "no APY set" : `${a.rate}% APY`}`}</span>
              <span style={{ fontFamily: "var(--font-mono)", color: "var(--text-secondary)", flexShrink: 0 }}>{money(a.amount)}</span>
            </div>
          ))}
        </div>
      )}
      {idle.unratedCount > 0 && (
        <p style={{ margin: "8px 0 0", fontSize: "var(--text-2xs)", color: "var(--text-tertiary)", fontFamily: "var(--font-body)", lineHeight: 1.5 }}>
          {`${idle.unratedCount} cash account${idle.unratedCount === 1 ? " has" : "s have"} no APY set and ${idle.unratedCount === 1 ? "is" : "are"} assumed to earn about 0%. Tap "+ APY" next to ${idle.unratedCount === 1 ? "it" : "them"} below to sharpen this.`}
        </p>
      )}
    </div>
  );
}
