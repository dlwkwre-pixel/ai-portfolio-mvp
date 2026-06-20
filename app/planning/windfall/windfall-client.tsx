"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import AddToPlanButton from "@/app/planning/add-to-plan-button";

function fmt(n: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

type Allocation = {
  key: string;
  label: string;
  amount: number;
  color: string;
  rationale: string;
};

const inputStyle: React.CSSProperties = { width: "100%", padding: "9px 11px", borderRadius: "8px", border: "1px solid var(--border-subtle)", background: "var(--bg-base)", color: "var(--text-primary)", fontSize: "14px", fontFamily: "var(--font-body)", outline: "none", boxSizing: "border-box" };
const labelStyle: React.CSSProperties = { display: "block", fontSize: "10px", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--text-tertiary)", marginBottom: "6px" };
const cardStyle: React.CSSProperties = { background: "var(--bg-card)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-lg, 14px)", padding: "16px 18px" };

const SOURCES = ["Bonus", "Tax refund", "Inheritance", "RSU / stock vest", "Gift", "Other"];

export default function WindfallClient({
  monthlyExpenses, highInterestDebt, liquidAssets,
}: {
  monthlyExpenses: number; highInterestDebt: number; liquidAssets: number;
}) {
  const [amount, setAmount] = useState<number>(10000);
  const [source, setSource] = useState<string>("Bonus");
  const [emergencyTargetMonths, setEmergencyTargetMonths] = useState<number>(6);

  const rec = useMemo<Allocation[]>(() => {
    let remaining = Math.max(0, amount);
    const out: Allocation[] = [];

    // 1. Emergency starter — get to 1 month of expenses if below
    const oneMonth = monthlyExpenses;
    const starterGap = Math.max(0, oneMonth - liquidAssets);
    if (starterGap > 0 && remaining > 0) {
      const a = Math.min(remaining, starterGap);
      out.push({ key: "starter", label: "Emergency starter", amount: a, color: "oklch(0.78 0.16 70)", rationale: "Get to one month of expenses in cash before anything else." });
      remaining -= a;
    }

    // 2. High-interest debt
    if (highInterestDebt > 0 && remaining > 0) {
      const a = Math.min(remaining, highInterestDebt);
      out.push({ key: "debt", label: "High-interest debt", amount: a, color: "oklch(0.70 0.19 25)", rationale: "Paying off ~20% APR debt is a guaranteed, tax-free return no investment can match." });
      remaining -= a;
    }

    // 3. Emergency fund to target
    const targetCash = monthlyExpenses * emergencyTargetMonths;
    const afterStarter = liquidAssets + (out.find((o) => o.key === "starter")?.amount ?? 0);
    const efGap = Math.max(0, targetCash - afterStarter);
    if (efGap > 0 && remaining > 0) {
      const a = Math.min(remaining, efGap);
      out.push({ key: "ef", label: `Emergency fund (${emergencyTargetMonths} mo)`, amount: a, color: "oklch(0.72 0.15 200)", rationale: `Brings your cash cushion to ${emergencyTargetMonths} months of expenses so a shock won't force you to sell investments.` });
      remaining -= a;
    }

    // 4. Invest the rest
    if (remaining > 0) {
      out.push({ key: "invest", label: "Invest", amount: remaining, color: "oklch(0.72 0.19 145)", rationale: "With debt handled and a cushion in place, the rest compounds best in the market." });
    }

    return out;
  }, [amount, monthlyExpenses, highInterestDebt, liquidAssets, emergencyTargetMonths]);

  const total = rec.reduce((s, r) => s + r.amount, 0);

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", color: "var(--text-primary)", fontFamily: "var(--font-body)" }}>
      {/* Header */}
      <div style={{ padding: "12px 24px", borderBottom: "1px solid var(--border-subtle)", background: "var(--bg-base)", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "3px" }}>
          <Link href="/planning?tab=events" style={{ display: "flex", alignItems: "center", gap: "5px", fontSize: "12px", color: "var(--text-muted)", textDecoration: "none" }}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M10 3L5 8l5 5" strokeLinecap="round" strokeLinejoin="round" /></svg>
            Planning
          </Link>
          <span style={{ color: "var(--border)" }}>/</span>
          <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)" }}>Windfall</span>
        </div>
        <div style={{ display: "flex", alignItems: "baseline", gap: "10px" }}>
          <span style={{ fontSize: "16px", fontWeight: 700 }}>Windfall Planner</span>
          <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>Put a lump sum to work the smart way</span>
        </div>
      </div>

      {/* Body */}
      <div className="bt-page-content" style={{ flex: 1, overflowY: "auto", padding: "20px 24px 80px", display: "flex", flexDirection: "column", gap: "16px", maxWidth: "760px" }}>

        {/* Inputs */}
        <div style={cardStyle}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "16px" }}>
            <div style={{ flex: "1 1 160px" }}>
              <label style={labelStyle}>Windfall amount</label>
              <input style={inputStyle} type="number" min="0" value={amount || ""} onChange={(e) => setAmount(Number(e.target.value))} placeholder="10000" />
            </div>
            <div style={{ flex: "1 1 140px" }}>
              <label style={labelStyle}>Source</label>
              <select style={inputStyle} value={source} onChange={(e) => setSource(e.target.value)}>
                {SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div style={{ flex: "0 1 150px" }}>
              <label style={labelStyle}>Emergency target</label>
              <select style={inputStyle} value={emergencyTargetMonths} onChange={(e) => setEmergencyTargetMonths(Number(e.target.value))}>
                {[3, 4, 5, 6, 9, 12].map((m) => <option key={m} value={m}>{m} months</option>)}
              </select>
            </div>
          </div>
          <div style={{ display: "flex", gap: "18px", flexWrap: "wrap", marginTop: "14px", fontSize: "11px", color: "var(--text-tertiary)" }}>
            <span>Monthly expenses: <strong style={{ color: "var(--text-secondary)" }}>{fmt(monthlyExpenses)}</strong></span>
            <span>High-interest debt: <strong style={{ color: "var(--text-secondary)" }}>{fmt(highInterestDebt)}</strong></span>
            <span>Liquid cash: <strong style={{ color: "var(--text-secondary)" }}>{fmt(liquidAssets)}</strong></span>
          </div>
        </div>

        {amount > 0 && (
          <>
            {/* Stacked allocation bar */}
            <div style={cardStyle}>
              <span style={{ fontFamily: "var(--font-display)", fontSize: "13px", fontWeight: 700, display: "block", marginBottom: "12px" }}>Recommended Split for {fmt(amount)}</span>
              <div style={{ display: "flex", height: "12px", borderRadius: "6px", overflow: "hidden", background: "var(--bg-elevated, rgba(255,255,255,0.06))", marginBottom: "16px" }}>
                {rec.map((r) => (
                  <div key={r.key} style={{ width: `${total > 0 ? (r.amount / total) * 100 : 0}%`, background: r.color }} title={`${r.label}: ${fmt(r.amount)}`} />
                ))}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                {rec.map((r) => (
                  <div key={r.key} style={{ display: "flex", gap: "12px", alignItems: "flex-start" }}>
                    <span style={{ width: "10px", height: "10px", borderRadius: "3px", background: r.color, flexShrink: 0, marginTop: "3px" }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: "10px", alignItems: "baseline" }}>
                        <span style={{ fontSize: "13px", fontWeight: 600 }}>{r.label}</span>
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: "14px", fontWeight: 700 }}>{fmt(r.amount)}</span>
                      </div>
                      <div style={{ fontSize: "11px", color: "var(--text-tertiary)", lineHeight: 1.5, marginTop: "2px" }}>
                        {r.rationale} <span style={{ color: "var(--text-muted)" }}>· {total > 0 ? Math.round((r.amount / total) * 100) : 0}%</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Add to plan — only meaningful for an expected FUTURE windfall */}
            <div style={cardStyle}>
              <span style={{ fontFamily: "var(--font-display)", fontSize: "13px", fontWeight: 700, display: "block", marginBottom: "10px" }}>Expecting this in the future?</span>
              <AddToPlanButton
                label={`${source} windfall`}
                category="windfall"
                amountImpact={amount}
                note="If this is a future windfall (bonus, vesting, inheritance), add it so your forecast reflects the inflow. Skip if you already have the cash."
              />
            </div>

            {/* Note */}
            <p style={{ fontSize: "11px", color: "var(--text-tertiary)", lineHeight: 1.6, margin: 0 }}>
              This follows the standard waterfall: a one-month cash starter, then high-interest debt (a guaranteed return), then your full emergency fund, then investing. If you have employer-matched retirement contributions you aren&apos;t maxing, capture that match before the &quot;Invest&quot; bucket — it&apos;s free money.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
