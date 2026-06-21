"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import AddToPlanButton from "@/app/planning/add-to-plan-button";

function fmt(n: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

const inputStyle: React.CSSProperties = { width: "100%", padding: "9px 11px", borderRadius: "8px", border: "1px solid var(--border-subtle)", background: "var(--bg-base)", color: "var(--text-primary)", fontSize: "14px", fontFamily: "var(--font-body)", outline: "none", boxSizing: "border-box" };
const labelStyle: React.CSSProperties = { display: "block", fontSize: "10px", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--text-tertiary)", marginBottom: "6px" };
const cardStyle: React.CSSProperties = { background: "var(--bg-card)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-lg, 14px)", padding: "16px 18px" };

export default function MedicalClient({ monthlyIncome, hsaBalance }: { monthlyIncome: number; hsaBalance: number }) {
  const [oopMax, setOopMax] = useState<number>(9000);
  const [estimatedBills, setEstimatedBills] = useState<number>(60000);
  const [hsa, setHsa] = useState<number>(hsaBalance);
  const [weeksOff, setWeeksOff] = useState<number>(8);
  const [coveragePct, setCoveragePct] = useState<number>(0); // % of income covered during leave (STD/PTO)
  const [income, setIncome] = useState<number>(monthlyIncome);

  const calc = useMemo(() => {
    // In-network, you pay up to your out-of-pocket maximum no matter how large the bills.
    const yourMedical = Math.min(Math.max(0, estimatedBills), Math.max(0, oopMax));
    const hsaOffset = Math.min(hsa, yourMedical);
    const netMedical = Math.max(0, yourMedical - hsaOffset);
    const weeklyIncome = (income * 12) / 52;
    const incomeLost = weeksOff * weeklyIncome * (1 - coveragePct / 100);
    const totalImpact = netMedical + incomeLost;
    const cushionMonths = income > 0 ? totalImpact / income : 0;
    return { yourMedical, hsaOffset, netMedical, incomeLost, totalImpact, cushionMonths };
  }, [oopMax, estimatedBills, hsa, weeksOff, coveragePct, income]);

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", color: "var(--text-primary)", fontFamily: "var(--font-body)" }}>
      <div style={{ padding: "12px 24px", borderBottom: "1px solid var(--border-subtle)", background: "var(--bg-base)", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "3px" }}>
          <Link href="/planning?tab=events" style={{ display: "flex", alignItems: "center", gap: "5px", fontSize: "12px", color: "var(--text-muted)", textDecoration: "none" }}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M10 3L5 8l5 5" strokeLinecap="round" strokeLinejoin="round" /></svg>
            Planning
          </Link>
          <span style={{ color: "var(--border)" }}>/</span>
          <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)" }}>Major Medical</span>
        </div>
        <div style={{ display: "flex", alignItems: "baseline", gap: "10px" }}>
          <span style={{ fontSize: "16px", fontWeight: 700 }}>Major Medical Planner</span>
          <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>What a serious health event would really cost you</span>
        </div>
      </div>

      <div className="bt-page-content" style={{ flex: 1, overflowY: "auto", padding: "20px 24px 80px", display: "flex", flexDirection: "column", gap: "16px", maxWidth: "760px" }}>

        {/* Inputs */}
        <div style={cardStyle}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "14px" }}>
            <div><label style={labelStyle}>Plan out-of-pocket max</label><input style={inputStyle} type="number" min="0" value={oopMax || ""} onChange={(e) => setOopMax(Number(e.target.value) || 0)} /></div>
            <div><label style={labelStyle}>Estimated total bills</label><input style={inputStyle} type="number" min="0" value={estimatedBills || ""} onChange={(e) => setEstimatedBills(Number(e.target.value) || 0)} /></div>
            <div><label style={labelStyle}>HSA / FSA balance</label><input style={inputStyle} type="number" min="0" value={hsa || ""} onChange={(e) => setHsa(Number(e.target.value) || 0)} /></div>
            <div><label style={labelStyle}>Weeks unable to work</label><input style={inputStyle} type="number" min="0" value={weeksOff || ""} onChange={(e) => setWeeksOff(Number(e.target.value) || 0)} /></div>
            <div><label style={labelStyle}>Income covered in leave (%)</label><input style={inputStyle} type="number" min="0" max="100" value={coveragePct || ""} onChange={(e) => setCoveragePct(Number(e.target.value) || 0)} placeholder="STD / PTO" /></div>
            <div><label style={labelStyle}>Monthly income</label><input style={inputStyle} type="number" min="0" value={income || ""} onChange={(e) => setIncome(Number(e.target.value) || 0)} /></div>
          </div>
          <p style={{ fontSize: "11px", color: "var(--text-tertiary)", marginTop: "10px", lineHeight: 1.5 }}>For in-network care, your plan&apos;s out-of-pocket maximum caps what you pay in a year — no matter how large the bills. The bigger risk for most people is the income lost while recovering, not the medical bill itself.</p>
        </div>

        {/* Verdict */}
        <div style={cardStyle}>
          <div style={{ display: "flex", alignItems: "baseline", gap: "10px", marginBottom: "14px" }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: "30px", fontWeight: 700, color: "var(--brand-blue, #2563eb)" }}>{fmt(Math.round(calc.totalImpact))}</span>
            <span style={{ fontSize: "12px", color: "var(--text-tertiary)" }}>total hit ({calc.cushionMonths.toFixed(1)} months of income)</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "12px" }}>
            {([
              ["Medical (capped at OOP max)", calc.yourMedical, ""],
              ["Less HSA / FSA", -calc.hsaOffset, ""],
              ["Lost income while recovering", calc.incomeLost, `${weeksOff} wks${coveragePct > 0 ? `, ${coveragePct}% covered` : ""}`],
            ] as [string, number, string][]).filter(([, v]) => v !== 0).map(([label, v, sub]) => (
              <div key={label} style={{ display: "flex", justifyContent: "space-between", gap: "10px", color: "var(--text-secondary)" }}>
                <span>{label}{sub && <span style={{ color: "var(--text-muted)" }}> · {sub}</span>}</span>
                <span style={{ fontFamily: "var(--font-mono)", color: v < 0 ? "var(--green)" : "var(--text-primary)" }}>{v < 0 ? "−" : ""}{fmt(Math.abs(Math.round(v)))}</span>
              </div>
            ))}
            <div style={{ display: "flex", justifyContent: "space-between", gap: "10px", borderTop: "1px solid var(--border-subtle)", paddingTop: "6px", marginTop: "2px", fontWeight: 700 }}>
              <span>Total exposure</span>
              <span style={{ fontFamily: "var(--font-mono)" }}>{fmt(Math.round(calc.totalImpact))}</span>
            </div>
          </div>
          <p style={{ fontSize: "11px", color: "var(--text-tertiary)", marginTop: "12px", lineHeight: 1.55 }}>
            Three levers shrink this: an emergency fund that covers the out-of-pocket max, an HSA (triple tax-advantaged, built for exactly this), and disability insurance to replace income during a long recovery. {calc.incomeLost > calc.netMedical ? "For you, the lost income is the bigger threat — check your disability coverage." : "Your OOP max is the main exposure — make sure your emergency fund covers it."}
          </p>
        </div>

        {/* Add to plan */}
        {calc.totalImpact > 0 && (
          <div style={cardStyle}>
            <span style={{ fontFamily: "var(--font-display)", fontSize: "13px", fontWeight: 700, display: "block", marginBottom: "10px" }}>Stress-test your plan</span>
            <AddToPlanButton
              label="Major medical event"
              category="other"
              amountImpact={-Math.round(calc.totalImpact)}
              note={`Drops a ${fmt(Math.round(calc.totalImpact))} shock into a future year to see whether your plan absorbs it. A planning stress test, not a prediction.`}
            />
          </div>
        )}
      </div>
    </div>
  );
}
