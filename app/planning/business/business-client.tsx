"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import AddToPlanButton from "@/app/planning/add-to-plan-button";
import InfoTooltip from "@/app/components/info-tooltip";

function fmt(n: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}
function fmtSigned(n: number): string {
  return `${n < 0 ? "−" : "+"}${fmt(Math.abs(n))}`;
}

const inputStyle: React.CSSProperties = { width: "100%", padding: "9px 11px", borderRadius: "8px", border: "1px solid var(--border-subtle)", background: "var(--bg-base)", color: "var(--text-primary)", fontSize: "14px", fontFamily: "var(--font-body)", outline: "none", boxSizing: "border-box" };
const labelStyle: React.CSSProperties = { display: "flex", alignItems: "center", fontSize: "10px", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--text-tertiary)", marginBottom: "6px" };
const cardStyle: React.CSSProperties = { background: "var(--bg-card)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-lg, 14px)", padding: "16px 18px" };
const sectionTitle: React.CSSProperties = { fontFamily: "var(--font-display)", fontSize: "13px", fontWeight: 700, display: "flex", alignItems: "center", marginBottom: "12px" };

function HintDot({ text }: { text: string }) {
  return (
    <InfoTooltip text={text} align="start" width={230}>
      <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: "14px", height: "14px", borderRadius: "50%", marginLeft: "5px", cursor: "help", background: "rgba(63,174,74,0.12)", border: "1px solid rgba(63,174,74,0.3)", color: "var(--accent, #5fbf9a)", fontSize: "10px", fontWeight: 700 }}>?</span>
    </InfoTooltip>
  );
}

type SimParams = {
  startupCapital: number; monthlyBurn: number; revenueTarget: number; marginPct: number;
  rampMonths: number; growthPct: number; forgoneSalary: number; cashAvailable: number; taxRatePct: number;
};

type SimResult = {
  breakevenMonth: number | null; replacementMonth: number | null; runwayOutMonth: number | null;
  paybackMonth: number | null; steadyProfit: number; cashToSurvive: number; deepestHole: number;
  cum5yr: number; series: { month: number; cash: number }[]; lowestCash: number;
};

const HORIZON = 60; // 5 years

function simulate(p: SimParams): SimResult {
  let cash = p.cashAvailable - p.startupCapital;
  let lowestCash = cash;
  let breakevenMonth: number | null = null;
  let replacementMonth: number | null = null;
  let runwayOutMonth: number | null = null;
  let paybackMonth: number | null = null;
  let cumProfit = 0, cumOperating = 0, deepestHole = 0;
  const series: { month: number; cash: number }[] = [{ month: 0, cash }];
  const monthlyGrowth = Math.pow(1 + p.growthPct / 100, 1 / 12) - 1;

  for (let m = 1; m <= HORIZON; m++) {
    const rampFactor = p.rampMonths > 0 ? Math.min(1, m / p.rampMonths) : 1;
    const postRamp = m > p.rampMonths ? Math.pow(1 + monthlyGrowth, m - p.rampMonths) : 1;
    const revenue = rampFactor * p.revenueTarget * postRamp;
    const contribution = revenue * (p.marginPct / 100);
    const preTax = contribution - p.monthlyBurn;
    const tax = Math.max(0, preTax) * (p.taxRatePct / 100);
    const profit = preTax - tax;

    if (breakevenMonth == null && profit >= 0) breakevenMonth = m;
    if (replacementMonth == null && profit >= p.forgoneSalary) replacementMonth = m;
    cumOperating += Math.min(0, profit);
    deepestHole = Math.min(deepestHole, cumOperating);
    cumProfit += profit;
    if (paybackMonth == null && cumProfit >= p.startupCapital) paybackMonth = m;
    cash += profit;
    lowestCash = Math.min(lowestCash, cash);
    if (runwayOutMonth == null && cash < 0) runwayOutMonth = m;
    series.push({ month: m, cash });
  }

  const steadyContribution = p.revenueTarget * (p.marginPct / 100);
  const steadyPreTax = steadyContribution - p.monthlyBurn;
  const steadyProfit = steadyPreTax - Math.max(0, steadyPreTax) * (p.taxRatePct / 100);
  return {
    breakevenMonth, replacementMonth, runwayOutMonth, paybackMonth, steadyProfit,
    cashToSurvive: p.startupCapital + Math.abs(deepestHole), deepestHole,
    cum5yr: cumProfit, series, lowestCash,
  };
}

