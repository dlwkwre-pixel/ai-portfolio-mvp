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

export default function RentalClient({ liquidAssets }: { liquidAssets: number }) {
  const [price, setPrice] = useState<number>(350000);
  const [downPct, setDownPct] = useState<number>(25);
  const [rate, setRate] = useState<number>(7);
  const [termYears, setTermYears] = useState<number>(30);
  const [rent, setRent] = useState<number>(2600);
  const [vacancyPct, setVacancyPct] = useState<number>(6);
  const [propTaxAnnual, setPropTaxAnnual] = useState<number>(4200);
  const [insuranceAnnual, setInsuranceAnnual] = useState<number>(1600);
  const [maintenancePct, setMaintenancePct] = useState<number>(8); // % of rent
  const [mgmtPct, setMgmtPct] = useState<number>(8); // % of rent
  const [hoaMonthly, setHoaMonthly] = useState<number>(0);
  const [closingPct, setClosingPct] = useState<number>(3);

  const calc = useMemo(() => {
    const down = price * (downPct / 100);
    const loan = Math.max(0, price - down);
    const r = rate / 100 / 12;
    const n = termYears * 12;
    const mortgage = loan > 0 && r > 0 ? loan * r * Math.pow(1 + r, n) / (Math.pow(1 + r, n) - 1) : loan > 0 ? loan / n : 0;
    const closing = price * (closingPct / 100);
    const cashInvested = down + closing;

    const effectiveRent = rent * (1 - vacancyPct / 100);
    const opEx = propTaxAnnual / 12 + insuranceAnnual / 12 + rent * (maintenancePct / 100) + rent * (mgmtPct / 100) + hoaMonthly;
    const noiMonthly = effectiveRent - opEx; // before debt service
    const cashFlow = noiMonthly - mortgage; // after debt service
    const capRate = price > 0 ? (noiMonthly * 12) / price * 100 : 0;
    const cashOnCash = cashInvested > 0 ? (cashFlow * 12) / cashInvested * 100 : 0;
    const onePctRule = price > 0 ? (rent / price) * 100 : 0; // want >= 1%
    return { down, loan, mortgage, closing, cashInvested, effectiveRent, opEx, noiMonthly, cashFlow, capRate, cashOnCash, onePctRule };
  }, [price, downPct, rate, termYears, rent, vacancyPct, propTaxAnnual, insuranceAnnual, maintenancePct, mgmtPct, hoaMonthly, closingPct]);

  const positive = calc.cashFlow >= 0;

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", color: "var(--text-primary)", fontFamily: "var(--font-body)" }}>
      <div style={{ padding: "12px 24px", borderBottom: "1px solid var(--border-subtle)", background: "var(--bg-base)", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "3px" }}>
          <Link href="/planning?tab=events" style={{ display: "flex", alignItems: "center", gap: "5px", fontSize: "12px", color: "var(--text-muted)", textDecoration: "none" }}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M10 3L5 8l5 5" strokeLinecap="round" strokeLinejoin="round" /></svg>
            Planning
          </Link>
          <span style={{ color: "var(--border)" }}>/</span>
          <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)" }}>Rental Property</span>
        </div>
        <div style={{ display: "flex", alignItems: "baseline", gap: "10px" }}>
          <span style={{ fontSize: "16px", fontWeight: 700 }}>Rental Property Planner</span>
          <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>Cash flow, cap rate, and cash-on-cash on an investment property</span>
        </div>
      </div>

      <div className="bt-page-content" style={{ flex: 1, overflowY: "auto", padding: "20px 24px 80px", display: "flex", flexDirection: "column", gap: "16px", maxWidth: "760px" }}>

        {/* Purchase */}
        <div style={cardStyle}>
          <span style={{ fontFamily: "var(--font-display)", fontSize: "13px", fontWeight: 700, display: "block", marginBottom: "12px" }}>The deal</span>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "14px" }}>
            <div><label style={labelStyle}>Purchase price</label><input style={inputStyle} type="number" min="0" value={price || ""} onChange={(e) => setPrice(Number(e.target.value) || 0)} /></div>
            <div><label style={labelStyle}>Down payment (%)</label><input style={inputStyle} type="number" min="0" max="100" value={downPct || ""} onChange={(e) => setDownPct(Number(e.target.value) || 0)} /></div>
            <div><label style={labelStyle}>Interest rate (%)</label><input style={inputStyle} type="number" min="0" step="0.1" value={rate || ""} onChange={(e) => setRate(Number(e.target.value) || 0)} /></div>
            <div><label style={labelStyle}>Term (years)</label><input style={inputStyle} type="number" min="1" value={termYears || ""} onChange={(e) => setTermYears(Number(e.target.value) || 0)} /></div>
            <div><label style={labelStyle}>Monthly rent</label><input style={inputStyle} type="number" min="0" value={rent || ""} onChange={(e) => setRent(Number(e.target.value) || 0)} /></div>
            <div><label style={labelStyle}>Closing costs (%)</label><input style={inputStyle} type="number" min="0" step="0.5" value={closingPct || ""} onChange={(e) => setClosingPct(Number(e.target.value) || 0)} /></div>
          </div>
        </div>

        {/* Operating */}
        <div style={cardStyle}>
          <span style={{ fontFamily: "var(--font-display)", fontSize: "13px", fontWeight: 700, display: "block", marginBottom: "12px" }}>Operating costs</span>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "14px" }}>
            <div><label style={labelStyle}>Vacancy (%)</label><input style={inputStyle} type="number" min="0" max="100" value={vacancyPct || ""} onChange={(e) => setVacancyPct(Number(e.target.value) || 0)} /></div>
            <div><label style={labelStyle}>Property tax / yr</label><input style={inputStyle} type="number" min="0" value={propTaxAnnual || ""} onChange={(e) => setPropTaxAnnual(Number(e.target.value) || 0)} /></div>
            <div><label style={labelStyle}>Insurance / yr</label><input style={inputStyle} type="number" min="0" value={insuranceAnnual || ""} onChange={(e) => setInsuranceAnnual(Number(e.target.value) || 0)} /></div>
            <div><label style={labelStyle}>Maintenance (% rent)</label><input style={inputStyle} type="number" min="0" value={maintenancePct || ""} onChange={(e) => setMaintenancePct(Number(e.target.value) || 0)} /></div>
            <div><label style={labelStyle}>Management (% rent)</label><input style={inputStyle} type="number" min="0" value={mgmtPct || ""} onChange={(e) => setMgmtPct(Number(e.target.value) || 0)} /></div>
            <div><label style={labelStyle}>HOA / mo</label><input style={inputStyle} type="number" min="0" value={hoaMonthly || ""} onChange={(e) => setHoaMonthly(Number(e.target.value) || 0)} /></div>
          </div>
        </div>

        {/* Verdict */}
        <div style={cardStyle}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: "14px 10px" }}>
            <Metric label="Monthly cash flow" value={`${positive ? "+" : "−"}${fmt(Math.abs(Math.round(calc.cashFlow)))}`} sub="after mortgage" accent={positive ? "var(--green)" : "var(--red)"} />
            <Metric label="Cap rate" value={`${calc.capRate.toFixed(1)}%`} sub="NOI ÷ price" accent={calc.capRate >= 6 ? "var(--green)" : calc.capRate >= 4 ? "var(--amber)" : "var(--red)"} />
            <Metric label="Cash-on-cash" value={`${calc.cashOnCash.toFixed(1)}%`} sub={`on ${fmt(Math.round(calc.cashInvested))} in`} accent={calc.cashOnCash >= 8 ? "var(--green)" : calc.cashOnCash >= 5 ? "var(--amber)" : "var(--red)"} />
            <Metric label="Mortgage / mo" value={fmt(Math.round(calc.mortgage))} sub={`${downPct}% down`} />
          </div>
          <div style={{ marginTop: "14px", padding: "10px 12px", borderRadius: "10px", background: positive ? "rgba(34,197,94,0.08)" : "rgba(239,68,68,0.08)", border: `1px solid ${positive ? "rgba(34,197,94,0.18)" : "rgba(239,68,68,0.18)"}`, fontSize: "12px", color: "var(--text-secondary)", lineHeight: 1.55 }}>
            {positive
              ? `This property cash-flows ${fmt(Math.round(calc.cashFlow))}/mo (${fmt(Math.round(calc.cashFlow * 12))}/yr) after all costs and the mortgage, a ${calc.cashOnCash.toFixed(1)}% cash-on-cash return on the ${fmt(Math.round(calc.cashInvested))} you put in.`
              : `This property loses ${fmt(Math.abs(Math.round(calc.cashFlow)))}/mo after costs — you'd be betting on appreciation to come out ahead. Negative cash flow ties up capital and adds risk.`}
            {` The 1% rule check: rent is ${calc.onePctRule.toFixed(2)}% of price (${calc.onePctRule >= 1 ? "clears" : "below"} the 1% rule of thumb).`}
          </div>
          <p style={{ fontSize: "10px", color: "var(--text-tertiary)", marginTop: "10px", lineHeight: 1.5 }}>Excludes appreciation, principal paydown (equity you build), and depreciation tax benefits — all of which add to the real return. Cash flow is the safety margin; the rest is upside.</p>
        </div>

        {/* Add to plan */}
        {calc.cashInvested > 0 && (
          <div style={cardStyle}>
            <span style={{ fontFamily: "var(--font-display)", fontSize: "13px", fontWeight: 700, display: "block", marginBottom: "10px" }}>Add to your plan</span>
            <AddToPlanButton
              label="Rental property"
              category="other"
              amountImpact={-Math.round(calc.cashInvested)}
              recurringAnnual={Math.round(calc.cashFlow * 12)}
              note={`Models the ${fmt(Math.round(calc.cashInvested))} cash to close and the ${calc.cashFlow >= 0 ? "+" : ""}${fmt(Math.round(calc.cashFlow * 12))}/yr cash flow, so the property flows into your forecast. (Equity growth not included — this is conservative.)`}
            />
          </div>
        )}
        {liquidAssets > 0 && <p style={{ fontSize: "11px", color: "var(--text-tertiary)", margin: 0 }}>You have {fmt(liquidAssets)} in liquid cash — this deal needs {fmt(Math.round(calc.cashInvested))} to close.</p>}
      </div>
    </div>
  );
}

function Metric({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: string }) {
  return (
    <div>
      <div style={{ fontSize: "9px", color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "5px" }}>{label}</div>
      <div style={{ fontSize: "20px", fontWeight: 700, fontFamily: "var(--font-display)", letterSpacing: "-0.5px", color: accent ?? "var(--text-primary)", lineHeight: 1.1 }}>{value}</div>
      {sub && <div style={{ fontSize: "10px", color: "var(--text-tertiary)", marginTop: "5px" }}>{sub}</div>}
    </div>
  );
}
