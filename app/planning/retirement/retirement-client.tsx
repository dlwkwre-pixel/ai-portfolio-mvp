"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import InfoTooltip from "@/app/components/info-tooltip";

function fmt(n: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

const inputStyle: React.CSSProperties = { width: "100%", padding: "9px 11px", borderRadius: "8px", border: "1px solid var(--border-subtle)", background: "var(--bg-base)", color: "var(--text-primary)", fontSize: "14px", fontFamily: "var(--font-body)", outline: "none", boxSizing: "border-box" };
const labelStyle: React.CSSProperties = { display: "flex", alignItems: "center", fontSize: "10px", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--text-tertiary)", marginBottom: "6px" };
const cardStyle: React.CSSProperties = { background: "var(--bg-card)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-lg, 14px)", padding: "16px 18px" };
const sectionTitle: React.CSSProperties = { fontFamily: "var(--font-display)", fontSize: "13px", fontWeight: 700, display: "flex", alignItems: "center", marginBottom: "12px" };

function HintDot({ text }: { text: string }) {
  return (
    <InfoTooltip text={text} align="start" width={240}>
      <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: "14px", height: "14px", borderRadius: "50%", marginLeft: "5px", cursor: "help", background: "rgba(63,174,74,0.12)", border: "1px solid rgba(63,174,74,0.3)", color: "var(--accent, #5fbf9a)", fontSize: "10px", fontWeight: 700 }}>?</span>
    </InfoTooltip>
  );
}

const FRA = 67; // Full retirement age (born 1960+)

// Social Security benefit as a multiple of PIA (benefit at FRA), by claim age.
function ssFactor(claimAge: number): number {
  const a = Math.max(62, Math.min(70, claimAge));
  if (a < FRA) {
    const monthsEarly = (FRA - a) * 12;
    const first36 = Math.min(36, monthsEarly);
    const beyond = Math.max(0, monthsEarly - 36);
    return 1 - (first36 * (5 / 9) / 100 + beyond * (5 / 12) / 100);
  }
  if (a > FRA) return 1 + ((a - FRA) * 12) * (2 / 3) / 100;
  return 1;
}

// IRS Uniform Lifetime Table divisor (RMDs begin at 73).
const RMD_TABLE: Record<number, number> = { 73: 26.5, 74: 25.5, 75: 24.6, 76: 23.7, 77: 22.9, 78: 22, 79: 21.1, 80: 20.2, 81: 19.4, 82: 18.5, 83: 17.7, 84: 16.8, 85: 16, 86: 15.2, 87: 14.4, 88: 13.7, 89: 12.9, 90: 12.2, 91: 11.5, 92: 10.8, 93: 10.1, 94: 9.5, 95: 8.9 };
function rmdDivisor(age: number): number {
  if (age < 73) return Infinity;
  return RMD_TABLE[age] ?? Math.max(2, 8.9 - (age - 95) * 0.6);
}

type Balances = { taxable: number; traditional: number; roth: number };
type SimResult = { series: { age: number; balance: number }[]; depletionAge: number | null; lifetimeTax: number; finalBalance: number };

function simulate(opts: {
  claimAge: number; balances: Balances; spendToday: number; currentAge: number; retireAge: number; planAge: number;
  ret: number; infl: number; pia: number; tradTaxRate: number;
}): SimResult {
  let { taxable, traditional, roth } = opts.balances;
  const r = opts.ret / 100, infl = opts.infl / 100, taxRate = opts.tradTaxRate / 100;

  // Grow today's balances to the retirement start.
  for (let i = 0; i < Math.max(0, opts.retireAge - opts.currentAge); i++) { taxable *= 1 + r; traditional *= 1 + r; roth *= 1 + r; }

  const monthlyAtClaim = opts.pia * ssFactor(opts.claimAge);
  let lifetimeTax = 0;
  let depletionAge: number | null = null;
  const series: { age: number; balance: number }[] = [];

  for (let age = opts.retireAge; age <= opts.planAge; age++) {
    const spend = opts.spendToday * Math.pow(1 + infl, age - opts.currentAge);
    const ssAnnual = age >= opts.claimAge ? monthlyAtClaim * 12 * Math.pow(1 + infl, age - opts.claimAge) : 0;
    let need = Math.max(0, spend - ssAnnual);

    const rmd = age >= 73 && traditional > 0 ? traditional / rmdDivisor(age) : 0;

    // Taxable first.
    const fromTaxable = Math.min(taxable, need); taxable -= fromTaxable; need -= fromTaxable;
    // Traditional (gross up for tax).
    let tradGross = 0;
    if (need > 0 && traditional > 0) {
      const grossNeeded = need / (1 - taxRate);
      tradGross = Math.min(traditional, grossNeeded);
      traditional -= tradGross; lifetimeTax += tradGross * taxRate; need -= tradGross * (1 - taxRate);
    }
    // Enforce RMD beyond what we already pulled (excess net reinvested to taxable).
    if (rmd > tradGross) {
      const extra = Math.min(traditional, rmd - tradGross);
      traditional -= extra; lifetimeTax += extra * taxRate; taxable += extra * (1 - taxRate);
    }
    // Roth last.
    if (need > 0 && roth > 0) { const fromRoth = Math.min(roth, need); roth -= fromRoth; need -= fromRoth; }

    if (need > 0.5 && depletionAge === null) depletionAge = age;
    series.push({ age, balance: Math.max(0, taxable + traditional + roth) });

    taxable *= 1 + r; traditional *= 1 + r; roth *= 1 + r;
  }
  return { series, depletionAge, lifetimeTax, finalBalance: Math.max(0, taxable + traditional + roth) };
}

