"use client";

import { useState, useMemo, useTransition } from "react";
import Link from "next/link";
import type { CarScenario } from "./car-actions";
import { saveCarScenario, deleteCarScenario } from "./car-actions";
import type { FinancialProfile } from "@/app/planning/planning-actions";

// ── Types ─────────────────────────────────────────────────────────────────────

type PurchaseType = "cash" | "finance";
type CarVerdict = "SMART_MOVE" | "MANAGEABLE" | "BUDGET_STRETCH" | "KEEP_CURRENT";

// ── Formatters ────────────────────────────────────────────────────────────────

function fmt(n: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}
function fmtK(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${n < 0 ? "-" : ""}$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${n < 0 ? "-" : ""}$${Math.round(abs / 1_000)}k`;
  return `${n < 0 ? "-" : ""}$${Math.round(abs)}`;
}
function fmtPct(n: number): string { return n.toFixed(1) + "%"; }

// ── Math helpers ──────────────────────────────────────────────────────────────

function monthlyPayment(principal: number, annualRate: number, termMonths: number): number {
  if (principal <= 0 || termMonths <= 0) return 0;
  if (annualRate <= 0) return principal / termMonths;
  const r = annualRate / 12;
  return principal * r * Math.pow(1 + r, termMonths) / (Math.pow(1 + r, termMonths) - 1);
}

function gasPerMonth(mpg: number, milesPerMonth: number, gasPrice: number): number {
  if (mpg <= 0) return 0;
  return (milesPerMonth / mpg) * gasPrice;
}

// ── Analysis engine ───────────────────────────────────────────────────────────

type CarComputed = {
  // Current
  currentMonthlyPayment: number;
  currentGasPerMonth: number;
  currentTotalMonthly: number;
  currentEquity: number;
  currentTradeInValue: number;
  currentPrivateSaleValue: number;
  current5yrTCO: number;
  // New
  newFinancedAmount: number;
  newMonthlyPayment: number;
  newGasPerMonth: number;
  newTotalMonthly: number;
  new5yrTCO: number;
  totalInterestPaid: number;
  // Deltas
  monthlyCostDelta: number;
  monthlyCostDeltaPct: number;
  tco5yrDelta: number;
  breakEvenMonth: number | null;
  // Verdict
  verdict: CarVerdict;
  verdictConfidence: string;
  verdictConditions: string[];
  finnNarrative: string;
  // Amortization snapshot (first 12 months)
  amortization: { month: number; payment: number; principal: number; interest: number; balance: number }[];
  // Break-even chart data
  breakEvenChart: { month: number; currentCumCost: number; newCumCost: number }[];
};

function computeCar(inputs: CarScenario): CarComputed {
  const gasPrice   = Number(inputs.gas_price_per_gallon);
  const miles      = Number(inputs.miles_per_month);
  const isFinance  = inputs.purchase_type === "finance";

  // ── Current vehicle ──
  const curPayment   = Number(inputs.current_monthly_payment);
  const curGas       = gasPerMonth(Number(inputs.current_mpg), miles, gasPrice);
  const curInsurance = Number(inputs.current_monthly_insurance);
  const curTotalMo   = curPayment + curGas + curInsurance;
  const curValue     = Number(inputs.current_car_value);
  const curLoan      = Number(inputs.current_loan_balance);
  const curEquity    = Math.max(0, curValue - curLoan);
  const tradeIn      = curEquity;
  const privateSale  = Math.round(curEquity * 1.12); // ~12% premium over trade-in
  const cur5yr       = curTotalMo * 60 + curValue * 0.005 * 5; // TCO: payments + 0.5%/yr maintenance

  // ── New vehicle ──
  const newPrice     = Number(inputs.new_car_price);
  const newDown      = isFinance ? Number(inputs.new_down_payment) : newPrice; // cash = full price down
  const appliedDown  = newDown + tradeIn; // trade-in credit added to down
  const financedAmt  = isFinance ? Math.max(0, newPrice - appliedDown) : 0;
  const term         = Number(inputs.new_loan_term_months);
  const newRate      = Number(inputs.new_interest_rate);
  const newPayment   = isFinance ? monthlyPayment(financedAmt, newRate, term) : 0;
  const newGas       = gasPerMonth(Number(inputs.new_mpg), miles, gasPrice);
  const newInsurance = Number(inputs.new_monthly_insurance);
  const newTotalMo   = newPayment + newGas + newInsurance;
  const totalInterest = isFinance ? newPayment * term - financedAmt : 0;
  const new5yr       = isFinance
    ? newPayment * Math.min(60, term) + newGas * 60 + newInsurance * 60 + newPrice * 0.005 * 5
    : newPrice + newGas * 60 + newInsurance * 60 + newPrice * 0.005 * 5;

  // ── Deltas ──
  const moDelta      = newTotalMo - curTotalMo;
  const moDeltaPct   = curTotalMo > 0 ? (moDelta / curTotalMo) * 100 : 0;
  const tco5Delta    = new5yr - cur5yr;

  // Break-even: month when cumulative new-car costs >= cumulative current-car costs (including upfront cost premium)
  const upfrontPremium = isFinance
    ? Math.max(0, appliedDown - curEquity) // extra cash out of pocket vs. trade-in credit
    : Math.max(0, newPrice - curEquity);
  let breakEvenMonth: number | null = null;
  const breakEvenChart: { month: number; currentCumCost: number; newCumCost: number }[] = [];
  let cumCur = 0, cumNew = upfrontPremium;
  for (let m = 1; m <= 84; m++) {
    cumCur += curTotalMo;
    cumNew += newTotalMo;
    breakEvenChart.push({ month: m, currentCumCost: Math.round(cumCur), newCumCost: Math.round(cumNew) });
    if (breakEvenMonth == null && moDelta < 0 && cumNew <= cumCur) breakEvenMonth = m;
  }

  // ── Verdict ──
  let verdict: CarVerdict;
  let verdictConfidence: string;
  const conditions: string[] = [];

  if (moDelta <= -100) {
    verdict = "SMART_MOVE";
    verdictConfidence = "Saves Money";
    conditions.push(`New car saves ${fmt(Math.abs(moDelta))}/mo — more efficient financing or lower running costs`);
  } else if (moDeltaPct <= 10) {
    verdict = "MANAGEABLE";
    verdictConfidence = "Within Budget";
    if (moDelta > 0) conditions.push(`${fmt(moDelta)}/mo increase — comparable to current spending`);
  } else if (moDeltaPct <= 25) {
    verdict = "BUDGET_STRETCH";
    verdictConfidence = "Budget Stretch";
    conditions.push(`${fmtPct(moDeltaPct)} higher monthly cost — ensure this fits your budget`);
    if (totalInterest > 5000) conditions.push(`${fmt(Math.round(totalInterest))} total interest over the loan term`);
  } else {
    verdict = "KEEP_CURRENT";
    verdictConfidence = "High Cost Jump";
    conditions.push(`${fmtPct(moDeltaPct)} monthly cost increase is significant`);
    conditions.push(`Consider a lower price point or larger down payment`);
  }

  // ── FINN narrative ──
  let finnNarrative: string;
  if (verdict === "SMART_MOVE") {
    finnNarrative = `The math favors this switch. Your new car costs ${fmt(Math.abs(moDelta))}/mo less than what you're paying now — better loan terms, improved fuel economy, or both. Over 5 years that's ${fmtK(Math.abs(moDelta) * 60)} back in your pocket. The trade-in offsets ${fmtK(tradeIn)} of the purchase price.`;
  } else if (verdict === "MANAGEABLE") {
    finnNarrative = `This is a workable upgrade. Monthly costs increase by ${fmt(Math.abs(moDelta))} (${fmtPct(Math.abs(moDeltaPct))})${isFinance && totalInterest > 0 ? `, with ${fmt(Math.round(totalInterest))} in total interest over the ${term}-month loan` : ""}. The 5-year total cost of ownership is ${tco5Delta > 0 ? fmt(tco5Delta) + " more" : fmt(Math.abs(tco5Delta)) + " less"} than keeping your current car. Make sure the increase fits your cash flow before committing.`;
  } else if (verdict === "BUDGET_STRETCH") {
    finnNarrative = `This purchase stretches your budget by ${fmtPct(moDeltaPct)}/mo. It's not impossible, but at ${fmt(newTotalMo)}/mo for the new car vs. ${fmt(curTotalMo)} today, you're taking on real cash flow risk. A larger down payment${tradeIn > 0 ? ` (your ${fmtK(tradeIn)} trade-in is already applied)` : ""} or a shorter loan term would change the picture. Run it with a lower price point to see what's comfortable.`;
  } else {
    finnNarrative = `At ${fmt(newTotalMo)}/mo vs. ${fmt(curTotalMo)} today, this is a ${fmtPct(moDeltaPct)} jump in monthly transportation cost. Unless there's a specific need driving the upgrade, keeping your current vehicle is the stronger financial decision right now. If you do buy, consider waiting until your current loan is paid off — that ${fmtK(curPayment * 12)}/yr freed up changes the math significantly.`;
  }

  // ── Amortization (12 months) ──
  const amortization: { month: number; payment: number; principal: number; interest: number; balance: number }[] = [];
  let balance = financedAmt;
  const rMonthly = newRate / 12;
  for (let m = 1; m <= 12 && m <= term && isFinance && financedAmt > 0; m++) {
    const iAmt = balance * rMonthly;
    const pAmt = newPayment - iAmt;
    balance = Math.max(0, balance - pAmt);
    amortization.push({ month: m, payment: Math.round(newPayment), principal: Math.round(pAmt), interest: Math.round(iAmt), balance: Math.round(balance) });
  }

  return {
    currentMonthlyPayment: curPayment, currentGasPerMonth: curGas, currentTotalMonthly: curTotalMo,
    currentEquity: curEquity, currentTradeInValue: tradeIn, currentPrivateSaleValue: privateSale, current5yrTCO: cur5yr,
    newFinancedAmount: financedAmt, newMonthlyPayment: newPayment, newGasPerMonth: newGas, newTotalMonthly: newTotalMo, new5yrTCO: new5yr,
    totalInterestPaid: totalInterest, monthlyCostDelta: moDelta, monthlyCostDeltaPct: moDeltaPct,
    tco5yrDelta: tco5Delta, breakEvenMonth, verdict, verdictConfidence, verdictConditions: conditions,
    finnNarrative, amortization, breakEvenChart,
  };
}