export default function BusinessClient({ liquidAssets, currentMonthlyIncome }: { liquidAssets: number; currentMonthlyIncome: number }) {
  const [startupCapital, setStartupCapital] = useState(40000);
  const [monthlyBurn, setMonthlyBurn] = useState(8000);
  const [revenueTarget, setRevenueTarget] = useState(15000);
  const [marginPct, setMarginPct] = useState(70);
  const [rampMonths, setRampMonths] = useState(12);
  const [growthPct, setGrowthPct] = useState(8);
  const [forgoneSalary, setForgoneSalary] = useState(currentMonthlyIncome || 6000);
  const [cashAvailable, setCashAvailable] = useState(liquidAssets || 50000);
  const [taxRatePct, setTaxRatePct] = useState(25);

  const base: SimParams = { startupCapital, monthlyBurn, revenueTarget, marginPct, rampMonths, growthPct, forgoneSalary, cashAvailable, taxRatePct };
  const calc = useMemo(() => simulate(base), [startupCapital, monthlyBurn, revenueTarget, marginPct, rampMonths, growthPct, forgoneSalary, cashAvailable, taxRatePct]);

  // Scenarios
  const conservative = useMemo(() => simulate({ ...base, revenueTarget: revenueTarget * 0.75, rampMonths: Math.round(rampMonths * 1.5) }), [base, revenueTarget, rampMonths]);
  const optimistic = useMemo(() => simulate({ ...base, revenueTarget: revenueTarget * 1.2, rampMonths: Math.max(1, Math.round(rampMonths * 0.8)) }), [base, revenueTarget, rampMonths]);

  const survives = calc.runwayOutMonth == null;
  const covered = calc.cashToSurvive <= cashAvailable;
  const steadyDeltaAnnual = Math.round((calc.steadyProfit - forgoneSalary) * 12);

  const grade = calc.steadyProfit < 0 ? { label: "Doesn't pencil", color: "var(--red)" }
    : !covered ? { label: "Underfunded", color: "var(--amber, #f59e0b)" }
    : calc.replacementMonth != null && calc.replacementMonth <= 36 ? { label: "Promising", color: "var(--green)" }
    : { label: "Workable", color: "var(--amber, #f59e0b)" };

  // vs staying employed: business cumulative profit vs salary you'd have earned (5yr)
  const employedCum = forgoneSalary * HORIZON;
  const businessVsEmployed = calc.cum5yr - employedCum;

  // Cash runway chart
  const chart = useMemo(() => {
    const cashVals = calc.series.map((s) => s.cash);
    const min = Math.min(...cashVals, 0), max = Math.max(...cashVals, cashAvailable);
    const range = max - min || 1;
    const W = 320, H = 120, pad = 6;
    const x = (i: number) => (i / (calc.series.length - 1)) * W;
    const y = (v: number) => H - pad - ((v - min) / range) * (H - 2 * pad);
    const line = calc.series.map((s, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(s.cash).toFixed(1)}`).join(" ");
    const zeroY = y(0);
    return { W, H, line, zeroY };
  }, [calc.series, cashAvailable]);

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
          <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>Runway, breakeven, 5-year P&amp;L, and the real cost of going out on your own</span>
        </div>
      </div>

      <div className="bt-page-content" style={{ flex: 1, overflowY: "auto", padding: "20px 24px 80px", display: "flex", flexDirection: "column", gap: "16px", maxWidth: "1000px", width: "100%", margin: "0 auto" }}>

        {/* Verdict hero */}
        <div style={{ ...cardStyle, background: `linear-gradient(135deg, color-mix(in srgb, ${grade.color} 8%, var(--bg-card)), var(--bg-card))`, border: `1px solid color-mix(in srgb, ${grade.color} 28%, transparent)` }}>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
            <div>
              <div style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: grade.color }}>{grade.label}</div>
              <div style={{ fontSize: "26px", fontWeight: 800, fontFamily: "var(--font-display)", letterSpacing: "-1px", color: "var(--text-primary)", lineHeight: 1.1, marginTop: "2px" }}>
                {calc.breakevenMonth != null ? `Breakeven month ${calc.breakevenMonth}` : "Never breaks even"}
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: "10px", color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Cash needed to survive</div>
              <div style={{ fontSize: "22px", fontWeight: 800, fontFamily: "var(--font-mono)", color: covered ? "var(--green)" : "var(--red)" }}>{fmt(Math.round(calc.cashToSurvive))}</div>
              <div style={{ fontSize: "10px", color: "var(--text-tertiary)" }}>you have {fmt(cashAvailable)}</div>
            </div>
          </div>
        </div>

        {/* Inputs */}
        <div style={cardStyle}>
          <span style={sectionTitle}>The plan</span>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "14px" }}>
            <div><label style={labelStyle}>Startup capital<HintDot text="One-time upfront cost to launch: equipment, legal, inventory, deposits." /></label><input style={inputStyle} type="number" min="0" value={startupCapital || ""} onChange={(e) => setStartupCapital(Number(e.target.value) || 0)} /></div>
            <div><label style={labelStyle}>Monthly fixed costs<HintDot text="Recurring overhead regardless of sales: rent, software, salaries, your own draw." /></label><input style={inputStyle} type="number" min="0" value={monthlyBurn || ""} onChange={(e) => setMonthlyBurn(Number(e.target.value) || 0)} /></div>
            <div><label style={labelStyle}>Steady revenue / mo</label><input style={inputStyle} type="number" min="0" value={revenueTarget || ""} onChange={(e) => setRevenueTarget(Number(e.target.value) || 0)} /></div>
            <div><label style={labelStyle}>Gross margin (%)<HintDot text="Share of each sale left after the direct cost of delivering it (COGS). Services ~80%, product/retail ~30-50%." /></label><input style={inputStyle} type="number" min="0" max="100" value={marginPct || ""} onChange={(e) => setMarginPct(Number(e.target.value) || 0)} /></div>
            <div><label style={labelStyle}>Months to ramp</label><input style={inputStyle} type="number" min="0" value={rampMonths || ""} onChange={(e) => setRampMonths(Number(e.target.value) || 0)} /></div>
            <div><label style={labelStyle}>Growth after ramp (%/yr)</label><input style={inputStyle} type="number" min="0" step="0.5" value={growthPct || ""} onChange={(e) => setGrowthPct(Number(e.target.value) || 0)} /></div>
            <div><label style={labelStyle}>Salary you give up / mo<HintDot text="The paycheck you walk away from — the true bar the business must clear to be worth it." /></label><input style={inputStyle} type="number" min="0" value={forgoneSalary || ""} onChange={(e) => setForgoneSalary(Number(e.target.value) || 0)} /></div>
            <div><label style={labelStyle}>Cash you can risk</label><input style={inputStyle} type="number" min="0" value={cashAvailable || ""} onChange={(e) => setCashAvailable(Number(e.target.value) || 0)} /></div>
            <div><label style={labelStyle}>Tax rate (%)</label><input style={inputStyle} type="number" min="0" max="50" value={taxRatePct || ""} onChange={(e) => setTaxRatePct(Number(e.target.value) || 0)} /></div>
          </div>
        </div>

        {/* Metrics */}
        <div style={cardStyle}>
          <span style={sectionTitle}>The numbers</span>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(118px, 1fr))", gap: "16px 12px" }}>
            <Metric label="Breakeven" value={calc.breakevenMonth != null ? `Mo ${calc.breakevenMonth}` : "Never"} hint="First month the business turns a monthly profit." accent={calc.breakevenMonth != null && calc.breakevenMonth <= 18 ? "var(--green)" : "var(--amber, #f59e0b)"} />
            <Metric label="Capital payback" value={calc.paybackMonth != null ? `Mo ${calc.paybackMonth}` : "5 yr+"} hint="When cumulative profit has repaid your startup capital." accent={calc.paybackMonth != null && calc.paybackMonth <= 36 ? "var(--green)" : "var(--amber, #f59e0b)"} />
            <Metric label="Replaces salary" value={calc.replacementMonth != null ? `Mo ${calc.replacementMonth}` : "5 yr+"} hint="When monthly profit exceeds the salary you gave up." accent={calc.replacementMonth != null && calc.replacementMonth <= 36 ? "var(--green)" : "var(--amber, #f59e0b)"} />
            <Metric label="Steady profit / mo" value={fmtSigned(Math.round(calc.steadyProfit))} hint="Monthly profit once fully ramped, after tax." accent={calc.steadyProfit >= 0 ? "var(--green)" : "var(--red)"} />
            <Metric label="Deepest hole" value={fmt(Math.round(Math.abs(calc.deepestHole)))} hint="The largest cumulative operating loss before profitability — the runway you must fund." />
            <Metric label="5-yr cumulative" value={fmtSigned(Math.round(calc.cum5yr))} hint="Total profit (after tax) over 5 years, net of the early losses." accent={calc.cum5yr >= 0 ? "var(--green)" : "var(--red)"} />
          </div>
        </div>

        {/* Runway chart */}
        <div style={cardStyle}>
          <span style={sectionTitle}>Cash runway — the valley of death<HintDot text="Your cash balance month by month. It dips as you fund losses, bottoms out, then climbs once you're profitable. If the line crosses zero, you run out of money first." /></span>
          <svg viewBox={`0 0 ${chart.W} ${chart.H}`} preserveAspectRatio="none" style={{ width: "100%", height: "120px", display: "block" }}>
            <line x1="0" y1={chart.zeroY} x2={chart.W} y2={chart.zeroY} stroke="rgba(239,68,68,0.4)" strokeWidth="1" strokeDasharray="3 3" />
            <path d={`${chart.line} L${chart.W},${chart.H} L0,${chart.H} Z`} fill={survives ? "rgba(34,197,94,0.08)" : "rgba(239,68,68,0.08)"} />
            <path d={chart.line} fill="none" stroke={survives ? "#22c55e" : "#ef4444"} strokeWidth="2" strokeLinejoin="round" />
          </svg>
          <div style={{ marginTop: "10px", padding: "10px 12px", borderRadius: "10px", background: survives && covered ? "rgba(34,197,94,0.08)" : "rgba(245,158,11,0.08)", border: `1px solid ${survives && covered ? "rgba(34,197,94,0.18)" : "rgba(245,158,11,0.18)"}`, fontSize: "12px", color: "var(--text-secondary)", lineHeight: 1.55 }}>
            {calc.steadyProfit < 0
              ? `At steady state this loses ${fmt(Math.abs(Math.round(calc.steadyProfit)))}/mo — the model never turns a profit. Fix pricing, margin, or costs before committing.`
              : !covered
              ? `You'd need ~${fmt(Math.round(calc.cashToSurvive))} to survive to profitability but have ${fmt(cashAvailable)} — a ${fmt(Math.round(calc.cashToSurvive - cashAvailable))} gap. Raise more, cut burn, or shorten the ramp.`
              : `Your ${fmt(cashAvailable)} covers the ${fmt(Math.round(calc.cashToSurvive))} runway needed${calc.breakevenMonth != null ? `, with breakeven around month ${calc.breakevenMonth}` : ""}. Cash bottoms at ${fmt(Math.round(calc.lowestCash))}.`}
          </div>
        </div>

        {/* Scenario comparison */}
        <div style={cardStyle}>
          <span style={sectionTitle}>If it goes slower (or faster)<HintDot text="The same plan under a conservative case (75% of revenue, 1.5× ramp) and an optimistic case (120% revenue, faster ramp). Plan for the conservative one." /></span>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "10px" }}>
            <ScenarioCard title="Conservative" tone="var(--red)" r={conservative} cashAvailable={cashAvailable} />
            <ScenarioCard title="Base case" tone="var(--accent, #5fbf9a)" r={calc} cashAvailable={cashAvailable} />
            <ScenarioCard title="Optimistic" tone="var(--green)" r={optimistic} cashAvailable={cashAvailable} />
          </div>
        </div>

        {/* vs employed */}
        <div style={cardStyle}>
          <span style={sectionTitle}>Business vs. staying employed (5 yr)</span>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            <div style={{ padding: "12px 14px", borderRadius: "10px", background: "rgba(63,174,74,0.06)", border: "1px solid rgba(63,174,74,0.18)" }}>
              <div style={{ fontSize: "10px", color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Business take-home</div>
              <div style={{ fontSize: "20px", fontWeight: 800, fontFamily: "var(--font-mono)", marginTop: "3px" }}>{fmtSigned(Math.round(calc.cum5yr))}</div>
              <div style={{ fontSize: "10.5px", color: "var(--text-tertiary)", marginTop: "3px" }}>cumulative profit, after tax</div>
            </div>
            <div style={{ padding: "12px 14px", borderRadius: "10px", background: "var(--bg-base)", border: "1px solid var(--border-subtle)" }}>
              <div style={{ fontSize: "10px", color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Staying employed</div>
              <div style={{ fontSize: "20px", fontWeight: 800, fontFamily: "var(--font-mono)", marginTop: "3px" }}>{fmt(Math.round(employedCum))}</div>
              <div style={{ fontSize: "10.5px", color: "var(--text-tertiary)", marginTop: "3px" }}>{fmt(forgoneSalary)}/mo salary</div>
            </div>
          </div>
          <div style={{ marginTop: "12px", padding: "10px 12px", borderRadius: "10px", background: businessVsEmployed >= 0 ? "rgba(34,197,94,0.08)" : "rgba(245,158,11,0.08)", border: `1px solid ${businessVsEmployed >= 0 ? "rgba(34,197,94,0.18)" : "rgba(245,158,11,0.18)"}`, fontSize: "12px", color: "var(--text-secondary)", lineHeight: 1.55 }}>
            {businessVsEmployed >= 0
              ? `Over 5 years the business nets ${fmt(Math.round(businessVsEmployed))} more than your salary would — plus you own an asset with ongoing value. The cost is the early risk and the runway you tie up.`
              : `Over 5 years the business nets ${fmt(Math.round(Math.abs(businessVsEmployed)))} less than simply staying employed. It can still be worth it for ownership, autonomy, and the upside beyond year 5 — but go in clear-eyed.`}
          </div>
        </div>

        {/* Add to plan */}
        {startupCapital > 0 && (
          <div style={cardStyle}>
            <span style={sectionTitle}>Add to your plan</span>
            <AddToPlanButton
              label="Start a business"
              category="career"
              amountImpact={-Math.round(startupCapital)}
              recurringAnnual={steadyDeltaAnnual}
              note={`Models the ${fmt(Math.round(startupCapital))} startup cost and the long-run ${steadyDeltaAnnual >= 0 ? "+" : ""}${fmt(steadyDeltaAnnual)}/yr income change vs your salary once ramped. Conservative — it doesn't model the lean early months.`}
            />
          </div>
        )}
        <p style={{ fontSize: "10px", color: "var(--text-tertiary)", margin: 0, lineHeight: 1.5 }}>A deterministic model — real businesses are lumpier. Keep a personal emergency fund separate from the business runway, and don&apos;t risk money you can&apos;t afford to lose.</p>
      </div>
    </div>
  );
}

function Metric({ label, value, sub, accent, hint }: { label: string; value: string; sub?: string; accent?: string; hint?: string }) {
  return (
    <div>
      <div style={{ fontSize: "10px", color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "5px", display: "flex", alignItems: "center" }}>{label}{hint && <HintDot text={hint} />}</div>
      <div style={{ fontSize: "18px", fontWeight: 700, fontFamily: "var(--font-display)", letterSpacing: "-0.5px", color: accent ?? "var(--text-primary)", lineHeight: 1.1 }}>{value}</div>
      {sub && <div style={{ fontSize: "10px", color: "var(--text-tertiary)", marginTop: "5px" }}>{sub}</div>}
    </div>
  );
}

function ScenarioCard({ title, tone, r, cashAvailable }: { title: string; tone: string; r: SimResult; cashAvailable: number }) {
  const ok = r.runwayOutMonth == null && r.steadyProfit >= 0 && r.cashToSurvive <= cashAvailable;
  return (
    <div style={{ padding: "12px 14px", borderRadius: "10px", background: `color-mix(in srgb, ${tone} 6%, var(--bg-base))`, border: `1px solid color-mix(in srgb, ${tone} 22%, transparent)` }}>
      <div style={{ fontSize: "11px", fontWeight: 700, color: tone, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "8px" }}>{title}</div>
      <Row k="Breakeven" v={r.breakevenMonth != null ? `Month ${r.breakevenMonth}` : "Never"} />
      <Row k="Runway needed" v={fmt(Math.round(r.cashToSurvive))} />
      <Row k="5-yr profit" v={fmtSigned(Math.round(r.cum5yr))} />
      <Row k="Survives?" v={ok ? "Yes" : "At risk"} color={ok ? "var(--green)" : "var(--red)"} />
    </div>
  );
}
function Row({ k, v, color }: { k: string; v: string; color?: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "3px 0", fontSize: "11.5px" }}>
      <span style={{ color: "var(--text-tertiary)" }}>{k}</span>
      <span style={{ fontFamily: "var(--font-mono)", fontWeight: 600, color: color ?? "var(--text-primary)" }}>{v}</span>
    </div>
  );
}
