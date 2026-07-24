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
function pct(n: number, d = 1): string {
  return `${n.toFixed(d)}%`;
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

// One year of amortization → principal paid, interest paid, ending balance.
function amortizeYear(balance: number, monthlyRate: number, payment: number) {
  let b = balance, principal = 0, interest = 0;
  for (let m = 0; m < 12 && b > 0; m++) {
    const i = b * monthlyRate;
    const p = Math.min(b, payment - i);
    interest += i; principal += Math.max(0, p); b -= Math.max(0, p);
  }
  return { principal, interest, endBalance: Math.max(0, b) };
}

// IRR via bisection on the NPV sign change. Returns a decimal rate or null.
function irr(cashflows: number[]): number | null {
  const npv = (rate: number) => cashflows.reduce((s, cf, i) => s + cf / Math.pow(1 + rate, i), 0);
  let lo = -0.95, hi = 1.5;
  let flo = npv(lo), fhi = npv(hi);
  if (flo * fhi > 0) return null;
  for (let k = 0; k < 200; k++) {
    const mid = (lo + hi) / 2;
    const f = npv(mid);
    if (Math.abs(f) < 1) return mid;
    if (flo * f < 0) { hi = mid; fhi = f; } else { lo = mid; flo = f; }
  }
  return (lo + hi) / 2;
}

export default function RentalClient({ liquidAssets }: { liquidAssets: number }) {
  // Deal
  const [price, setPrice] = useState(350000);
  const [downPct, setDownPct] = useState(25);
  const [rate, setRate] = useState(7);
  const [termYears, setTermYears] = useState(30);
  const [closingPct, setClosingPct] = useState(3);
  // Income
  const [rent, setRent] = useState(2600);
  const [otherIncome, setOtherIncome] = useState(0); // parking, laundry etc. / mo
  const [vacancyPct, setVacancyPct] = useState(6);
  const [rentGrowthPct, setRentGrowthPct] = useState(3);
  // Operating
  const [propTaxAnnual, setPropTaxAnnual] = useState(4200);
  const [insuranceAnnual, setInsuranceAnnual] = useState(1600);
  const [maintenancePct, setMaintenancePct] = useState(8); // % of rent
  const [mgmtPct, setMgmtPct] = useState(8); // % of rent
  const [capexPct, setCapexPct] = useState(5); // % of rent reserve
  const [hoaMonthly, setHoaMonthly] = useState(0);
  const [utilitiesMonthly, setUtilitiesMonthly] = useState(0);
  // Assumptions / exit
  const [appreciationPct, setAppreciationPct] = useState(3);
  const [holdYears, setHoldYears] = useState(10);
  const [sellingCostPct, setSellingCostPct] = useState(7);
  const [taxRatePct, setTaxRatePct] = useState(24);
  const [marketReturnPct, setMarketReturnPct] = useState(8);

  const calc = useMemo(() => {
    const down = price * (downPct / 100);
    const loan = Math.max(0, price - down);
    const mr = rate / 100 / 12;
    const n = termYears * 12;
    const mortgage = loan > 0 ? (mr > 0 ? (loan * mr * Math.pow(1 + mr, n)) / (Math.pow(1 + mr, n) - 1) : loan / n) : 0;
    const closing = price * (closingPct / 100);
    const cashInvested = down + closing;

    const grossMonthly = rent + otherIncome;
    const grossAnnual = grossMonthly * 12;
    const egiAnnual = grossAnnual * (1 - vacancyPct / 100);

    // Operating expenses (exclude debt service). % items are on gross rent.
    const variablePctAnnual = (rent * 12) * ((maintenancePct + mgmtPct + capexPct) / 100);
    const fixedAnnual = propTaxAnnual + insuranceAnnual + (hoaMonthly + utilitiesMonthly) * 12;
    const opExAnnual = variablePctAnnual + fixedAnnual;

    const noiAnnual = egiAnnual - opExAnnual;
    const debtServiceAnnual = mortgage * 12;
    const cashFlowAnnual = noiAnnual - debtServiceAnnual;

    const capRate = price > 0 ? (noiAnnual / price) * 100 : 0;
    const cashOnCash = cashInvested > 0 ? (cashFlowAnnual / cashInvested) * 100 : 0;
    const dscr = debtServiceAnnual > 0 ? noiAnnual / debtServiceAnnual : Infinity;
    const grm = grossAnnual > 0 ? price / grossAnnual : 0;
    const onePctRule = price > 0 ? (rent / price) * 100 : 0;
    const opExRatio = egiAnnual > 0 ? (opExAnnual / egiAnnual) * 100 : 0; // 50% rule check
    // Break-even rent: rent where cash flow = 0 (holding vacancy + % expenses proportional to rent).
    // cashFlow = (rent+other)*12*(1-v) - [propTax+ins+(hoa+util)*12] - rent*12*(pctSum) - debtService
    const pctSum = (maintenancePct + mgmtPct + capexPct) / 100;
    const vac = 1 - vacancyPct / 100;
    // 0 = 12*vac*(R+other) - fixed - 12*pctSum*R - debtService
    const denom = 12 * vac - 12 * pctSum;
    const breakEvenRent = denom !== 0 ? (fixedAnnual + debtServiceAnnual - 12 * vac * otherIncome) / denom : 0;

    // ── First-year total-return components ──
    const yr1 = amortizeYear(loan, mr, mortgage);
    const principalY1 = yr1.principal;
    const appreciationY1 = price * (appreciationPct / 100);
    const buildingValue = price * 0.85; // ~15% land, non-depreciable
    const depreciation = buildingValue / 27.5;
    // Taxable rental income = NOI - mortgage interest - depreciation
    const taxableRental = noiAnnual - yr1.interest - depreciation;
    const taxEffect = -taxableRental * (taxRatePct / 100); // positive = tax saved (paper loss shelters income)
    const totalReturnY1 = cashFlowAnnual + principalY1 + appreciationY1 + taxEffect;
    const totalRoiY1 = cashInvested > 0 ? (totalReturnY1 / cashInvested) * 100 : 0;

    // ── Multi-year projection ──
    type Row = { year: number; rent: number; cashFlow: number; loanBalance: number; value: number; equity: number; cumCF: number };
    const rows: Row[] = [];
    let bal = loan;
    let cumCF = 0;
    let accumDepr = 0;
    for (let y = 1; y <= holdYears; y++) {
      const grow = Math.pow(1 + rentGrowthPct / 100, y - 1);
      const rentY = rent * grow;
      const otherY = otherIncome * grow;
      const grossAnnualY = (rentY + otherY) * 12;
      const egiY = grossAnnualY * (1 - vacancyPct / 100);
      const variableY = rentY * 12 * pctSum;
      const fixedY = (propTaxAnnual + insuranceAnnual) * Math.pow(1.025, y - 1) + (hoaMonthly + utilitiesMonthly) * 12;
      const noiY = egiY - (variableY + fixedY);
      const am = amortizeYear(bal, mr, mortgage);
      const cashFlowY = noiY - mortgage * 12;
      bal = am.endBalance;
      accumDepr += depreciation;
      const valueY = price * Math.pow(1 + appreciationPct / 100, y);
      cumCF += cashFlowY;
      rows.push({ year: y, rent: rentY, cashFlow: cashFlowY, loanBalance: bal, value: valueY, equity: valueY - bal, cumCF });
    }

    // ── Sale at end of hold ──
    const exitValue = price * Math.pow(1 + appreciationPct / 100, holdYears);
    const sellingCosts = exitValue * (sellingCostPct / 100);
    const exitLoan = rows.length ? rows[rows.length - 1].loanBalance : loan;
    const grossEquityAtSale = exitValue - exitLoan;
    const capGain = Math.max(0, exitValue - sellingCosts - price);
    const capGainsTax = capGain * 0.15; // long-term, illustrative
    const recaptureTax = accumDepr * 0.25; // depreciation recapture, illustrative
    const netSaleProceeds = exitValue - sellingCosts - exitLoan - capGainsTax - recaptureTax;

    // ── IRR (cash invested out, yearly cash flow, sale proceeds at end) ──
    const flows: number[] = [-cashInvested];
    for (let y = 0; y < rows.length; y++) {
      flows.push(rows[y].cashFlow + (y === rows.length - 1 ? netSaleProceeds : 0));
    }
    const irrVal = irr(flows);

    // ── vs. stock market: same cash invested compounded ──
    const marketFV = cashInvested * Math.pow(1 + marketReturnPct / 100, holdYears);
    const marketGain = marketFV - cashInvested;
    const propertyTotal = cumCF + netSaleProceeds; // total cash back from property over hold
    const propertyGain = propertyTotal - cashInvested;

    return {
      down, loan, mortgage, closing, cashInvested,
      grossMonthly, egiAnnual, opExAnnual, noiAnnual, debtServiceAnnual, cashFlowAnnual,
      capRate, cashOnCash, dscr, grm, onePctRule, opExRatio, breakEvenRent,
      principalY1, appreciationY1, depreciation, taxEffect, totalReturnY1, totalRoiY1, interestY1: yr1.interest,
      rows, exitValue, sellingCosts, exitLoan, grossEquityAtSale, capGainsTax, recaptureTax, netSaleProceeds,
      irrVal, marketFV, marketGain, propertyTotal, propertyGain, accumDepr,
    };
  }, [price, downPct, rate, termYears, closingPct, rent, otherIncome, vacancyPct, rentGrowthPct, propTaxAnnual, insuranceAnnual, maintenancePct, mgmtPct, capexPct, hoaMonthly, utilitiesMonthly, appreciationPct, holdYears, sellingCostPct, taxRatePct, marketReturnPct]);

  const positive = calc.cashFlowAnnual >= 0;
  const grade = calc.cashOnCash >= 8 && calc.capRate >= 6 ? { label: "Strong deal", color: "var(--green)" }
    : calc.cashFlowAnnual >= 0 && calc.capRate >= 4 ? { label: "Workable deal", color: "var(--amber, #f59e0b)" }
    : { label: "Weak deal", color: "var(--red)" };

  // ── Stress tests ──
  const stresses = useMemo(() => {
    const base = calc.cashFlowAnnual;
    const vacShock = calc.cashFlowAnnual - (rent * 12) * 0.10 * (1 - 0); // +10pt vacancy ≈ lose 10% of gross rent
    const rentDrop = calc.cashFlowAnnual - (rent * 12) * 0.10 * (1 - vacancyPct / 100); // rents -10%
    const repair = -8000; // one-time major repair impact on the year
    const rateBump = (() => {
      const loan = calc.loan; const mr2 = (rate + 2) / 100 / 12; const n = termYears * 12;
      const m2 = loan > 0 ? (loan * mr2 * Math.pow(1 + mr2, n)) / (Math.pow(1 + mr2, n) - 1) : 0;
      return calc.cashFlowAnnual - (m2 - calc.mortgage) * 12;
    })();
    return { base, vacShock, rentDrop, repair: base + repair, rateBump };
  }, [calc, rent, vacancyPct, rate, termYears]);

  // Chart bounds for projection (value + equity)
  const chart = useMemo(() => {
    if (!calc.rows.length) return null;
    const maxVal = Math.max(...calc.rows.map((r) => r.value));
    const W = 320, H = 130, pad = 6;
    const x = (i: number) => (calc.rows.length <= 1 ? 0 : (i / (calc.rows.length - 1)) * W);
    const y = (v: number) => H - pad - (v / maxVal) * (H - 2 * pad);
    const line = (key: "value" | "equity") => calc.rows.map((r, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(r[key]).toFixed(1)}`).join(" ");
    return { W, H, valueLine: line("value"), equityLine: line("equity"), maxVal };
  }, [calc.rows]);

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
          <span style={{ fontSize: "16px", fontWeight: 700 }}>Rental Property Analyzer</span>
          <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>Cash flow, full return stack, multi-year projection, and a market comparison</span>
        </div>
      </div>

      <div className="bt-page-content" style={{ flex: 1, overflowY: "auto", padding: "20px 24px 80px", display: "flex", flexDirection: "column", gap: "16px", maxWidth: "1000px", width: "100%", margin: "0 auto" }}>

        {/* Verdict hero */}
        <div style={{ ...cardStyle, background: `linear-gradient(135deg, color-mix(in srgb, ${grade.color} 8%, var(--bg-card)), var(--bg-card))`, border: `1px solid color-mix(in srgb, ${grade.color} 28%, transparent)` }}>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
            <div>
              <div style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: grade.color }}>{grade.label}</div>
              <div style={{ fontSize: "28px", fontWeight: 800, fontFamily: "var(--font-display)", letterSpacing: "-1px", color: positive ? "var(--green)" : "var(--red)", lineHeight: 1.1, marginTop: "2px" }}>
                {fmtSigned(Math.round(calc.cashFlowAnnual / 12))}<span style={{ fontSize: "14px", color: "var(--text-tertiary)", fontWeight: 600 }}>/mo cash flow</span>
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: "10px", color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Total return yr 1</div>
              <div style={{ fontSize: "22px", fontWeight: 800, fontFamily: "var(--font-mono)", color: "var(--text-primary)" }}>{pct(calc.totalRoiY1)}</div>
              <div style={{ fontSize: "10px", color: "var(--text-tertiary)" }}>incl. equity + tax</div>
            </div>
          </div>
        </div>

        {/* Inputs: The deal */}
        <div style={cardStyle}>
          <span style={sectionTitle}>The deal</span>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "14px" }}>
            <div><label style={labelStyle}>Purchase price</label><input style={inputStyle} type="number" min="0" value={price || ""} onChange={(e) => setPrice(Number(e.target.value) || 0)} /></div>
            <div><label style={labelStyle}>Down payment (%)</label><input style={inputStyle} type="number" min="0" max="100" value={downPct || ""} onChange={(e) => setDownPct(Number(e.target.value) || 0)} /></div>
            <div><label style={labelStyle}>Interest rate (%)</label><input style={inputStyle} type="number" min="0" step="0.1" value={rate || ""} onChange={(e) => setRate(Number(e.target.value) || 0)} /></div>
            <div><label style={labelStyle}>Term (years)</label><input style={inputStyle} type="number" min="1" value={termYears || ""} onChange={(e) => setTermYears(Number(e.target.value) || 0)} /></div>
            <div><label style={labelStyle}>Closing costs (%)</label><input style={inputStyle} type="number" min="0" step="0.5" value={closingPct || ""} onChange={(e) => setClosingPct(Number(e.target.value) || 0)} /></div>
          </div>
        </div>

        {/* Inputs: Income */}
        <div style={cardStyle}>
          <span style={sectionTitle}>Income</span>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "14px" }}>
            <div><label style={labelStyle}>Monthly rent</label><input style={inputStyle} type="number" min="0" value={rent || ""} onChange={(e) => setRent(Number(e.target.value) || 0)} /></div>
            <div><label style={labelStyle}>Other income / mo<HintDot text="Parking, laundry, storage, pet rent — anything beyond base rent." /></label><input style={inputStyle} type="number" min="0" value={otherIncome || ""} onChange={(e) => setOtherIncome(Number(e.target.value) || 0)} /></div>
            <div><label style={labelStyle}>Vacancy (%)<HintDot text="Share of the year the unit sits empty between tenants. 5-8% is typical." /></label><input style={inputStyle} type="number" min="0" max="100" value={vacancyPct || ""} onChange={(e) => setVacancyPct(Number(e.target.value) || 0)} /></div>
            <div><label style={labelStyle}>Rent growth / yr (%)</label><input style={inputStyle} type="number" min="0" step="0.5" value={rentGrowthPct || ""} onChange={(e) => setRentGrowthPct(Number(e.target.value) || 0)} /></div>
          </div>
        </div>

        {/* Inputs: Operating costs */}
        <div style={cardStyle}>
          <span style={sectionTitle}>Operating costs</span>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "14px" }}>
            <div><label style={labelStyle}>Property tax / yr</label><input style={inputStyle} type="number" min="0" value={propTaxAnnual || ""} onChange={(e) => setPropTaxAnnual(Number(e.target.value) || 0)} /></div>
            <div><label style={labelStyle}>Insurance / yr</label><input style={inputStyle} type="number" min="0" value={insuranceAnnual || ""} onChange={(e) => setInsuranceAnnual(Number(e.target.value) || 0)} /></div>
            <div><label style={labelStyle}>Maintenance (% rent)</label><input style={inputStyle} type="number" min="0" value={maintenancePct || ""} onChange={(e) => setMaintenancePct(Number(e.target.value) || 0)} /></div>
            <div><label style={labelStyle}>Management (% rent)<HintDot text="Property-manager fee. Use 0 if you self-manage — but value your time." /></label><input style={inputStyle} type="number" min="0" value={mgmtPct || ""} onChange={(e) => setMgmtPct(Number(e.target.value) || 0)} /></div>
            <div><label style={labelStyle}>CapEx reserve (% rent)<HintDot text="Money set aside for big-ticket replacements (roof, HVAC, water heater). Often skipped — and it sinks returns when it shouldn't be." /></label><input style={inputStyle} type="number" min="0" value={capexPct || ""} onChange={(e) => setCapexPct(Number(e.target.value) || 0)} /></div>
            <div><label style={labelStyle}>HOA / mo</label><input style={inputStyle} type="number" min="0" value={hoaMonthly || ""} onChange={(e) => setHoaMonthly(Number(e.target.value) || 0)} /></div>
            <div><label style={labelStyle}>Utilities / mo<HintDot text="Only what the owner pays (e.g. water/trash). Leave 0 if tenants cover utilities." /></label><input style={inputStyle} type="number" min="0" value={utilitiesMonthly || ""} onChange={(e) => setUtilitiesMonthly(Number(e.target.value) || 0)} /></div>
          </div>
        </div>

        {/* Inputs: Assumptions & exit */}
        <div style={cardStyle}>
          <span style={sectionTitle}>Assumptions &amp; exit</span>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "14px" }}>
            <div><label style={labelStyle}>Appreciation / yr (%)</label><input style={inputStyle} type="number" min="0" step="0.5" value={appreciationPct || ""} onChange={(e) => setAppreciationPct(Number(e.target.value) || 0)} /></div>
            <div><label style={labelStyle}>Hold period (years)</label><input style={inputStyle} type="number" min="1" max="40" value={holdYears || ""} onChange={(e) => setHoldYears(Number(e.target.value) || 0)} /></div>
            <div><label style={labelStyle}>Selling costs (%)<HintDot text="Agent commissions + transfer taxes + closing when you sell. ~6-8%." /></label><input style={inputStyle} type="number" min="0" step="0.5" value={sellingCostPct || ""} onChange={(e) => setSellingCostPct(Number(e.target.value) || 0)} /></div>
            <div><label style={labelStyle}>Your tax rate (%)<HintDot text="Marginal rate used to estimate the tax shelter from depreciation + interest. Rental paper losses can offset income (subject to IRS limits)." /></label><input style={inputStyle} type="number" min="0" max="50" value={taxRatePct || ""} onChange={(e) => setTaxRatePct(Number(e.target.value) || 0)} /></div>
            <div><label style={labelStyle}>Market return (%)<HintDot text="Assumed return if you invested the same cash in the stock market instead — used for the head-to-head below." /></label><input style={inputStyle} type="number" min="0" step="0.5" value={marketReturnPct || ""} onChange={(e) => setMarketReturnPct(Number(e.target.value) || 0)} /></div>
          </div>
        </div>

        {/* Key metrics */}
        <div style={cardStyle}>
          <span style={sectionTitle}>Key metrics</span>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(118px, 1fr))", gap: "16px 12px" }}>
            <Metric label="Cap rate" hint="NOI ÷ price. The unlevered yield — what the property earns ignoring the mortgage. 5-8% is healthy in most markets." value={pct(calc.capRate)} accent={calc.capRate >= 6 ? "var(--green)" : calc.capRate >= 4 ? "var(--amber, #f59e0b)" : "var(--red)"} />
            <Metric label="Cash-on-cash" hint="Annual cash flow ÷ cash you put in. Your actual return on the money invested, before equity/appreciation." value={pct(calc.cashOnCash)} accent={calc.cashOnCash >= 8 ? "var(--green)" : calc.cashOnCash >= 5 ? "var(--amber, #f59e0b)" : "var(--red)"} />
            <Metric label="DSCR" hint="NOI ÷ debt service. Lenders want ≥ 1.2 — below 1.0 means rent doesn't cover the mortgage." value={Number.isFinite(calc.dscr) ? calc.dscr.toFixed(2) : "—"} accent={calc.dscr >= 1.2 ? "var(--green)" : calc.dscr >= 1 ? "var(--amber, #f59e0b)" : "var(--red)"} />
            <Metric label="NOI / yr" hint="Net operating income: rent minus all operating costs, before the mortgage." value={fmt(Math.round(calc.noiAnnual))} />
            <Metric label="1% rule" hint="Monthly rent as a % of price. The classic screen wants ≥ 1%." value={pct(calc.onePctRule, 2)} accent={calc.onePctRule >= 1 ? "var(--green)" : "var(--amber, #f59e0b)"} />
            <Metric label="Expense ratio" hint="Operating costs as a % of effective income (the '50% rule' guideline). Above ~50% eats returns." value={pct(calc.opExRatio)} accent={calc.opExRatio <= 50 ? "var(--green)" : "var(--amber, #f59e0b)"} />
            <Metric label="GRM" hint="Gross rent multiplier: price ÷ annual gross rent. Lower is cheaper relative to rent; compare within a market." value={calc.grm.toFixed(1)} />
            <Metric label="Break-even rent" hint="The monthly rent at which cash flow hits zero. Your cushion is the gap between this and market rent." value={fmt(Math.round(calc.breakEvenRent))} accent={rent >= calc.breakEvenRent ? "var(--green)" : "var(--red)"} />
          </div>
        </div>

        {/* Total return stack */}
        <div style={cardStyle}>
          <span style={sectionTitle}>Where the year-1 return comes from<HintDot text="Cash flow is only part of the story. A rental also pays you through loan paydown, appreciation, and a tax shelter. Here's the full stack on your invested cash." /></span>
          <ReturnStack
            cashInvested={calc.cashInvested}
            parts={[
              { label: "Cash flow", value: calc.cashFlowAnnual, color: "var(--green)" },
              { label: "Loan paydown", value: calc.principalY1, color: "#0ea5a0" },
              { label: "Appreciation", value: calc.appreciationY1, color: "#3fae4a" },
              { label: "Tax effect", value: calc.taxEffect, color: calc.taxEffect >= 0 ? "#14b8a6" : "#ef4444" },
            ]}
            total={calc.totalReturnY1}
            roi={calc.totalRoiY1}
          />
          <p style={{ fontSize: "10px", color: "var(--text-tertiary)", marginTop: "10px", lineHeight: 1.5 }}>
            Appreciation and loan paydown are unrealized (you only get them on sale/refi). Tax effect estimates the shelter from {fmt(Math.round(calc.depreciation))}/yr depreciation + {fmt(Math.round(calc.interestY1))} interest at a {taxRatePct}% rate — real treatment depends on income limits; confirm with a CPA.
          </p>
        </div>

        {/* Projection */}
        {chart && (
          <div style={cardStyle}>
            <span style={sectionTitle}>{holdYears}-year projection</span>
            <svg viewBox={`0 0 ${chart.W} ${chart.H}`} preserveAspectRatio="none" style={{ width: "100%", height: "130px", display: "block" }}>
              <path d={`${chart.valueLine} L${chart.W},${chart.H} L0,${chart.H} Z`} fill="rgba(63,174,74,0.10)" />
              <path d={chart.valueLine} fill="none" stroke="#3fae4a" strokeWidth="2" strokeLinejoin="round" />
              <path d={chart.equityLine} fill="none" stroke="#22c55e" strokeWidth="2" strokeLinejoin="round" />
            </svg>
            <div style={{ display: "flex", gap: "16px", margin: "8px 0 14px", fontSize: "10.5px" }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: "5px", color: "var(--text-secondary)" }}><span style={{ width: "14px", height: "2px", background: "#3fae4a" }} /> Property value</span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: "5px", color: "var(--text-secondary)" }}><span style={{ width: "14px", height: "2px", background: "var(--green)" }} /> Your equity</span>
            </div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11.5px", fontFamily: "var(--font-mono)" }}>
                <thead>
                  <tr style={{ color: "var(--text-tertiary)", textAlign: "right" }}>
                    <th style={{ textAlign: "left", fontWeight: 600, padding: "4px 8px" }}>Yr</th>
                    <th style={{ fontWeight: 600, padding: "4px 8px" }}>Rent/mo</th>
                    <th style={{ fontWeight: 600, padding: "4px 8px" }}>Cash flow</th>
                    <th style={{ fontWeight: 600, padding: "4px 8px" }}>Value</th>
                    <th style={{ fontWeight: 600, padding: "4px 8px" }}>Equity</th>
                    <th style={{ fontWeight: 600, padding: "4px 8px" }}>Cum. CF</th>
                  </tr>
                </thead>
                <tbody>
                  {calc.rows.filter((r) => r.year === 1 || r.year % Math.max(1, Math.round(holdYears / 6)) === 0 || r.year === holdYears).map((r) => (
                    <tr key={r.year} style={{ borderTop: "1px solid var(--border-subtle)", textAlign: "right" }}>
                      <td style={{ textAlign: "left", padding: "5px 8px", color: "var(--text-secondary)" }}>{r.year}</td>
                      <td style={{ padding: "5px 8px", color: "var(--text-secondary)" }}>{fmt(Math.round(r.rent))}</td>
                      <td style={{ padding: "5px 8px", color: r.cashFlow >= 0 ? "var(--green)" : "var(--red)" }}>{fmtSigned(Math.round(r.cashFlow))}</td>
                      <td style={{ padding: "5px 8px", color: "var(--text-secondary)" }}>{fmt(Math.round(r.value))}</td>
                      <td style={{ padding: "5px 8px", color: "var(--text-primary)" }}>{fmt(Math.round(r.equity))}</td>
                      <td style={{ padding: "5px 8px", color: r.cumCF >= 0 ? "var(--text-secondary)" : "var(--red)" }}>{fmtSigned(Math.round(r.cumCF))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Exit + IRR */}
        <div style={cardStyle}>
          <span style={sectionTitle}>Exit after {holdYears} years</span>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(118px, 1fr))", gap: "16px 12px", marginBottom: "12px" }}>
            <Metric label="Sale price" value={fmt(Math.round(calc.exitValue))} />
            <Metric label="− Selling costs" value={fmt(Math.round(calc.sellingCosts))} accent="var(--text-secondary)" />
            <Metric label="− Loan payoff" value={fmt(Math.round(calc.exitLoan))} accent="var(--text-secondary)" />
            <Metric label="− Taxes" hint="Capital gains (~15%) on the gain plus depreciation recapture (~25% on the depreciation you took). Illustrative." value={fmt(Math.round(calc.capGainsTax + calc.recaptureTax))} accent="var(--text-secondary)" />
            <Metric label="Net proceeds" value={fmt(Math.round(calc.netSaleProceeds))} accent="var(--green)" />
            <Metric label="Deal IRR" hint="Internal rate of return on the whole hold — cash in, yearly cash flow, and net sale proceeds. The single best summary number." value={calc.irrVal != null ? pct(calc.irrVal * 100) : "—"} accent={calc.irrVal != null && calc.irrVal * 100 >= marketReturnPct ? "var(--green)" : "var(--amber, #f59e0b)"} />
          </div>
        </div>

        {/* vs Market */}
        <div style={cardStyle}>
          <span style={sectionTitle}>Rental vs. the stock market<HintDot text={`If you invested the ${fmt(Math.round(calc.cashInvested))} cash-to-close in the market at ${marketReturnPct}% instead, how would it compare over ${holdYears} years?`} /></span>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            <div style={{ padding: "12px 14px", borderRadius: "10px", background: "rgba(63,174,74,0.06)", border: "1px solid rgba(63,174,74,0.18)" }}>
              <div style={{ fontSize: "10px", color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em" }}>This rental</div>
              <div style={{ fontSize: "20px", fontWeight: 800, fontFamily: "var(--font-mono)", color: "var(--text-primary)", marginTop: "3px" }}>{fmt(Math.round(calc.propertyTotal))}</div>
              <div style={{ fontSize: "10.5px", color: "var(--text-tertiary)", marginTop: "3px" }}>cash flow + net sale · {fmtSigned(Math.round(calc.propertyGain))} gain</div>
            </div>
            <div style={{ padding: "12px 14px", borderRadius: "10px", background: "var(--bg-base)", border: "1px solid var(--border-subtle)" }}>
              <div style={{ fontSize: "10px", color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Market @ {marketReturnPct}%</div>
              <div style={{ fontSize: "20px", fontWeight: 800, fontFamily: "var(--font-mono)", color: "var(--text-primary)", marginTop: "3px" }}>{fmt(Math.round(calc.marketFV))}</div>
              <div style={{ fontSize: "10.5px", color: "var(--text-tertiary)", marginTop: "3px" }}>same cash invested · {fmtSigned(Math.round(calc.marketGain))} gain</div>
            </div>
          </div>
          <div style={{ marginTop: "12px", padding: "10px 12px", borderRadius: "10px", background: calc.propertyTotal >= calc.marketFV ? "rgba(34,197,94,0.08)" : "rgba(245,158,11,0.08)", border: `1px solid ${calc.propertyTotal >= calc.marketFV ? "rgba(34,197,94,0.18)" : "rgba(245,158,11,0.18)"}`, fontSize: "12px", color: "var(--text-secondary)", lineHeight: 1.55 }}>
            {calc.propertyTotal >= calc.marketFV
              ? `The rental comes out ahead by ${fmt(Math.round(calc.propertyTotal - calc.marketFV))} over ${holdYears} years — and that's before the leverage and tax advantages compound further. The trade-off is effort, illiquidity, and concentration in one asset.`
              : `The market wins this one by ${fmt(Math.round(calc.marketFV - calc.propertyTotal))} over ${holdYears} years, with zero tenants, repairs, or illiquidity. The rental needs higher rent, a better price, or more appreciation to justify the work.`}
          </div>
        </div>

        {/* Stress tests */}
        <div style={cardStyle}>
          <span style={sectionTitle}>Stress tests<HintDot text="What happens to annual cash flow when things go wrong. A deal that only works in the best case isn't a deal." /></span>
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <StressRow label="Base case" value={stresses.base} />
            <StressRow label="Rents drop 10%" value={stresses.rentDrop} />
            <StressRow label="Vacancy +10 pts" value={stresses.vacShock} />
            <StressRow label="Rate +2% (refi)" value={stresses.rateBump} />
            <StressRow label="Major repair ($8k)" value={stresses.repair} />
          </div>
        </div>

        {/* Add to plan */}
        {calc.cashInvested > 0 && (
          <div style={cardStyle}>
            <span style={sectionTitle}>Add to your plan</span>
            <AddToPlanButton
              label="Rental property"
              category="other"
              amountImpact={-Math.round(calc.cashInvested)}
              recurringAnnual={Math.round(calc.cashFlowAnnual)}
              note={`Models the ${fmt(Math.round(calc.cashInvested))} cash to close and the ${calc.cashFlowAnnual >= 0 ? "+" : ""}${fmt(Math.round(calc.cashFlowAnnual))}/yr cash flow. Equity build (${fmt(Math.round(calc.grossEquityAtSale))} at sale) is upside on top.`}
            />
            {liquidAssets > 0 && <p style={{ fontSize: "11px", color: "var(--text-tertiary)", margin: "10px 0 0" }}>You have {fmt(liquidAssets)} in liquid cash — this deal needs {fmt(Math.round(calc.cashInvested))} to close.</p>}
          </div>
        )}
      </div>
    </div>
  );
}

function Metric({ label, value, sub, accent, hint }: { label: string; value: string; sub?: string; accent?: string; hint?: string }) {
  return (
    <div>
      <div style={{ fontSize: "10px", color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "5px", display: "flex", alignItems: "center" }}>{label}{hint && <HintDot text={hint} />}</div>
      <div style={{ fontSize: "19px", fontWeight: 700, fontFamily: "var(--font-display)", letterSpacing: "-0.5px", color: accent ?? "var(--text-primary)", lineHeight: 1.1 }}>{value}</div>
      {sub && <div style={{ fontSize: "10px", color: "var(--text-tertiary)", marginTop: "5px" }}>{sub}</div>}
    </div>
  );
}

function ReturnStack({ parts, total, roi, cashInvested }: { parts: { label: string; value: number; color: string }[]; total: number; roi: number; cashInvested: number }) {
  const positives = parts.filter((p) => p.value > 0);
  const sumPos = positives.reduce((s, p) => s + p.value, 0) || 1;
  return (
    <div>
      <div style={{ display: "flex", height: "16px", borderRadius: "8px", overflow: "hidden", background: "rgba(148,163,184,0.12)", marginBottom: "12px" }}>
        {positives.map((p) => (
          <div key={p.label} title={`${p.label}: ${fmt(Math.round(p.value))}`} style={{ width: `${(p.value / sumPos) * 100}%`, background: p.color }} />
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: "10px" }}>
        {parts.map((p) => (
          <div key={p.label} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ width: "9px", height: "9px", borderRadius: "2px", background: p.color, flexShrink: 0, opacity: p.value === 0 ? 0.3 : 1 }} />
            <div>
              <div style={{ fontSize: "11px", color: "var(--text-secondary)" }}>{p.label}</div>
              <div style={{ fontSize: "13px", fontWeight: 700, fontFamily: "var(--font-mono)", color: p.value >= 0 ? "var(--text-primary)" : "var(--red)" }}>{fmtSigned(Math.round(p.value))}</div>
            </div>
          </div>
        ))}
      </div>
      <div style={{ marginTop: "12px", paddingTop: "12px", borderTop: "1px solid var(--border-subtle)", display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
        <span style={{ fontSize: "12px", color: "var(--text-tertiary)" }}>Total year-1 return on {fmt(Math.round(cashInvested))} invested</span>
        <span style={{ fontSize: "18px", fontWeight: 800, fontFamily: "var(--font-mono)", color: total >= 0 ? "var(--green)" : "var(--red)" }}>{fmtSigned(Math.round(total))} · {pct(roi)}</span>
      </div>
    </div>
  );
}

function StressRow({ label, value }: { label: string; value: number }) {
  const ok = value >= 0;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "8px 11px", borderRadius: "8px", background: ok ? "rgba(34,197,94,0.05)" : "rgba(239,68,68,0.06)", border: `1px solid ${ok ? "rgba(34,197,94,0.15)" : "rgba(239,68,68,0.18)"}` }}>
      <span style={{ width: "7px", height: "7px", borderRadius: "50%", background: ok ? "var(--green)" : "var(--red)", flexShrink: 0 }} />
      <span style={{ fontSize: "12.5px", color: "var(--text-secondary)", flex: 1 }}>{label}</span>
      <span style={{ fontSize: "13px", fontWeight: 700, fontFamily: "var(--font-mono)", color: ok ? "var(--green)" : "var(--red)" }}>{fmtSigned(Math.round(value))}/yr</span>
    </div>
  );
}
