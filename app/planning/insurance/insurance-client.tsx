"use client";

import { useState, useMemo } from "react";
import Link from "next/link";

function fmt(n: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

const inputStyle: React.CSSProperties = { width: "100%", padding: "9px 11px", borderRadius: "8px", border: "1px solid var(--border-subtle)", background: "var(--bg-base)", color: "var(--text-primary)", fontSize: "14px", fontFamily: "var(--font-body)", outline: "none", boxSizing: "border-box" };
const labelStyle: React.CSSProperties = { display: "block", fontSize: "10px", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--text-tertiary)", marginBottom: "6px" };
const cardStyle: React.CSSProperties = { background: "var(--bg-card)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-lg, 14px)", padding: "16px 18px" };

export default function InsuranceClient({
  annualIncome, mortgageBalance, otherDebt, liquidSavings, netWorth, dependents,
}: {
  annualIncome: number; mortgageBalance: number; otherDebt: number; liquidSavings: number; netWorth: number; dependents: number;
}) {
  const [income, setIncome] = useState<number>(annualIncome);
  const [yearsSupport, setYearsSupport] = useState<number>(dependents > 0 ? 15 : 10);
  const [mortgage, setMortgage] = useState<number>(mortgageBalance);
  const [debts, setDebts] = useState<number>(otherDebt);
  const [finalExpenses, setFinalExpenses] = useState<number>(15000);
  const [collegePerChild, setCollegePerChild] = useState<number>(dependents > 0 ? 100000 : 0);
  const [kids, setKids] = useState<number>(dependents);
  const [existingLife, setExistingLife] = useState<number>(0);
  const [savingsOffset, setSavingsOffset] = useState<number>(liquidSavings);
  const [employerDisabilityPct, setEmployerDisabilityPct] = useState<number>(0);

  const calc = useMemo(() => {
    // DIME-plus income-replacement method for life insurance need.
    const incomeNeed = income * yearsSupport;
    const college = collegePerChild * kids;
    const grossNeed = incomeNeed + mortgage + debts + finalExpenses + college;
    const offsets = existingLife + savingsOffset;
    const lifeGap = Math.max(0, grossNeed - offsets);
    // Disability: protect ~65% of income; long-term disability is the most-overlooked policy.
    const monthlyIncome = income / 12;
    const disabilityTarget = monthlyIncome * 0.65;
    const employerCovers = monthlyIncome * (employerDisabilityPct / 100);
    const disabilityGap = Math.max(0, disabilityTarget - employerCovers);
    // Umbrella: liability coverage to protect net worth; recommended once assets are exposed.
    const umbrellaRec = netWorth >= 500_000 ? Math.ceil((netWorth + 0) / 1_000_000) * 1_000_000 : netWorth >= 300_000 ? 1_000_000 : 0;
    return { grossNeed, offsets, lifeGap, incomeNeed, college, disabilityTarget, employerCovers, disabilityGap, umbrellaRec };
  }, [income, yearsSupport, mortgage, debts, finalExpenses, collegePerChild, kids, existingLife, savingsOffset, netWorth, employerDisabilityPct]);

  const wellCovered = calc.lifeGap <= 0;

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", color: "var(--text-primary)", fontFamily: "var(--font-body)" }}>
      <div style={{ padding: "12px 24px", borderBottom: "1px solid var(--border-subtle)", background: "var(--bg-base)", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "3px" }}>
          <Link href="/planning?tab=events" style={{ display: "flex", alignItems: "center", gap: "5px", fontSize: "12px", color: "var(--text-muted)", textDecoration: "none" }}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M10 3L5 8l5 5" strokeLinecap="round" strokeLinejoin="round" /></svg>
            Planning
          </Link>
          <span style={{ color: "var(--border)" }}>/</span>
          <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)" }}>Insurance</span>
        </div>
        <div style={{ display: "flex", alignItems: "baseline", gap: "10px" }}>
          <span style={{ fontSize: "16px", fontWeight: 700 }}>Protection Planner</span>
          <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>How much life, disability, and liability coverage you actually need</span>
        </div>
      </div>

      <div className="bt-page-content" style={{ flex: 1, overflowY: "auto", padding: "20px 24px 80px", display: "flex", flexDirection: "column", gap: "16px", maxWidth: "760px" }}>

        {/* Life inputs */}
        <div style={cardStyle}>
          <span style={{ fontFamily: "var(--font-display)", fontSize: "13px", fontWeight: 700, display: "block", marginBottom: "12px" }}>Your situation</span>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "14px" }}>
            <div><label style={labelStyle}>Annual income</label><input style={inputStyle} type="number" min="0" value={income || ""} onChange={(e) => setIncome(Number(e.target.value) || 0)} /></div>
            <div><label style={labelStyle}>Years to replace</label><input style={inputStyle} type="number" min="0" value={yearsSupport || ""} onChange={(e) => setYearsSupport(Number(e.target.value) || 0)} /></div>
            <div><label style={labelStyle}>Mortgage balance</label><input style={inputStyle} type="number" min="0" value={mortgage || ""} onChange={(e) => setMortgage(Number(e.target.value) || 0)} /></div>
            <div><label style={labelStyle}>Other debts</label><input style={inputStyle} type="number" min="0" value={debts || ""} onChange={(e) => setDebts(Number(e.target.value) || 0)} /></div>
            <div><label style={labelStyle}>Dependents (kids)</label><input style={inputStyle} type="number" min="0" value={kids || ""} onChange={(e) => setKids(Number(e.target.value) || 0)} /></div>
            <div><label style={labelStyle}>College / child</label><input style={inputStyle} type="number" min="0" value={collegePerChild || ""} onChange={(e) => setCollegePerChild(Number(e.target.value) || 0)} /></div>
            <div><label style={labelStyle}>Existing life coverage</label><input style={inputStyle} type="number" min="0" value={existingLife || ""} onChange={(e) => setExistingLife(Number(e.target.value) || 0)} /></div>
            <div><label style={labelStyle}>Savings to offset</label><input style={inputStyle} type="number" min="0" value={savingsOffset || ""} onChange={(e) => setSavingsOffset(Number(e.target.value) || 0)} /></div>
          </div>
        </div>

        {/* Life verdict */}
        <div style={cardStyle}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", flexWrap: "wrap", gap: "8px", marginBottom: "12px" }}>
            <span style={{ fontFamily: "var(--font-display)", fontSize: "13px", fontWeight: 700 }}>Life insurance</span>
            <span style={{ fontSize: "11px", color: "var(--text-tertiary)" }}>income-replacement + DIME method</span>
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: "10px", marginBottom: "12px" }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: "30px", fontWeight: 700, color: wellCovered ? "var(--green)" : "var(--brand-blue, #2563eb)" }}>{fmt(calc.lifeGap)}</span>
            <span style={{ fontSize: "12px", color: "var(--text-tertiary)" }}>{wellCovered ? "you're covered" : "additional coverage suggested"}</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "12px" }}>
            {([
              ["Income replacement", calc.incomeNeed, `${yearsSupport} yrs`],
              ["Mortgage payoff", mortgage, ""],
              ["Other debts + final expenses", debts + finalExpenses, ""],
              ["College funding", calc.college, kids > 0 ? `${kids} × ${fmt(collegePerChild)}` : ""],
              ["Less existing coverage + savings", -(calc.offsets), ""],
            ] as [string, number, string][]).filter(([, v]) => v !== 0).map(([label, v, sub]) => (
              <div key={label} style={{ display: "flex", justifyContent: "space-between", gap: "10px", color: "var(--text-secondary)" }}>
                <span>{label}{sub && <span style={{ color: "var(--text-muted)" }}> · {sub}</span>}</span>
                <span style={{ fontFamily: "var(--font-mono)", color: v < 0 ? "var(--green)" : "var(--text-primary)" }}>{v < 0 ? "−" : ""}{fmt(Math.abs(v))}</span>
              </div>
            ))}
            <div style={{ display: "flex", justifyContent: "space-between", gap: "10px", borderTop: "1px solid var(--border-subtle)", paddingTop: "6px", marginTop: "2px", fontWeight: 700 }}>
              <span>Total need</span>
              <span style={{ fontFamily: "var(--font-mono)" }}>{fmt(calc.grossNeed)}</span>
            </div>
          </div>
          <p style={{ fontSize: "11px", color: "var(--text-tertiary)", marginTop: "12px", lineHeight: 1.55 }}>
            Term life is usually the right tool — a 20–30 year level term policy for this amount typically costs far less than whole life. Revisit when a kid is born, you buy a home, or your income jumps.
          </p>
        </div>

        {/* Disability + Umbrella */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "16px" }}>
          <div style={cardStyle}>
            <span style={{ fontFamily: "var(--font-display)", fontSize: "13px", fontWeight: 700, display: "block", marginBottom: "10px" }}>Disability income</span>
            <div style={{ marginBottom: "10px" }}>
              <label style={labelStyle}>Employer LTD covers (% of income)</label>
              <input style={{ ...inputStyle, maxWidth: "120px" }} type="number" min="0" max="100" value={employerDisabilityPct || ""} onChange={(e) => setEmployerDisabilityPct(Number(e.target.value) || 0)} placeholder="0" />
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: "8px" }}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: "20px", fontWeight: 700, color: calc.disabilityGap > 0 ? "var(--amber)" : "var(--green)" }}>{fmt(Math.round(calc.disabilityGap))}/mo</span>
              <span style={{ fontSize: "11px", color: "var(--text-tertiary)" }}>{calc.disabilityGap > 0 ? "private coverage gap" : "covered"}</span>
            </div>
            <p style={{ fontSize: "11px", color: "var(--text-tertiary)", marginTop: "10px", lineHeight: 1.5 }}>A working-age person is far more likely to be disabled than die young. Aim to protect ~65% of income; employer group LTD often falls short and is taxable.</p>
          </div>
          <div style={cardStyle}>
            <span style={{ fontFamily: "var(--font-display)", fontSize: "13px", fontWeight: 700, display: "block", marginBottom: "10px" }}>Umbrella liability</span>
            <div style={{ display: "flex", alignItems: "baseline", gap: "8px" }}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: "20px", fontWeight: 700, color: calc.umbrellaRec > 0 ? "var(--brand-blue, #2563eb)" : "var(--text-tertiary)" }}>{calc.umbrellaRec > 0 ? fmt(calc.umbrellaRec) : "Optional"}</span>
              <span style={{ fontSize: "11px", color: "var(--text-tertiary)" }}>suggested</span>
            </div>
            <p style={{ fontSize: "11px", color: "var(--text-tertiary)", marginTop: "10px", lineHeight: 1.5 }}>
              {calc.umbrellaRec > 0
                ? `With ${fmt(netWorth)} in net worth exposed, an umbrella policy (cheap, ~$200–400/yr per $1M) shields your assets from a lawsuit beyond your auto/home limits.`
                : "Umbrella policies matter most once your net worth exceeds your liability limits. Revisit as your assets grow."}
            </p>
          </div>
        </div>

        <p style={{ fontSize: "11px", color: "var(--text-tertiary)", lineHeight: 1.6, margin: 0 }}>
          Planning estimates, not insurance advice. Coverage needs are personal — these methods give you a defensible starting number to take to a fee-only advisor or broker.
        </p>
      </div>
    </div>
  );
}