// ── Verdict metadata ──────────────────────────────────────────────────────────

const VERDICT_META: Record<CarVerdict, { label: string; color: string; bg: string; border: string }> = {
  SMART_MOVE:     { label: "Smart Move",    color: "oklch(0.72 0.19 145)", bg: "color-mix(in oklch, oklch(0.55 0.15 145) 9%, transparent)",  border: "color-mix(in oklch, oklch(0.55 0.15 145) 28%, transparent)" },
  MANAGEABLE:     { label: "Manageable",    color: "oklch(0.72 0.20 38)",  bg: "color-mix(in oklch, oklch(0.72 0.20 38) 9%, transparent)",   border: "color-mix(in oklch, oklch(0.72 0.20 38) 25%, transparent)" },
  BUDGET_STRETCH: { label: "Budget Stretch",color: "oklch(0.78 0.17 70)",  bg: "color-mix(in oklch, oklch(0.78 0.17 70) 9%, transparent)",   border: "color-mix(in oklch, oklch(0.78 0.17 70) 22%, transparent)" },
  KEEP_CURRENT:   { label: "Keep Current",  color: "oklch(0.65 0.18 25)",  bg: "color-mix(in oklch, oklch(0.50 0.15 25) 10%, transparent)",  border: "color-mix(in oklch, oklch(0.50 0.15 25) 28%, transparent)" },
};

const CAR_COLOR = "oklch(0.72 0.20 38)";

// ── Default form ──────────────────────────────────────────────────────────────