type Prefill = { currentAge: number; retirementAge: number; traditionalBalance: number; grossMonthlyIncome: number | null; married: boolean };

export default function RetirementClient({ prefill }: { prefill: Prefill }) {
  const [currentAge, setCurrentAge] = useState(prefill.currentAge);
  const [retireAge, setRetireAge] = useState(Math.max(prefill.currentAge + 1, prefill.retirementAge || 65));
  const [planAge, setPlanAge] = useState(92);
  const [taxable, setTaxable] = useState(50000);
  const [traditional, setTraditional] = useState(prefill.traditionalBalance || 300000);
  const [roth, setRoth] = useState(100000);
  const [spend, setSpend] = useState(prefill.grossMonthlyIncome ? Math.round(prefill.grossMonthlyIncome * 12 * 0.7) : 60000);
  const [ret, setRet] = useState(6);
  const [infl, setInfl] = useState(2.5);
  const [pia, setPia] = useState(2400);
  const [tradTaxRate, setTradTaxRate] = useState(15);
  const [claimAge, setClaimAge] = useState(67);

  const balances: Balances = { taxable, traditional, roth };
  const base = { balances, spendToday: spend, currentAge, retireAge, planAge, ret, infl, pia, tradTaxRate };

  const sim = useMemo(() => simulate({ ...base, claimAge }), [taxable, traditional, roth, spend, currentAge, retireAge, planAge, ret, infl, pia, tradTaxRate, claimAge]);
  const sim62 = useMemo(() => simulate({ ...base, claimAge: 62 }), [taxable, traditional, roth, spend, currentAge, retireAge, planAge, ret, infl, pia, tradTaxRate]);
  const sim70 = useMemo(() => simulate({ ...base, claimAge: 70 }), [taxable, traditional, roth, spend, currentAge, retireAge, planAge, ret, infl, pia, tradTaxRate]);

  // SS claiming comparison (nominal lifetime to plan age, no COLA — for a clean apples-to-apples).
  const ssAges = [62, FRA, 70];
  const ssCompare = ssAges.map((a) => {
    const monthly = pia * ssFactor(a);
    const years = Math.max(0, planAge - a);
    return { age: a, monthly, lifetime: monthly * 12 * years };
  });
  // Breakeven age: 62 vs 70.
  const m62 = pia * ssFactor(62), m70 = pia * ssFactor(70);
  let breakeven: number | null = null;
  for (let age = 70; age <= 100; age++) {
    const cum62 = m62 * 12 * (age - 62);
    const cum70 = m70 * 12 * (age - 70);
    if (cum70 >= cum62) { breakeven = age; break; }
  }

  const lasts = sim.depletionAge === null;
  const verdictColor = lasts ? "var(--green)" : sim.depletionAge! >= planAge - 3 ? "var(--amber, #f59e0b)" : "var(--red)";

  // Chart
  const chart = useMemo(() => {
    if (!sim.series.length) return null;
    const maxVal = Math.max(...sim.series.map((s) => s.balance), 1);
    const W = 320, H = 120, pad = 6;
    const x = (i: number) => (sim.series.length <= 1 ? 0 : (i / (sim.series.length - 1)) * W);
    const y = (v: number) => H - pad - (v / maxVal) * (H - 2 * pad);
    const path = sim.series.map((s, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(s.balance).toFixed(1)}`).join(" ");
    return { W, H, path, maxVal };
  }, [sim.series]);

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", color: "var(--text-primary)", fontFamily: "var(--font-body)" }}>
      <div style={{ padding: "12px 24px", borderBottom: "1px solid var(--border-subtle)", background: "var(--bg-base)", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "3px" }}>
          <Link href="/planning" style={{ display: "flex", alignItems: "center", gap: "5px", fontSize: "12px", color: "var(--text-muted)", textDecoration: "none" }}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M10 3L5 8l5 5" strokeLinecap="round" strokeLinejoin="round" /></svg>
            Planning
          </Link>
          <span style={{ color: "var(--border)" }}>/</span>
          <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)" }}>Retirement Income</span>
        </div>
        <div style={{ display: "flex", alignItems: "baseline", gap: "10px" }}>
          <span style={{ fontSize: "16px", fontWeight: 700 }}>Retirement Income Planner</span>
          <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>Social Security timing, withdrawal order, and how long the money lasts</span>
        </div>
      </div>

      <div className="bt-page-content" style={{ flex: 1, overflowY: "auto", padding: "20px 24px 80px", display: "flex", flexDirection: "column", gap: "16px", maxWidth: "1000px", width: "100%", margin: "0 auto" }}>

        {/* Verdict hero */}
        <div style={{ ...cardStyle, background: `linear-gradient(135deg, color-mix(in srgb, ${verdictColor} 8%, var(--bg-card)), var(--bg-card))`, border: `1px solid color-mix(in srgb, ${verdictColor} 28%, transparent)` }}>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
            <div>
              <div style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: verdictColor }}>{lasts ? "On track" : "Shortfall"}</div>
              <div style={{ fontSize: "26px", fontWeight: 800, fontFamily: "var(--font-display)", letterSpacing: "-1px", color: "var(--text-primary)", lineHeight: 1.1, marginTop: "2px" }}>
                {lasts ? `Lasts past age ${planAge}` : `Money runs out at ${sim.depletionAge}`}
              </div>
              <div style={{ fontSize: "11px", color: "var(--text-tertiary)", marginTop: "2px" }}>claiming SS at {claimAge} · {fmt(taxable + traditional + roth)} saved today</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: "10px", color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em" }}>{lasts ? `Est. left at ${planAge}` : "Lifetime tax"}</div>
              <div style={{ fontSize: "22px", fontWeight: 800, fontFamily: "var(--font-mono)", color: "var(--text-primary)" }}>{lasts ? fmt(sim.finalBalance) : fmt(sim.lifetimeTax)}</div>
              <div style={{ fontSize: "10px", color: "var(--text-tertiary)" }}>{lasts ? "legacy / cushion" : "on traditional withdrawals"}</div>
            </div>
          </div>
        </div>

        {/* Inputs */}
        <div style={cardStyle}>
          <span style={sectionTitle}>Your situation</span>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "14px" }}>
            <div><label style={labelStyle}>Current age</label><input style={inputStyle} type="number" min="18" max="90" value={currentAge || ""} onChange={(e) => setCurrentAge(Number(e.target.value) || 0)} /></div>
            <div><label style={labelStyle}>Retire at</label><input style={inputStyle} type="number" min={currentAge + 1} max="80" value={retireAge || ""} onChange={(e) => setRetireAge(Number(e.target.value) || 0)} /></div>
            <div><label style={labelStyle}>Plan to age<HintDot text="How long to fund. Planning to ~92-95 is prudent — many people live longer than the average, and running out is the real risk." /></label><input style={inputStyle} type="number" min={retireAge + 1} max="105" value={planAge || ""} onChange={(e) => setPlanAge(Number(e.target.value) || 0)} /></div>
            <div><label style={labelStyle}>Spending / yr (today $)<HintDot text="Annual spending in today's dollars; we inflate it each year. A common rule of thumb is ~70-80% of pre-retirement income." /></label><input style={inputStyle} type="number" min="0" value={spend || ""} onChange={(e) => setSpend(Number(e.target.value) || 0)} /></div>
            <div><label style={labelStyle}>Return / yr (%)</label><input style={inputStyle} type="number" min="0" step="0.5" value={ret || ""} onChange={(e) => setRet(Number(e.target.value) || 0)} /></div>
            <div><label style={labelStyle}>Inflation (%)</label><input style={inputStyle} type="number" min="0" step="0.5" value={infl || ""} onChange={(e) => setInfl(Number(e.target.value) || 0)} /></div>
          </div>
          <div style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--text-tertiary)", margin: "16px 0 8px" }}>Balances by tax treatment</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "14px" }}>
            <div><label style={labelStyle}>Taxable<HintDot text="Regular brokerage / cash. Drawn first so tax-advantaged accounts keep compounding. Only gains are taxed (lightly here)." /></label><input style={inputStyle} type="number" min="0" value={taxable || ""} onChange={(e) => setTaxable(Number(e.target.value) || 0)} /></div>
            <div><label style={labelStyle}>Traditional / 401k<HintDot text="Pre-tax (Traditional IRA/401k). Every dollar withdrawn is taxed as income, and RMDs are forced starting at 73." /></label><input style={inputStyle} type="number" min="0" value={traditional || ""} onChange={(e) => setTraditional(Number(e.target.value) || 0)} /></div>
            <div><label style={labelStyle}>Roth<HintDot text="Tax-free, no RMDs. Drawn last so it compounds tax-free as long as possible — great for legacy and late-life flexibility." /></label><input style={inputStyle} type="number" min="0" value={roth || ""} onChange={(e) => setRoth(Number(e.target.value) || 0)} /></div>
            <div><label style={labelStyle}>Tax rate on traditional (%)<HintDot text="Your estimated effective tax rate in retirement on Traditional withdrawals. Lower than your working rate for most people." /></label><input style={inputStyle} type="number" min="0" max="50" value={tradTaxRate || ""} onChange={(e) => setTradTaxRate(Number(e.target.value) || 0)} /></div>
          </div>
        </div>

        {/* SS optimizer */}
        <div style={cardStyle}>
          <span style={sectionTitle}>When to claim Social Security<HintDot text="Claiming early (62) locks in a permanently smaller check; waiting to 70 grows it ~8%/yr. The right answer depends on how long you live and whether you need the income sooner." /></span>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "10px", marginBottom: "12px" }}>
            {ssCompare.map((s) => {
              const selected = claimAge === s.age;
              return (
                <button key={s.age} type="button" onClick={() => setClaimAge(s.age)} style={{ textAlign: "left", padding: "12px 13px", borderRadius: "10px", cursor: "pointer", fontFamily: "var(--font-body)",
                  border: `1px solid ${selected ? "var(--brand-blue, #0ea5a0)" : "var(--border-subtle)"}`, background: selected ? "rgba(14,165,160,0.1)" : "var(--bg-base)" }}>
                  <div style={{ fontSize: "11px", color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Age {s.age}{s.age === FRA ? " (FRA)" : s.age === 62 ? " (earliest)" : " (max)"}</div>
                  <div style={{ fontSize: "20px", fontWeight: 800, fontFamily: "var(--font-mono)", color: "var(--text-primary)", marginTop: "2px" }}>{fmt(s.monthly)}<span style={{ fontSize: "11px", color: "var(--text-tertiary)", fontWeight: 600 }}>/mo</span></div>
                  <div style={{ fontSize: "10.5px", color: "var(--text-tertiary)", marginTop: "3px" }}>{fmt(s.lifetime)} to {planAge}</div>
                </button>
              );
            })}
          </div>
          <div style={{ padding: "10px 12px", borderRadius: "10px", background: "rgba(63,174,74,0.05)", border: "1px solid rgba(63,174,74,0.18)", fontSize: "12px", color: "var(--text-secondary)", lineHeight: 1.55 }}>
            {breakeven != null
              ? `Claiming at 70 pays ${fmt(m70)}/mo vs ${fmt(m62)}/mo at 62. Waiting pulls ahead in total dollars once you live past about age ${breakeven}. If your health and family history point past ${breakeven}, delaying usually wins; if you need income early or have reason to expect a shorter horizon, claiming sooner can be the better call.`
              : `Claiming at 70 pays ${fmt(m70)}/mo vs ${fmt(m62)}/mo at 62 — a ${fmt(m70 - m62)}/mo difference for life.`}
          </div>
        </div>

        {/* Drawdown projection */}
        {chart && (
          <div style={cardStyle}>
            <span style={sectionTitle}>How long the money lasts<HintDot text="Your total savings across all accounts, drawn down each year to cover spending after Social Security. If the line hits zero before your plan age, that's a shortfall to close." /></span>
            <svg viewBox={`0 0 ${chart.W} ${chart.H}`} preserveAspectRatio="none" style={{ width: "100%", height: "120px", display: "block" }}>
              <path d={`${chart.path} L${chart.W},${chart.H} L0,${chart.H} Z`} fill={lasts ? "rgba(34,197,94,0.08)" : "rgba(239,68,68,0.08)"} />
              <path d={chart.path} fill="none" stroke={lasts ? "#22c55e" : "#ef4444"} strokeWidth="2" strokeLinejoin="round" />
            </svg>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "10px", color: "var(--text-muted)", fontFamily: "var(--font-mono)", marginTop: "4px" }}>
              <span>age {retireAge}</span><span>age {planAge}</span>
            </div>
            <div style={{ marginTop: "12px", padding: "10px 12px", borderRadius: "10px", background: lasts ? "rgba(34,197,94,0.08)" : "rgba(239,68,68,0.08)", border: `1px solid ${lasts ? "rgba(34,197,94,0.18)" : "rgba(239,68,68,0.18)"}`, fontSize: "12px", color: "var(--text-secondary)", lineHeight: 1.55 }}>
              {lasts
                ? `Your plan funds spending through age ${planAge} with about ${fmt(sim.finalBalance)} left over — a cushion for longevity, care costs, or legacy. Lifetime tax on Traditional withdrawals: ~${fmt(sim.lifetimeTax)}.`
                : `At this spending level the money runs out at age ${sim.depletionAge} — ${planAge - sim.depletionAge!} years short. Close the gap by spending less, working a bit longer, delaying Social Security, or saving more before you retire.`}
            </div>
          </div>
        )}

        {/* Claim-age longevity impact */}
        <div style={cardStyle}>
          <span style={sectionTitle}>Does claiming age change how long it lasts?<HintDot text="Delaying Social Security means leaning on your portfolio more in the gap years, but a much bigger inflation-protected check later. This compares portfolio longevity under each." /></span>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            <div style={{ padding: "12px 14px", borderRadius: "10px", background: "var(--bg-base)", border: "1px solid var(--border-subtle)" }}>
              <div style={{ fontSize: "10px", color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Claim at 62</div>
              <div style={{ fontSize: "18px", fontWeight: 800, fontFamily: "var(--font-mono)", marginTop: "3px", color: "var(--text-primary)" }}>{sim62.depletionAge === null ? `Lasts past ${planAge}` : `Runs out at ${sim62.depletionAge}`}</div>
              <div style={{ fontSize: "10.5px", color: "var(--text-tertiary)", marginTop: "3px" }}>{fmt(m62)}/mo · {sim62.depletionAge === null ? `${fmt(sim62.finalBalance)} left` : "shortfall"}</div>
            </div>
            <div style={{ padding: "12px 14px", borderRadius: "10px", background: "rgba(63,174,74,0.06)", border: "1px solid rgba(63,174,74,0.18)" }}>
              <div style={{ fontSize: "10px", color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Claim at 70</div>
              <div style={{ fontSize: "18px", fontWeight: 800, fontFamily: "var(--font-mono)", marginTop: "3px", color: "var(--text-primary)" }}>{sim70.depletionAge === null ? `Lasts past ${planAge}` : `Runs out at ${sim70.depletionAge}`}</div>
              <div style={{ fontSize: "10.5px", color: "var(--text-tertiary)", marginTop: "3px" }}>{fmt(m70)}/mo · {sim70.depletionAge === null ? `${fmt(sim70.finalBalance)} left` : "shortfall"}</div>
            </div>
          </div>
        </div>

        {/* Withdrawal order explainer */}
        <div style={cardStyle}>
          <span style={sectionTitle}>The withdrawal order this uses</span>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {[
              { n: 1, t: "Taxable first", d: "Spend brokerage/cash early. Only gains are taxed, and it lets your tax-advantaged accounts keep compounding." },
              { n: 2, t: "Traditional next", d: "Pre-tax withdrawals are taxed as income. RMDs force these starting at 73 — drawing some earlier can smooth your tax bracket." },
              { n: 3, t: "Roth last", d: "Tax-free with no RMDs, so it compounds longest. Best preserved for late-life flexibility, big one-off costs, and legacy." },
            ].map((s) => (
              <div key={s.n} style={{ display: "flex", gap: "11px", alignItems: "flex-start" }}>
                <span style={{ width: "20px", height: "20px", borderRadius: "50%", background: "rgba(14,165,160,0.12)", color: "var(--brand-blue, #0ea5a0)", fontSize: "11px", fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: "1px" }}>{s.n}</span>
                <div><span style={{ fontSize: "12.5px", fontWeight: 700, color: "var(--text-primary)" }}>{s.t}</span><span style={{ fontSize: "12px", color: "var(--text-secondary)" }}> — {s.d}</span></div>
              </div>
            ))}
          </div>
        </div>

        <p style={{ fontSize: "10px", color: "var(--text-tertiary)", margin: 0, lineHeight: 1.5 }}>
          A simplified model for planning, not tax or retirement advice. It approximates RMDs and uses one effective tax rate; real sequencing (bracket-filling, Roth conversions, SS taxation, IRMAA) is more nuanced — a fee-only advisor can fine-tune it.
        </p>
      </div>
    </div>
  );
}
