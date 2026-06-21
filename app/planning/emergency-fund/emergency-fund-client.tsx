"use client";

import { useState, useMemo } from "react";
import Link from "next/link";

function fmt(n: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

const inputStyle: React.CSSProperties = { width: "100%", padding: "9px 11px", borderRadius: "8px", border: "1px solid var(--border-subtle)", background: "var(--bg-base)", color: "var(--text-primary)", fontSize: "14px", fontFamily: "var(--font-body)", outline: "none", boxSizing: "border-box" };
const labelStyle: React.CSSProperties = { display: "block", fontSize: "10px", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--text-tertiary)", marginBottom: "6px" };
const cardStyle: React.CSSProperties = { background: "var(--bg-card)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-lg, 14px)", padding: "16px 18px" };

const STABILITY: { key: string; label: string; months: number; note: string }[] = [
  { key: "stable", label: "Very stable (dual income, secure job)", months: 3, note: "Two incomes or a hard-to-lose role — 3 months is a solid floor." },
  { key: "normal", label: "Typical single income", months: 6, note: "The standard target for most people: 6 months of essentials." },
  { key: "variable", label: "Variable / self-employed / 1 income + kids", months: 9, note: "Irregular income or sole earner with dependents — lean toward 9–12 months." },
];

export default function EmergencyFundClient({
  monthlyExpenses, liquidAssets,
}: {
  monthlyExpenses: number; liquidAssets: number;
}) {
  const [essentials, setEssentials] = useState<number>(monthlyExpenses);
  const [current, setCurrent] = useState<number>(liquidAssets);
  const [stabilityKey, setStabilityKey] = useState<string>("normal");
  const [monthly, setMonthly] = useState<number>(0);

  const stability = STABILITY.find((s) => s.key === stabilityKey) ?? STABILITY[1];

  const calc = useMemo(() => {
    const target = essentials * stability.months;
    const gap = Math.max(0, target - current);
    const monthsCovered = essentials > 0 ? current / essentials : 0;
    const pct = target > 0 ? Math.min(100, (current / target) * 100) : 0;
    const monthsToFull = gap > 0 && monthly > 0 ? Math.ceil(gap / monthly) : gap <= 0 ? 0 : null;
    return { target, gap, monthsCovered, pct, monthsToFull };
  }, [essentials, current, stability.months, monthly]);

  const status = calc.gap <= 0 ? "funded" : calc.monthsCovered >= 1 ? "building" : "thin";
  const statusColor = status === "funded" ? "var(--green)" : status === "building" ? "var(--amber)" : "var(--red)";

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", color: "var(--text-primary)", fontFamily: "var(--font-body)" }}>
      <div style={{ padding: "12px 24px", borderBottom: "1px solid var(--border-subtle)", background: "var(--bg-base)", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "3px" }}>
          <Link href="/planning?tab=events" style={{ display: "flex", alignItems: "center", gap: "5px", fontSize: "12px", color: "var(--text-muted)", textDecoration: "none" }}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M10 3L5 8l5 5" strokeLinecap="round" strokeLinejoin="round" /></svg>
            Planning
          </Link>
          <span style={{ color: "var(--border)" }}>/</span>
          <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)" }}>Emergency Fund</span>
        </div>
        <div style={{ display: "flex", alignItems: "baseline", gap: "10px" }}>
          <span style={{ fontSize: "16px", fontWeight: 700 }}>Emergency Fund Planner</span>
          <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>The cushion that keeps a shock from derailing the plan</span>
        </div>
      </div>

      <div className="bt-page-content" style={{ flex: 1, overflowY: "auto", padding: "20px 24px 80px", display: "flex", flexDirection: "column", gap: "16px", maxWidth: "760px" }}>

        {/* Inputs */}
        <div style={cardStyle}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "14px" }}>
            <div><label style={labelStyle}>Essential expenses / mo</label><input style={inputStyle} type="number" min="0" value={essentials || ""} onChange={(e) => setEssentials(Number(e.target.value) || 0)} /></div>
            <div><label style={labelStyle}>Cash saved now</label><input style={inputStyle} type="number" min="0" value={current || ""} onChange={(e) => setCurrent(Number(e.target.value) || 0)} /></div>
            <div><label style={labelStyle}>Saving / month</label><input style={inputStyle} type="number" min="0" value={monthly || ""} onChange={(e) => setMonthly(Number(e.target.value) || 0)} placeholder="0" /></div>
          </div>
          <div style={{ marginTop: "14px" }}>
            <label style={labelStyle}>Your situation</label>
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              {STABILITY.map((s) => (
                <button key={s.key} type="button" onClick={() => setStabilityKey(s.key)}
                  style={{ textAlign: "left", padding: "9px 12px", borderRadius: "8px", cursor: "pointer", fontSize: "12px", fontFamily: "var(--font-body)",
                    border: `1px solid ${stabilityKey === s.key ? "var(--brand-blue, #2563eb)" : "var(--border-subtle)"}`,
                    background: stabilityKey === s.key ? "rgba(37,99,235,0.1)" : "var(--bg-base)",
                    color: stabilityKey === s.key ? "var(--text-primary)" : "var(--text-secondary)" }}>
                  <strong>{s.months} months</strong> — {s.label}
                </button>
              ))}
            </div>
          </div>
          <p style={{ fontSize: "11px", color: "var(--text-tertiary)", marginTop: "10px", lineHeight: 1.5 }}>Use essential expenses (housing, food, utilities, insurance, minimum debt payments) — not your full budget. In a real emergency the discretionary spending stops.</p>
        </div>

        {/* Verdict */}
        <div style={cardStyle}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "10px", flexWrap: "wrap", gap: "8px" }}>
            <span style={{ fontFamily: "var(--font-display)", fontSize: "13px", fontWeight: 700 }}>Target: {fmt(calc.target)}</span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: "12px", color: statusColor }}>{calc.monthsCovered.toFixed(1)} months covered</span>
          </div>
          <div style={{ height: "10px", borderRadius: "5px", background: "var(--surface-008, rgba(255,255,255,0.06))", overflow: "hidden", marginBottom: "12px" }}>
            <div style={{ height: "100%", borderRadius: "5px", background: statusColor, width: `${calc.pct}%`, transition: "width 0.6s cubic-bezier(0.16,1,0.3,1)" }} />
          </div>
          <div style={{ padding: "10px 12px", borderRadius: "10px", background: status === "funded" ? "rgba(34,197,94,0.08)" : status === "building" ? "rgba(245,158,11,0.08)" : "rgba(239,68,68,0.08)", border: `1px solid ${status === "funded" ? "rgba(34,197,94,0.18)" : status === "building" ? "rgba(245,158,11,0.18)" : "rgba(239,68,68,0.18)"}`, fontSize: "12px", color: "var(--text-secondary)", lineHeight: 1.55 }}>
            {status === "funded"
              ? `Fully funded — you have ${calc.monthsCovered.toFixed(1)} months in reserve. Any excess above ${fmt(calc.target)} is better invested than sitting in cash.`
              : `You're ${fmt(calc.gap)} short of your ${stability.months}-month target. ${calc.monthsToFull != null ? `Saving ${fmt(monthly)}/mo, you'll be fully funded in ${calc.monthsToFull} month${calc.monthsToFull === 1 ? "" : "s"}.` : "Set a monthly amount to see how fast you'll get there."} ${status === "thin" ? "Building even one month first is the single best protection for the rest of your plan." : ""}`}
          </div>
          <p style={{ fontSize: "11px", color: "var(--text-tertiary)", marginTop: "10px", lineHeight: 1.5 }}>Keep it in a high-yield savings or money-market account — liquid and separate from spending, but still earning. {stability.note}</p>
        </div>
      </div>
    </div>
  );
}