const DEFAULT_FORM = (
  prefillCurrentValue: number,
  prefillLoanBalance: number,
  prefillMonthlyPayment: number,
  liquidAssets: number,
  scenario?: CarScenario,
): Omit<CarScenario, "id" | "user_id" | "created_at" | "updated_at"> => ({
  name:                     scenario?.name ?? "Car Scenario",
  current_make:             scenario?.current_make ?? null,
  current_model:            scenario?.current_model ?? null,
  current_year:             scenario?.current_year ?? null,
  current_car_value:        scenario?.current_car_value ?? prefillCurrentValue,
  current_loan_balance:     scenario?.current_loan_balance ?? prefillLoanBalance,
  current_monthly_payment:  scenario?.current_monthly_payment ?? prefillMonthlyPayment,
  current_interest_rate:    scenario?.current_interest_rate ?? 0,
  current_mpg:              scenario?.current_mpg ?? 25,
  current_monthly_insurance: scenario?.current_monthly_insurance ?? 150,
  new_make:                 scenario?.new_make ?? null,
  new_model:                scenario?.new_model ?? null,
  new_year:                 scenario?.new_year ?? null,
  new_car_price:            scenario?.new_car_price ?? 30000,
  new_down_payment:         scenario?.new_down_payment ?? Math.min(5000, Math.round(liquidAssets * 0.2)),
  new_loan_term_months:     scenario?.new_loan_term_months ?? 60,
  new_interest_rate:        scenario?.new_interest_rate ?? 0.065,
  new_mpg:                  scenario?.new_mpg ?? 30,
  new_monthly_insurance:    scenario?.new_monthly_insurance ?? 175,
  purchase_type:            scenario?.purchase_type ?? "finance",
  gas_price_per_gallon:     scenario?.gas_price_per_gallon ?? 3.50,
  miles_per_month:          scenario?.miles_per_month ?? 1200,
  notes:                    scenario?.notes ?? null,
});

// ── Component ─────────────────────────────────────────────────────────────────

type Props = {
  scenarios: CarScenario[];
  profile: FinancialProfile | null;
  liquidAssets: number;
  effectiveIncome: number;
  effectiveExpenses: number;
  prefillCurrentValue: number;
  prefillLoanBalance: number;
  prefillMonthlyPayment: number;
};

