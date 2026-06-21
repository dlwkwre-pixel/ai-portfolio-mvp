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

export default function BusinessClient({ liquidAssets, currentMonthlyIncome }: { liquidAssets: number; currentMonthlyIncome: number }) {
  const [startupCapital, setStartupCapital] = useState<number>(40000);
  const [monthlyBurn, setMonthlyBurn] = useState<number>(8000);
  const [revenueTarget, setRevenueTarget] = useState<number>(15000);
  const [rampMonths, setRampMonths] = useState<number>(12);
  const [forgoneSalary, setForgoneSalary] = useState<number>(currentMonthlyIncome);
  const [cashAvailable, setCashAvailable] = useState<number>(liquidAssets);

  const calc = useMemo(() => {
    const HORIZON = 72;
    let cash = cashAvailable - startupCapital;
    let lowest = cash;
    let breakevenMonth: number | null = null;
    let replacementMonth: number | null = null;
    let runwayOutMonth: number | null = null;
    let cumOperatingLoss = 0, deepestHole = 0;
    for (let m = 1; m <= HORIZON; m++) {
      const revenue = rampMonths > 0 ? Math.min(1, m / rampMonths) * revenueTarget : revenueTarget;
      const profit = revenue - monthlyBurn;
      if (breakevenMonth == null && profit >= 0) breakevenMonth = m;
      if (replacementMonth == null && profit >= forgoneSalary) replacementMonth = m;
      cumOperatingLoss += Math.min(0, profit);
      deepestHole = Math.min(deepestHole, cumOperatingLoss);
      cash += profit;
      lowest = Math.min(lowest, cash);
      if (runwayOutMonth == null && cash < 0) runwayOutMonth = m;
    }
    const steadyProfit = revenueTarget - monthlyBurn;
    // Cash you must have on hand: startup + the deepest cumulative operating loss before profitability.
    const cashToSurvive = startupCapital + Math.abs(deepestHole);
    return { breakevenMonth, replacementMonth, runwayOutMonth, steadyProfit, cashToSurvive, lowest };
  }, [startupCapital, monthlyBurn, revenueTarget, rampMonths, forgoneSalary, cashAvailable]);

  const survives = calc.runwayOutMonth == null;
  const steadyDeltaAnnual = Math.round((calc.steadyProfit - forgoneSalary) * 12);

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", color: "var(--text-primary)", fontFamily: "var(--font-body)" }}>
      <div style={{ padding: "12px 24px", borderBottom: "1px solid var(--border-subtle)", background: "var(--bg-base)", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "3px" }}>
          <Link href="/planning?tab=events" style={{ display: "flex", alignItems: "center", gap: "5px", fontSize: "12px", color: "var(--text-muted)", textDecoration: "none" }}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M10 3L5 8l5 5" strokeLinecap="round" strokeLinejoin="round" /></svg>
            Planning
          </Link>
          <span style={{ color: "var(--border)" }}>/</span>
          <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)" }}>Business</span>
        </div>
        <div style={{ display: "flex", alignItems: "baseline", gap: "10px" }}>
          <span style={{ fontSize: "16px", fontWeight: 700 }}>Business Launch Planner</span>
          <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>Runway, breakeven, and the real cost of going out on your own</span>
        </div>
      </div>

      <div className="bt-page-content" style={{ flex: 1, overflowY: "auto", padding: "20px 24px 80px", display: "flex", flexDirection: "column", gap: "16px", maxWidth: "760px" }}>

        {/* Inputs */}
        <div style={cardStyle}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "14px" }}>
            <div><label style={labelStyle}>Startup capital</label><input style={inputStyle} type="number" min="0" value={startupCapital || ""} onChange={(e) => setStartupCapital(Number(e.target.value) || 0)} /></div>
            <div><label style={labelStyle}>Monthly burn (costs)</label><input style={inputStyle} type="number" min="0" value={monthlyBurn || ""} onChange={(e) => setMonthlyBurn(Number(e.target.value) || 0)} /></div>
            <div><label style={labelStyle}>Revenue at steady state / mo</label><input style={inputStyle} type="number" min="0" value={revenueTarget || ""} onChange={(e) => setRevenueTarget(Number(e.target.value) || 0)} /></div>
            <div><label style={labelStyle}>Months to ramp</label><input style={inputStyle} type="number" min="0" value={rampMonths || ""} onChange={(e) => setRampMonths(Number(e.target.value) || 0)} /></div>
            <div><label style={labelStyle}>Salary you give up / mo</label><input style={inputStyle} type="number" min="0" value={forgoneSalary || ""} onChange={(e) => setForgoneSalary(Number(e.target.value) || 0)} /></div>
            <div><label style={labelStyle}>Cash you can risk</label><input style={inputStyle} type="number" min="0" value={cashAvailable || ""} onChange={(e) => setCashAvailable(Number(e.target.value) || 0)} /></div>
          </div>
          <p style={{ fontSize: "11px", color: "var(--text-tertiary)", marginTop: "10px", lineHeight: 1.5 }}>Revenue ramps linearly to your steady-state target over the months you set. &quot;Salary you give up&quot; is the paycheck you&apos;re walking away from — the true bar the business has to clear.</p>
        </div>

        {/* Verdict */}
        <div style={cardStyle}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: "14px 10px" }}>
            <Metric label="Breakeven" value={calc.breakevenMonth != null ? `Month ${calc.breakevenMonth}` : "Never"} sub="revenue ≥ costs" accent={calc.breakevenMonth != null && calc.breakevenMonth <= 18 ? "var(--green)" : "var(--amber)"} />
            <Metric label="Cash to survive" value={fmt(Math.round(calc.cashToSurvive))} sub="startup + losses" accent={calc.cashToSurvive <= cashAvailable ? "var(--green)" : "var(--red)"} />
            <Metric label="Replaces salary" value={calc.replacementMonth != null ? `Month ${calc.replacementMonth}` : "Not in 6 yr"} sub="profit ≥ old pay" accent={calc.replacementMonth != null && calc.replacementMonth <= 36 ? "var(--green)" : "var(--amber)"} />
            <Metric label="Steady profit / mo" value={`${calc.steadyProfit >= 0 ? "+" : "−"}${fmt(Math.abs(Math.round(calc.steadyProfit)))}`} sub="at full ramp" accent={calc.steadyProfit >= 0 ? "var(--green)" : "var(--red)"} />
          </div>
          <div style={{ marginTop: "14px", padding: "10px 12px", borderRadius: "10px", background: survives && calc.cashToSurvive <= cashAvailable ? "rgba(34,197,94,0.08)" : "rgba(245,158,11,0.08)", border: `1px solid ${survives && calc.cashToSurvive <= cashAvailable ? "rgba(34,197,94,0.18)" : "rgba(245,158,11,0.18)"}`, fontSize: "12px", color: "var(--text-secondary)", lineHeight: 1.55 }}>
            {calc.steadyProfit < 0
              ? `At steady state this loses ${fmt(Math.abs(Math.round(calc.steadyProfit)))}/mo — the model never turns a profit. Revisit pricing, costs, or the revenue target before committing.`
              : calc.cashToSurvive > cashAvailable
              ? `You'd need about ${fmt(Math.round(calc.cashToSurvive))} to survive to profitability but have ${fmt(cashAvailable)} — a ${fmt(Math.round(calc.cashToSurvive - cashAvailable))} gap. Raise more, cut burn, or shorten the ramp before you leap.`
              : `Your ${fmt(cashAvailable)} covers the ${fmt(Math.round(calc.cashToSurvive))} needed to reach profitability${calc.breakevenMonth != null ? ` around month ${calc.breakevenMonth}` : ""}. Once ramped, the business ${calc.steadyProfit >= forgoneSalary ? `out-earns your old salary by ${fmt(Math.round(calc.steadyProfit - forgoneSalary))}/mo` : `still trails your old salary by ${fmt(Math.round(forgoneSalary - calc.steadyProfit))}/mo`}.`}
          </div>
          <p style={{ fontSize: "10px", color: "var(--text-tertiary)", marginTop: "10px", lineHeight: 1.5 }}>A simple deterministic model — real businesses are lumpier. Keep a personal emergency fund separate from the business runway, and don&apos;t risk money you can&apos;t afford to lose.</p>
        </div>

        {/* Add to plan */}
        {startupCapital > 0 && (
          <div style={cardStyle}>
            <span style={{ fontFamily: "var(--font-display)", fontSize: "13px", fontWeight: 700, display: "block", marginBottom: "10px" }}>Add to your plan</span>
            <AddToPlanButton
              label="Start a business"
              category="career"
              amountImpact={-Math.round(startupCapital)}
              recurringAnnual={steadyDeltaAnnual}
              note={`Models the ${fmt(Math.round(startupCapital))} startup cost and the long-run ${steadyDeltaAnnual >= 0 ? "+" : ""}${fmt(steadyDeltaAnnual)}/yr income change vs your salary once ramped. Conservative — it doesn't model the lean early months.`}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function Metric({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: string }) {
  return (
    <div>
      <div style={{ fontSize: "9px", color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "5px" }}>{label}</div>
      <div style={{ fontSize: "18px", fontWeight: 700, fontFamily: "var(--font-display)", letterSpacing: "-0.5px", color: accent ?? "var(--text-primary)", lineHeight: 1.1 }}>{value}</div>
      {sub && <div style={{ fontSize: "10px", color: "var(--text-tertiary)", marginTop: "5px" }}>{sub}</div>}
    </div>
  );
}