export default function CarClient({
  scenarios,
  profile: _profile,
  liquidAssets,
  effectiveIncome: _effectiveIncome,
  effectiveExpenses: _effectiveExpenses,
  prefillCurrentValue,
  prefillLoanBalance,
  prefillMonthlyPayment,
}: Props) {
  const [activeId, setActiveId] = useState<string | null>(scenarios[0]?.id ?? null);
  const [isPending, startTransition] = useTransition();
  const [isEditing, setIsEditing] = useState(scenarios.length === 0);
  const [showNewForm, setShowNewForm] = useState(false);
  const [vinInput, setVinInput] = useState("");
  const [vinLoading, setVinLoading] = useState<"current" | "new" | null>(null);
  const [vinError, setVinError] = useState("");

  const activeScenario = scenarios.find((s) => s.id === activeId) ?? scenarios[0] ?? null;
  const showAnalysis = activeScenario != null || isEditing || showNewForm;

  const [form, setForm] = useState(() =>
    DEFAULT_FORM(prefillCurrentValue, prefillLoanBalance, prefillMonthlyPayment, liquidAssets, activeScenario ?? undefined)
  );

  const result = useMemo(() => {
    const s = { ...form, id: "", user_id: "", created_at: "", updated_at: "" };
    return computeCar(s);
  }, [form]);

  const meta = VERDICT_META[result.verdict];

  function setField<K extends keyof typeof form>(key: K, val: (typeof form)[K]) {
    setForm((p) => ({ ...p, [key]: val }));
  }

  function handleSave() {
    startTransition(async () => {
      await saveCarScenario(form, showNewForm ? undefined : activeScenario?.id);
      setIsEditing(false);
      setShowNewForm(false);
    });
  }

  function handleDelete(id: string) {
    startTransition(async () => {
      await deleteCarScenario(id);
      setActiveId(null);
    });
  }

  async function lookupVin(target: "current" | "new") {
    if (vinInput.length !== 17) { setVinError("VIN must be 17 characters"); return; }
    setVinLoading(target);
    setVinError("");
    try {
      const res = await fetch(`/api/car/vin?vin=${encodeURIComponent(vinInput)}`);
      const json = await res.json();
      if (!res.ok) { setVinError(json.error ?? "Lookup failed"); return; }
      if (target === "current") {
        if (json.make) setField("current_make", json.make);
        if (json.model) setField("current_model", json.model);
        if (json.year) setField("current_year", json.year);
      } else {
        if (json.make) setField("new_make", json.make);
        if (json.model) setField("new_model", json.model);
        if (json.year) setField("new_year", json.year);
      }
      setVinInput("");
    } catch {
      setVinError("Lookup failed. Try again.");
    } finally {
      setVinLoading(null);
    }
  }

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "7px 10px", borderRadius: "var(--radius-sm)",
    background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)",
    color: "var(--text-primary)", fontSize: "13px", fontFamily: "var(--font-body)",
    outline: "none", boxSizing: "border-box",
  };
  const labelStyle: React.CSSProperties = {
    fontSize: "10px", fontWeight: 600, textTransform: "uppercase" as const,
    letterSpacing: "0.07em", color: "var(--text-muted)", fontFamily: "var(--font-body)",
    marginBottom: "4px", display: "block",
  };
  const sectionLabel: React.CSSProperties = {
    fontSize: "9px", fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.12em",
    color: "var(--text-muted)", margin: "0 0 8px", fontFamily: "var(--font-body)",
  };

  const isFinance = form.purchase_type === "finance";
  const chartMax = Math.max(...result.breakEvenChart.map((d) => Math.max(d.currentCumCost, d.newCumCost)), 1);
  const chartPoints = 84;
  const svgW = chartPoints;

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", color: "var(--text-primary)", fontFamily: "var(--font-body)" }}>

      {/* Header */}
      <div style={{ padding: "12px 24px", borderBottom: "1px solid var(--border-subtle)", display: "flex", alignItems: "center", justifyContent: "space-between", background: "var(--bg-base)", flexShrink: 0, gap: "12px" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "3px" }}>
            <Link href="/planning?tab=events" style={{ display: "flex", alignItems: "center", gap: "5px", fontSize: "12px", color: "var(--text-muted)", textDecoration: "none" }}>
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M10 3L5 8l5 5" strokeLinecap="round" strokeLinejoin="round"/></svg>
              Planning
            </Link>
            <span style={{ color: "var(--border)" }}>/</span>
            <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)" }}>Car Purchase</span>
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: "10px" }}>
            <span style={{ fontSize: "16px", fontWeight: 700, color: "var(--text-primary)" }}>Car Purchase Planner</span>
            <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>Compare current vs. new — cost, financing, break-even</span>
          </div>
        </div>
        {scenarios.length > 0 && (
          <button type="button" onClick={() => { setShowNewForm(true); setIsEditing(false); setForm(DEFAULT_FORM(prefillCurrentValue, prefillLoanBalance, prefillMonthlyPayment, liquidAssets)); }} style={{ padding: "6px 12px", borderRadius: "var(--radius-md)", background: "var(--accent)", color: "#fff", border: "none", fontSize: "12px", fontWeight: 600, fontFamily: "var(--font-body)", cursor: "pointer" }}>
            + New Scenario
          </button>
        )}
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflow: "auto", display: "flex", flexDirection: "row", minHeight: 0 }}>

        {/* Left sidebar */}
        <div style={{ width: "280px", minWidth: "260px", maxWidth: "300px", flexShrink: 0, borderRight: "1px solid var(--border-subtle)", overflowY: "auto", padding: "18px 16px", display: "flex", flexDirection: "column", gap: "10px", background: "var(--bg-base)" }}>

          {scenarios.length > 1 && (
            <div>
              <label style={labelStyle}>Scenario</label>
              <select value={activeId ?? ""} onChange={(e) => {
                const s = scenarios.find((sc) => sc.id === e.target.value);
                if (s) { setActiveId(s.id); setForm(DEFAULT_FORM(prefillCurrentValue, prefillLoanBalance, prefillMonthlyPayment, liquidAssets, s)); setIsEditing(false); }
              }} style={inputStyle}>
                {scenarios.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          )}

          {(isEditing || showNewForm || scenarios.length === 0) && (
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>

              <div>
                <label style={labelStyle}>Scenario name</label>
                <input style={inputStyle} value={form.name} onChange={(e) => setField("name", e.target.value)} placeholder="e.g. Honda CR-V 2025" />
              </div>

              {/* Purchase type toggle */}
              <div>
                <label style={labelStyle}>Purchase type</label>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px" }}>
                  {(["finance", "cash"] as PurchaseType[]).map((t) => (
                    <button key={t} type="button" onClick={() => setField("purchase_type", t)}
                      style={{ padding: "7px 0", borderRadius: "var(--radius-sm)", fontSize: "12px", fontWeight: 600, fontFamily: "var(--font-body)", cursor: "pointer", border: `1px solid ${form.purchase_type === t ? CAR_COLOR : "var(--border-subtle)"}`, background: form.purchase_type === t ? `color-mix(in oklch, ${CAR_COLOR} 18%, transparent)` : "transparent", color: form.purchase_type === t ? CAR_COLOR : "var(--text-secondary)", textTransform: "capitalize" }}>
                      {t === "finance" ? "Finance" : "Pay Cash"}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ height: "1px", background: "var(--border-subtle)" }} />

              {/* Current vehicle */}
              <p style={sectionLabel}>Current Vehicle</p>

              {/* VIN lookup for current */}
              <div>
                <label style={labelStyle}>VIN lookup (optional)</label>
                <div style={{ display: "flex", gap: "4px" }}>
                  <input style={{ ...inputStyle, flex: 1 }} value={vinInput} onChange={(e) => setVinInput(e.target.value.toUpperCase())} placeholder="17-char VIN" maxLength={17} />
                  <button type="button" onClick={() => lookupVin("current")} disabled={vinLoading !== null} style={{ padding: "7px 8px", borderRadius: "var(--radius-sm)", background: `color-mix(in oklch, ${CAR_COLOR} 18%, transparent)`, color: CAR_COLOR, border: `1px solid color-mix(in oklch, ${CAR_COLOR} 30%, transparent)`, fontSize: "10px", fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap", fontFamily: "var(--font-body)" }}>
                    {vinLoading === "current" ? "…" : "Fill"}
                  </button>
                </div>
                {vinError && <div style={{ fontSize: "10px", color: "var(--red)", marginTop: "3px", fontFamily: "var(--font-body)" }}>{vinError}</div>}
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px" }}>
                <div>
                  <label style={labelStyle}>Year</label>
                  <input style={inputStyle} type="number" min={1990} max={2030} value={form.current_year ?? ""} onChange={(e) => setField("current_year", e.target.value ? Number(e.target.value) : null)} placeholder="2020" />
                </div>
                <div>
                  <label style={labelStyle}>MPG</label>
                  <input style={inputStyle} type="number" min={1} max={200} value={form.current_mpg} onChange={(e) => setField("current_mpg", Number(e.target.value))} />
                </div>
              </div>
              <div>
                <label style={labelStyle}>Market value</label>
                <input style={inputStyle} type="number" min={0} value={form.current_car_value} onChange={(e) => setField("current_car_value", Number(e.target.value))} placeholder="Check KBB" />
                <div style={{ fontSize: "9px", color: "var(--text-muted)", marginTop: "3px", fontFamily: "var(--font-body)" }}>Use KBB or Carmax for an estimate</div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px" }}>
                <div>
                  <label style={labelStyle}>Loan balance</label>
                  <input style={inputStyle} type="number" min={0} value={form.current_loan_balance} onChange={(e) => setField("current_loan_balance", Number(e.target.value))} placeholder="0" />
                </div>
                <div>
                  <label style={labelStyle}>Monthly payment</label>
                  <input style={inputStyle} type="number" min={0} value={form.current_monthly_payment} onChange={(e) => setField("current_monthly_payment", Number(e.target.value))} placeholder="0" />
                </div>
              </div>
              <div>
                <label style={labelStyle}>Monthly insurance</label>
                <input style={inputStyle} type="number" min={0} value={form.current_monthly_insurance} onChange={(e) => setField("current_monthly_insurance", Number(e.target.value))} />
              </div>

              <div style={{ height: "1px", background: "var(--border-subtle)" }} />

              {/* New vehicle */}
              <p style={sectionLabel}>New Vehicle</p>

              {/* VIN lookup for new */}
              <div>
                <label style={labelStyle}>VIN lookup (optional)</label>
                <div style={{ display: "flex", gap: "4px" }}>
                  <input style={{ ...inputStyle, flex: 1 }} value={vinInput} onChange={(e) => setVinInput(e.target.value.toUpperCase())} placeholder="17-char VIN" maxLength={17} />
                  <button type="button" onClick={() => lookupVin("new")} disabled={vinLoading !== null} style={{ padding: "7px 8px", borderRadius: "var(--radius-sm)", background: `color-mix(in oklch, ${CAR_COLOR} 18%, transparent)`, color: CAR_COLOR, border: `1px solid color-mix(in oklch, ${CAR_COLOR} 30%, transparent)`, fontSize: "10px", fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap", fontFamily: "var(--font-body)" }}>
                    {vinLoading === "new" ? "…" : "Fill"}
                  </button>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px" }}>
                <div>
                  <label style={labelStyle}>Year</label>
                  <input style={inputStyle} type="number" min={1990} max={2030} value={form.new_year ?? ""} onChange={(e) => setField("new_year", e.target.value ? Number(e.target.value) : null)} placeholder="2025" />
                </div>
                <div>
                  <label style={labelStyle}>MPG</label>
                  <input style={inputStyle} type="number" min={1} max={200} value={form.new_mpg} onChange={(e) => setField("new_mpg", Number(e.target.value))} />
                </div>
              </div>
              <div>
                <label style={labelStyle}>Purchase price</label>
                <input style={inputStyle} type="number" min={0} value={form.new_car_price} onChange={(e) => setField("new_car_price", Number(e.target.value))} />
              </div>
              {isFinance && (
                <>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px" }}>
                    <div>
                      <label style={labelStyle}>Down payment</label>
                      <input style={inputStyle} type="number" min={0} value={form.new_down_payment} onChange={(e) => setField("new_down_payment", Number(e.target.value))} />
                    </div>
                    <div>
                      <label style={labelStyle}>Loan term (mo)</label>
                      <select style={inputStyle} value={form.new_loan_term_months} onChange={(e) => setField("new_loan_term_months", Number(e.target.value))}>
                        {[24, 36, 48, 60, 72, 84].map((t) => <option key={t} value={t}>{t} months</option>)}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label style={labelStyle}>Interest rate (%)</label>
                    <input style={inputStyle} type="number" min={0} max={30} step={0.1} value={(form.new_interest_rate * 100).toFixed(1)} onChange={(e) => setField("new_interest_rate", Number(e.target.value) / 100)} placeholder="6.5" />
                  </div>
                </>
              )}
              <div>
                <label style={labelStyle}>Monthly insurance (estimate)</label>
                <input style={inputStyle} type="number" min={0} value={form.new_monthly_insurance} onChange={(e) => setField("new_monthly_insurance", Number(e.target.value))} />
              </div>

              <div style={{ height: "1px", background: "var(--border-subtle)" }} />
              <p style={sectionLabel}>Driving Assumptions</p>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px" }}>
                <div>
                  <label style={labelStyle}>Miles / month</label>
                  <input style={inputStyle} type="number" min={100} value={form.miles_per_month} onChange={(e) => setField("miles_per_month", Number(e.target.value))} />
                </div>
                <div>
                  <label style={labelStyle}>Gas price / gal</label>
                  <input style={inputStyle} type="number" min={1} max={10} step={0.1} value={Number(form.gas_price_per_gallon).toFixed(2)} onChange={(e) => setField("gas_price_per_gallon", Number(e.target.value))} />
                </div>
              </div>

              <button type="button" disabled={isPending} onClick={handleSave} style={{ width: "100%", padding: "9px 0", borderRadius: "var(--radius-md)", background: "oklch(0.62 0.22 295)", color: "#fff", border: "none", fontSize: "12px", fontWeight: 700, fontFamily: "var(--font-body)", cursor: "pointer", opacity: isPending ? 0.55 : 1, boxShadow: isPending ? "none" : "0 2px 12px oklch(0.62 0.22 295 / 0.4)", letterSpacing: "0.03em", marginTop: "4px" }}>
                {isPending ? "Saving…" : "Save Scenario"}
              </button>
              {activeScenario && (
                <button type="button" onClick={() => { setIsEditing(false); setShowNewForm(false); }} style={{ width: "100%", padding: "7px 0", borderRadius: "var(--radius-md)", background: "transparent", color: "var(--text-muted)", border: "1px solid var(--border-subtle)", fontSize: "12px", fontFamily: "var(--font-body)", cursor: "pointer" }}>
                  Cancel
                </button>
              )}
            </div>
          )}

          {activeScenario && !isEditing && !showNewForm && (
            <div style={{ display: "flex", gap: "8px" }}>
              <button type="button" onClick={() => setIsEditing(true)} style={{ flex: 1, padding: "7px 0", borderRadius: "var(--radius-md)", background: "transparent", color: "var(--text-secondary)", border: "1px solid var(--border-subtle)", fontSize: "12px", fontFamily: "var(--font-body)", cursor: "pointer" }}>Edit</button>
              <button type="button" disabled={isPending} onClick={() => handleDelete(activeScenario.id)} style={{ padding: "7px 10px", borderRadius: "var(--radius-md)", background: "transparent", color: "var(--red)", border: "1px solid color-mix(in oklch, var(--red) 30%, transparent)", fontSize: "12px", fontFamily: "var(--font-body)", cursor: "pointer" }}>Delete</button>
            </div>
          )}

          {/* At a Glance */}
          {showAnalysis && (
            <>
              <div style={{ height: "1px", background: "var(--border-subtle)", margin: "2px 0 6px" }} />
              <p style={{ ...sectionLabel, marginBottom: "10px" }}>At a Glance</p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                {[
                  { label: "Current /mo", value: fmtK(result.currentTotalMonthly), color: "var(--text-primary)" },
                  { label: "New /mo", value: fmtK(result.newTotalMonthly), color: result.monthlyCostDelta > 0 ? "oklch(0.78 0.17 70)" : "var(--green)" },
                  { label: "Monthly Δ", value: `${result.monthlyCostDelta >= 0 ? "+" : ""}${fmtK(result.monthlyCostDelta)}`, color: result.monthlyCostDelta > 0 ? "oklch(0.78 0.17 70)" : "var(--green)" },
                  { label: "Trade-in", value: fmtK(result.currentEquity), color: "var(--text-primary)" },
                ].map(({ label, value, color }) => (
                  <div key={label} style={{ padding: "10px 12px", borderRadius: "var(--radius-md)", background: "var(--bg-card)", border: "1px solid var(--border-subtle)" }}>
                    <div style={{ fontSize: "9px", textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--text-muted)", marginBottom: "4px", fontFamily: "var(--font-body)" }}>{label}</div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: "14px", fontWeight: 800, color, lineHeight: 1 }}>{value}</div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Right panel */}
        <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px 40px", display: "flex", flexDirection: "column", gap: "16px", minWidth: 0 }}>

          {!showAnalysis && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", flex: 1, gap: "14px", textAlign: "center" }}>
              <div style={{ width: "52px", height: "52px", borderRadius: "50%", background: `color-mix(in oklch, ${CAR_COLOR} 10%, transparent)`, border: `1px solid color-mix(in oklch, ${CAR_COLOR} 22%, transparent)`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={CAR_COLOR} strokeWidth="1.5"><path d="M5 17H3a2 2 0 01-2-2v-4a2 2 0 012-2h1l2-4h10l2 4h1a2 2 0 012 2v4a2 2 0 01-2 2h-2" strokeLinecap="round" strokeLinejoin="round"/><circle cx="7.5" cy="17.5" r="2.5"/><circle cx="16.5" cy="17.5" r="2.5"/></svg>
              </div>
              <div>
                <div style={{ fontFamily: "var(--font-display)", fontSize: "20px", fontWeight: 700, color: "var(--text-primary)", marginBottom: "6px" }}>Plan your next car</div>
                <div style={{ fontSize: "13px", color: "var(--text-secondary)", maxWidth: "340px", lineHeight: 1.6 }}>Compare your current car to a new purchase. See monthly costs, 5-year ownership, trade-in value, and break-even timeline.</div>
              </div>
              <button type="button" onClick={() => setIsEditing(true)} style={{ padding: "9px 20px", borderRadius: "var(--radius-md)", background: "var(--accent)", color: "#fff", border: "none", fontSize: "13px", fontWeight: 600, fontFamily: "var(--font-body)", cursor: "pointer" }}>
                Create a scenario
              </button>
            </div>
          )}

          {/* Verdict */}
          {showAnalysis && (
            <div style={{ background: meta.bg, border: `1px solid ${meta.border}`, borderRadius: "var(--radius-lg)", padding: "20px 24px" }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
                    <span style={{ fontSize: "9px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--text-muted)", fontFamily: "var(--font-body)" }}>FINN Assessment</span>
                    <span style={{ fontSize: "9px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", padding: "2px 8px", borderRadius: "99px", background: `${meta.color}22`, color: meta.color, fontFamily: "var(--font-body)" }}>{result.verdictConfidence}</span>
                  </div>
                  <div style={{ fontFamily: "var(--font-display)", fontSize: "46px", fontWeight: 800, letterSpacing: "-1.5px", lineHeight: 1, color: meta.color, marginBottom: "12px" }}>{meta.label}</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "16px" }}>
                    <div>
                      <div style={{ fontSize: "9px", textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--text-muted)", fontFamily: "var(--font-body)" }}>Monthly Δ</div>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: "16px", fontWeight: 800, color: result.monthlyCostDelta <= 0 ? "var(--green)" : "var(--red)", marginTop: "2px" }}>
                        {result.monthlyCostDelta >= 0 ? "+" : ""}{fmt(result.monthlyCostDelta)}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: "9px", textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--text-muted)", fontFamily: "var(--font-body)" }}>5-yr TCO Δ</div>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: "16px", fontWeight: 800, color: result.tco5yrDelta <= 0 ? "var(--green)" : "oklch(0.78 0.17 70)", marginTop: "2px" }}>
                        {result.tco5yrDelta >= 0 ? "+" : ""}{fmtK(result.tco5yrDelta)}
                      </div>
                    </div>
                    {result.breakEvenMonth != null && (
                      <div>
                        <div style={{ fontSize: "9px", textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--text-muted)", fontFamily: "var(--font-body)" }}>Break-even</div>
                        <div style={{ fontFamily: "var(--font-mono)", fontSize: "16px", fontWeight: 800, color: "var(--green)", marginTop: "2px" }}>Month {result.breakEvenMonth}</div>
                      </div>
                    )}
                  </div>
                </div>
                {/* Progress circle: new cost / current cost */}
                <div style={{ flexShrink: 0, textAlign: "center" }}>
                  {(() => {
                    const pct = result.currentTotalMonthly > 0 ? Math.min(2, result.newTotalMonthly / result.currentTotalMonthly) : 1;
                    const displayPct = Math.round(pct * 100);
                    return (
                      <div style={{ position: "relative", width: "72px", height: "72px" }}>
                        <svg width="72" height="72" viewBox="0 0 72 72" style={{ transform: "rotate(-90deg)" }}>
                          <circle cx="36" cy="36" r="28" fill="none" stroke="var(--border)" strokeWidth="5" />
                          <circle cx="36" cy="36" r="28" fill="none" stroke={meta.color} strokeWidth="5" strokeLinecap="round"
                            strokeDasharray={`${2 * Math.PI * 28}`}
                            strokeDashoffset={`${2 * Math.PI * 28 * (1 - Math.min(1, pct / 2))}`} />
                        </svg>
                        <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                          <div style={{ fontFamily: "var(--font-mono)", fontSize: "11px", fontWeight: 800, color: meta.color, lineHeight: 1 }}>{displayPct}%</div>
                          <div style={{ fontSize: "8px", color: "var(--text-muted)", fontFamily: "var(--font-body)", textAlign: "center", marginTop: "1px" }}>of current</div>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>
              {result.verdictConditions.length > 0 && (
                <div style={{ marginTop: "14px", paddingTop: "14px", borderTop: `1px solid ${meta.border}` }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
                    {result.verdictConditions.map((c, i) => (
                      <div key={i} style={{ display: "flex", gap: "8px", alignItems: "flex-start" }}>
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: "10px", color: meta.color, marginTop: "1px", flexShrink: 0 }}>→</span>
                        <span style={{ fontSize: "12px", color: "var(--text-secondary)", fontFamily: "var(--font-body)", lineHeight: 1.5 }}>{c}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* FINN narrative */}
          {showAnalysis && (
            <div style={{ background: "rgba(99,102,241,0.04)", border: "1px solid rgba(99,102,241,0.22)", borderRadius: "var(--radius-lg)", padding: "14px 16px" }}>
              <div style={{ display: "flex", gap: "11px", alignItems: "flex-start" }}>
                <div style={{ flexShrink: 0, width: "24px", height: "24px", borderRadius: "50%", background: "rgba(99,102,241,0.12)", border: "1px solid rgba(99,102,241,0.25)", display: "flex", alignItems: "center", justifyContent: "center", marginTop: "1px" }}>
                  <svg width="10" height="10" viewBox="0 0 20 20" fill="none"><path d="M10 2a7 7 0 014.83 12.01L14 17H6l-.83-2.99A7 7 0 0110 2z" fill="rgba(99,102,241,0.2)" stroke="oklch(0.65 0.18 260)" strokeWidth="1.5"/><path d="M8 17h4" stroke="oklch(0.65 0.18 260)" strokeWidth="1.5" strokeLinecap="round"/></svg>
                </div>
                <div>
                  <div style={{ fontFamily: "var(--font-display)", fontSize: "9px", fontWeight: 700, color: "oklch(0.65 0.18 260)", letterSpacing: "0.09em", textTransform: "uppercase", marginBottom: "4px" }}>FINN</div>
                  <p style={{ fontSize: "13px", color: "var(--text-secondary)", fontFamily: "var(--font-body)", lineHeight: 1.65, margin: 0 }}>{result.finnNarrative}</p>
                </div>
              </div>
            </div>
          )}

          {/* Monthly cost side-by-side */}
          {showAnalysis && (
            <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-lg)", padding: "18px 20px" }}>
              <div style={{ fontFamily: "var(--font-body)", fontWeight: 700, fontSize: "14px", color: "var(--text-primary)", marginBottom: "14px" }}>Monthly Cost Breakdown</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                {(["current", "new"] as const).map((side) => {
                  const payment = side === "current" ? result.currentMonthlyPayment : result.newMonthlyPayment;
                  const gas     = side === "current" ? result.currentGasPerMonth   : result.newGasPerMonth;
                  const ins     = side === "current" ? Number(form.current_monthly_insurance) : Number(form.new_monthly_insurance);
                  const total   = side === "current" ? result.currentTotalMonthly  : result.newTotalMonthly;
                  const label   = side === "current" ? "Current Car"  : "New Car";
                  const color   = side === "current" ? "var(--text-muted)" : CAR_COLOR;
                  return (
                    <div key={side} style={{ padding: "14px", borderRadius: "var(--radius-md)", background: "var(--bg-card)", border: "1px solid var(--border-subtle)" }}>
                      <div style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color, marginBottom: "10px", fontFamily: "var(--font-body)" }}>{label}</div>
                      {[
                        { label: side === "current" && form.current_monthly_payment === 0 ? "Paid Off" : "Loan Payment", value: payment },
                        { label: "Gas / month", value: gas },
                        { label: "Insurance", value: ins },
                      ].map(({ label: lbl, value }) => (
                        <div key={lbl} style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
                          <span style={{ fontSize: "11px", color: "var(--text-secondary)", fontFamily: "var(--font-body)" }}>{lbl}</span>
                          <span style={{ fontFamily: "var(--font-mono)", fontSize: "11px", fontWeight: 600, color: "var(--text-primary)" }}>{fmt(Math.round(value))}</span>
                        </div>
                      ))}
                      <div style={{ height: "1px", background: "var(--border-subtle)", margin: "8px 0" }} />
                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-primary)", fontFamily: "var(--font-body)" }}>Total</span>
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: "14px", fontWeight: 800, color }}>{fmt(Math.round(total))}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 5-year TCO */}
          {showAnalysis && (
            <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-lg)", padding: "18px 20px" }}>
              <div style={{ marginBottom: "14px" }}>
                <div style={{ fontFamily: "var(--font-body)", fontWeight: 700, fontSize: "14px", color: "var(--text-primary)", marginBottom: "2px" }}>5-Year Total Cost of Ownership</div>
                <div style={{ fontSize: "11px", color: "var(--text-tertiary)", fontFamily: "var(--font-body)" }}>Payments + gas + insurance + est. maintenance (0.5%/yr)</div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "12px" }}>
                {[
                  { label: "Current Car", value: result.current5yrTCO, color: "var(--text-muted)" },
                  { label: "New Car", value: result.new5yrTCO, color: CAR_COLOR },
                ].map(({ label, value, color }) => (
                  <div key={label} style={{ padding: "14px", borderRadius: "var(--radius-md)", background: "var(--bg-card)", border: "1px solid var(--border-subtle)", textAlign: "center" }}>
                    <div style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color, marginBottom: "6px", fontFamily: "var(--font-body)" }}>{label}</div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: "18px", fontWeight: 800, color }}>{fmtK(Math.round(value))}</div>
                  </div>
                ))}
              </div>
              <div style={{ padding: "10px 14px", borderRadius: "var(--radius-md)", background: result.tco5yrDelta > 0 ? "color-mix(in oklch, oklch(0.78 0.17 70) 8%, transparent)" : "color-mix(in oklch, var(--green) 8%, transparent)", border: `1px solid ${result.tco5yrDelta > 0 ? "color-mix(in oklch, oklch(0.78 0.17 70) 25%, transparent)" : "color-mix(in oklch, var(--green) 25%, transparent)"}` }}>
                <span style={{ fontSize: "12px", color: "var(--text-secondary)", fontFamily: "var(--font-body)" }}>
                  New car costs <strong style={{ color: result.tco5yrDelta > 0 ? "oklch(0.78 0.17 70)" : "var(--green)" }}>{fmtK(Math.abs(result.tco5yrDelta))} {result.tco5yrDelta > 0 ? "more" : "less"}</strong> over 5 years
                </span>
              </div>
            </div>
          )}

          {/* Trade-in & equity */}
          {showAnalysis && (
            <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-lg)", padding: "18px 20px" }}>
              <div style={{ fontFamily: "var(--font-body)", fontWeight: 700, fontSize: "14px", color: "var(--text-primary)", marginBottom: "14px" }}>Trade-in & Equity</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "8px" }}>
                {[
                  { label: "Car Value", value: fmt(Math.round(Number(form.current_car_value))), sub: "market value" },
                  { label: "Trade-in", value: fmt(result.currentTradeInValue), sub: "dealer estimate" },
                  { label: "Private Sale", value: fmt(result.currentPrivateSaleValue), sub: "~12% premium" },
                ].map(({ label, value, sub }) => (
                  <div key={label} style={{ padding: "12px", borderRadius: "var(--radius-md)", background: "var(--bg-card)", border: "1px solid var(--border-subtle)" }}>
                    <div style={{ fontSize: "9px", textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--text-muted)", marginBottom: "3px", fontFamily: "var(--font-body)" }}>{label}</div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: "14px", fontWeight: 700, color: "var(--text-primary)", marginBottom: "2px" }}>{value}</div>
                    <div style={{ fontSize: "9px", color: "var(--text-muted)", fontFamily: "var(--font-body)" }}>{sub}</div>
                  </div>
                ))}
              </div>
              {result.currentEquity > 0 && (
                <div style={{ marginTop: "10px", fontSize: "12px", color: "var(--text-secondary)", fontFamily: "var(--font-body)", lineHeight: 1.5 }}>
                  {fmt(result.currentEquity)} in equity is automatically applied toward the down payment. Selling privately adds {fmt(result.currentPrivateSaleValue - result.currentTradeInValue)} more.
                </div>
              )}
            </div>
          )}

          {/* Financing summary */}
          {showAnalysis && isFinance && result.newFinancedAmount > 0 && (
            <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-lg)", padding: "18px 20px" }}>
              <div style={{ fontFamily: "var(--font-body)", fontWeight: 700, fontSize: "14px", color: "var(--text-primary)", marginBottom: "14px" }}>Financing Summary</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "8px", marginBottom: "12px" }}>
                {[
                  { label: "Amount Financed", value: fmt(Math.round(result.newFinancedAmount)), color: "var(--text-primary)" },
                  { label: "Monthly Payment", value: fmt(Math.round(result.newMonthlyPayment)), color: CAR_COLOR },
                  { label: "Total Interest", value: fmt(Math.round(result.totalInterestPaid)), color: "oklch(0.78 0.17 70)" },
                  { label: "Total Cost", value: fmt(Math.round(result.newFinancedAmount + result.totalInterestPaid)), color: "var(--text-primary)" },
                ].map(({ label, value, color }) => (
                  <div key={label} style={{ padding: "10px 12px", borderRadius: "var(--radius-md)", background: "var(--bg-card)", border: "1px solid var(--border-subtle)" }}>
                    <div style={{ fontSize: "9px", textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--text-muted)", marginBottom: "3px", fontFamily: "var(--font-body)" }}>{label}</div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: "14px", fontWeight: 700, color }}>{value}</div>
                  </div>
                ))}
              </div>
              {/* Amortization table — first 12 months */}
              {result.amortization.length > 0 && (
                <>
                  <div style={{ fontSize: "10px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--text-muted)", fontFamily: "var(--font-body)", marginBottom: "8px" }}>First 12 Months</div>
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11px", fontFamily: "var(--font-mono)" }}>
                      <thead>
                        <tr>
                          {["Mo", "Payment", "Principal", "Interest", "Balance"].map((h) => (
                            <th key={h} style={{ padding: "4px 8px", textAlign: "right", fontSize: "9px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)", fontFamily: "var(--font-body)", borderBottom: "1px solid var(--border-subtle)" }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {result.amortization.map((row) => (
                          <tr key={row.month} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                            <td style={{ padding: "5px 8px", textAlign: "right", color: "var(--text-muted)" }}>{row.month}</td>
                            <td style={{ padding: "5px 8px", textAlign: "right", color: "var(--text-primary)" }}>{fmt(row.payment)}</td>
                            <td style={{ padding: "5px 8px", textAlign: "right", color: "var(--green)" }}>{fmt(row.principal)}</td>
                            <td style={{ padding: "5px 8px", textAlign: "right", color: "oklch(0.78 0.17 70)" }}>{fmt(row.interest)}</td>
                            <td style={{ padding: "5px 8px", textAlign: "right", color: "var(--text-secondary)" }}>{fmt(row.balance)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Break-even chart */}
          {showAnalysis && (
            <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-lg)", padding: "18px 20px" }}>
              <div style={{ marginBottom: "14px" }}>
                <div style={{ fontFamily: "var(--font-body)", fontWeight: 700, fontSize: "14px", color: "var(--text-primary)", marginBottom: "2px" }}>
                  Cumulative Cost: Current vs. New
                  {result.breakEvenMonth != null && <span style={{ fontSize: "11px", fontWeight: 400, color: "var(--green)", marginLeft: "10px" }}>Break-even at month {result.breakEvenMonth}</span>}
                </div>
                <div style={{ fontSize: "11px", color: "var(--text-tertiary)", fontFamily: "var(--font-body)" }}>84-month running total of all transportation costs</div>
              </div>
              <div style={{ position: "relative", height: "90px" }}>
                <svg width="100%" height="90" viewBox={`0 0 ${svgW} 90`} preserveAspectRatio="none">
                  {result.breakEvenMonth != null && (
                    <line x1={result.breakEvenMonth} y1={0} x2={result.breakEvenMonth} y2={90}
                      stroke="oklch(0.72 0.19 145)" strokeWidth="1" strokeDasharray="3 2" vectorEffect="non-scaling-stroke" />
                  )}
                  <polyline
                    points={result.breakEvenChart.map((d, i) => `${i + 1},${Math.round(90 - (d.currentCumCost / chartMax) * 82)}`).join(" ")}
                    fill="none" stroke="var(--text-muted)" strokeWidth="1.5" vectorEffect="non-scaling-stroke"
                  />
                  <polyline
                    points={result.breakEvenChart.map((d, i) => `${i + 1},${Math.round(90 - (d.newCumCost / chartMax) * 82)}`).join(" ")}
                    fill="none" stroke={CAR_COLOR} strokeWidth="2" vectorEffect="non-scaling-stroke"
                  />
                </svg>
                <div style={{ position: "absolute", left: 0, bottom: 0, fontSize: "9px", fontFamily: "var(--font-mono)", color: "var(--text-muted)" }}>Month 1</div>
                <div style={{ position: "absolute", right: 0, bottom: 0, fontSize: "9px", fontFamily: "var(--font-mono)", color: "var(--text-muted)" }}>Month 84</div>
              </div>
              <div style={{ display: "flex", gap: "16px", marginTop: "10px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                  <div style={{ width: "16px", height: "2px", background: "var(--text-muted)" }} />
                  <span style={{ fontSize: "10px", color: "var(--text-muted)", fontFamily: "var(--font-body)" }}>Current car</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                  <div style={{ width: "16px", height: "2px", background: CAR_COLOR }} />
                  <span style={{ fontSize: "10px", color: "var(--text-muted)", fontFamily: "var(--font-body)" }}>New car</span>
                </div>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
