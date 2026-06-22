"use client";

import { useMemo, useState, useTransition } from "react";
import {
  compute401k,
  compare401kScenarios,
  defaultScenarioPercents,
} from "@/lib/tax/retirement-401k";
import { contributionLimits } from "@/lib/tax/contribution-limits";
import type { FilingStatus, IncomeType } from "@/lib/tax/estimator";
import { upsert401kSettings } from "./planning-actions";

type Profile = {
  gross_monthly_income: number | null;
  filing_status: string | null;
  income_type: string | null;
  state_code: string | null;
  current_age: number | null;
  pre_tax_deductions_annual: number | null;
  has_401k?: boolean;
  k401_contribution_pct?: number | null;
  k401_is_roth?: boolean;
  k401_employer_match_pct?: number | null;
  k401_employer_match_limit_pct?: number | null;
  k401_current_balance?: number | null;
  emergency_fund_months?: number | null;
};

const fmt = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const fmtPct = (n: number) => `${n.toLocaleString("en-US", { maximumFractionDigits: 1 })}%`;

const card: React.CSSProperties = {
  background: "var(--card-bg)",
  border: "1px solid var(--card-border)",
  borderRadius: "var(--radius-lg)",
  padding: "20px",
};
const label: React.CSSProperties = {
  fontSize: "11px",
  fontWeight: 700,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color: "var(--text-tertiary)",
  marginBottom: "6px",
  display: "block",
};
const field: React.CSSProperties = {
  width: "100%",
  background: "var(--bg-base)",
  border: "1px solid var(--card-border)",
  borderRadius: "10px",
  padding: "9px 11px",
  fontSize: "13px",
  color: "var(--text-primary)",
  fontFamily: "var(--font-body)",
  outline: "none",
};
const mono: React.CSSProperties = { fontFamily: "var(--font-mono)" };

const PAY_PERIODS: Record<string, { perYear: number; label: string }> = {
  weekly: { perYear: 52, label: "weekly" },
  biweekly: { perYear: 26, label: "every 2 weeks" },
  semimonthly: { perYear: 24, label: "twice a month" },
  monthly: { perYear: 12, label: "monthly" },
};

export default function Plan401kSection({
  profile,
  payFrequency = "biweekly",
  monthlyExpenses = 0,
  assumedReturnPct = 7,
  retirementAge = null,
  liquidAssets = 0,
}: {
  profile: Profile;
  payFrequency?: string;
  monthlyExpenses?: number;
  assumedReturnPct?: number;
  retirementAge?: number | null;
  liquidAssets?: number; // cash + taxable accounts available as an emergency buffer
}) {
  const payPeriod = PAY_PERIODS[payFrequency] ?? PAY_PERIODS.biweekly;
  const grossAnnual = (profile.gross_monthly_income ?? 0) * 12;
  const year = new Date().getFullYear();
  const limits = contributionLimits(year);

  const [enrolled, setEnrolled] = useState<boolean>(profile.has_401k ?? false);
  const [pct, setPct] = useState<number>(profile.k401_contribution_pct ?? 0);
  const [isRoth, setIsRoth] = useState<boolean>(profile.k401_is_roth ?? false);
  const [matchPct, setMatchPct] = useState<number>(profile.k401_employer_match_pct ?? 100);
  const [matchLimitPct, setMatchLimitPct] = useState<number>(profile.k401_employer_match_limit_pct ?? 0);
  const [balance, setBalance] = useState<string>(
    profile.k401_current_balance != null ? String(profile.k401_current_balance) : "0"
  );
  const [efMonths, setEfMonths] = useState<number>(profile.emergency_fund_months ?? 6);
  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  const filing = (profile.filing_status as FilingStatus) || "single";
  const incomeType = (profile.income_type as IncomeType) || "w2";
  const stateCode = profile.state_code || "";
  const basePreTax = Math.max(0, profile.pre_tax_deductions_annual ?? 0);

  const result = useMemo(
    () =>
      compute401k({
        grossAnnualIncome: grossAnnual,
        contributionPct: pct,
        isRoth,
        employerMatchPct: matchPct,
        employerMatchLimitPct: matchLimitPct,
        age: profile.current_age,
        year,
      }),
    [grossAnnual, pct, isRoth, matchPct, matchLimitPct, profile.current_age, year]
  );

  const scenarios = useMemo(() => {
    const percents = defaultScenarioPercents(pct, matchLimitPct);
    return compare401kScenarios(
      {
        grossAnnualIncome: grossAnnual,
        filing,
        incomeType,
        stateCode,
        basePreTaxDeductionsAnnual: basePreTax,
        isRoth,
        employerMatchPct: matchPct,
        employerMatchLimitPct: matchLimitPct,
        age: profile.current_age,
        year,
      },
      percents
    );
  }, [grossAnnual, filing, incomeType, stateCode, basePreTax, isRoth, matchPct, matchLimitPct, pct, profile.current_age, year]);

  function save() {
    setError("");
    setSaved(false);
    const fd = new FormData();
    fd.set("has_401k", String(enrolled));
    fd.set("k401_contribution_pct", String(pct));
    fd.set("k401_is_roth", String(isRoth));
    fd.set("k401_employer_match_pct", String(matchPct));
    fd.set("k401_employer_match_limit_pct", String(matchLimitPct));
    fd.set("k401_current_balance", balance);
    fd.set("emergency_fund_months", String(efMonths));
    startTransition(async () => {
      const res = await upsert401kSettings(fd);
      if (res?.error) setError(res.error);
      else { setSaved(true); setTimeout(() => setSaved(false), 2500); }
    });
  }

  // ── No income yet ──────────────────────────────────────────────────────────
  if (grossAnnual <= 0) {
    return (
      <div style={card}>
        <div style={{ fontSize: "15px", fontWeight: 600, color: "var(--text-primary)", fontFamily: "var(--font-display)" }}>
          401(k) & Workplace Retirement
        </div>
        <p style={{ fontSize: "13px", color: "var(--text-secondary)", marginTop: "8px", lineHeight: 1.5 }}>
          Add your gross monthly income in the profile above and Atlas can model your 401(k):
          how much your employer adds, your tax savings, and how each contribution rate changes
          your take-home pay.
        </p>
      </div>
    );
  }

  const monthlyDeferral = result.employeeAnnual / 12;
  const perPaycheck = result.employeeAnnual / payPeriod.perYear;
  const matchValueLabel =
    matchLimitPct > 0
      ? `${matchPct}% match on the first ${fmtPct(matchLimitPct)} of pay`
      : "No employer match set";

  // ── Forward-looking projection: grow current balance + contributions to retirement ──
  const currentBalance = Math.max(0, Number(balance) || 0);
  const retAge = retirementAge ?? 65;
  const yearsToRetire = profile.current_age != null ? Math.max(1, retAge - profile.current_age) : 30;
  const r = Math.max(0, assumedReturnPct / 100);
  const fvFactor = Math.pow(1 + r, yearsToRetire);
  const projectedBalance =
    r > 0
      ? currentBalance * fvFactor + result.totalAnnual * ((fvFactor - 1) / r)
      : currentBalance + result.totalAnnual * yearsToRetire;
  const totalContributed = currentBalance + result.totalAnnual * yearsToRetire;
  const projectedGrowth = Math.max(0, projectedBalance - totalContributed);

  const annualTaxSaved = isRoth ? 0 : scenarios.find((s) => Math.abs(s.pct - pct) < 0.6)?.taxSavedVsZero ?? 0;
  const lifetimeTaxSaved = annualTaxSaved * yearsToRetire;

  // ── Savings-rate recommendation ─────────────────────────────────────────────
  // Order of operations Atlas follows: (1) always capture the full employer match —
  // it's an instant guaranteed return; (2) make sure liquid savings cover the chosen
  // emergency-fund buffer before deferring more; (3) then push the rate as high as the
  // monthly budget comfortably allows, up to a solid long-term target.
  const budgetKnown = monthlyExpenses > 0;
  const matchPctTarget = result.fullMatchPct;
  const TARGET_PCT = 15;

  let affordablePct = matchPctTarget;
  if (budgetKnown) {
    for (const s of scenarios) if (s.takeHomeMonthly >= monthlyExpenses) affordablePct = Math.max(affordablePct, s.pct);
  }

  // Emergency fund: cash + taxable accounts vs the chosen months-of-expenses buffer.
  const emergencyTarget = budgetKnown ? efMonths * monthlyExpenses : 0;
  const monthsCovered = budgetKnown && monthlyExpenses > 0 ? liquidAssets / monthlyExpenses : null;
  const emergencyMet = budgetKnown ? liquidAssets >= emergencyTarget : true;

  let recommendedPct: number;
  let recStage: "nobudget" | "ef" | "grow";
  if (!budgetKnown) {
    recommendedPct = matchPctTarget > 0 ? matchPctTarget : 10;
    recStage = "nobudget";
  } else if (!emergencyMet) {
    // Grab the free match; stay light beyond it until the cash buffer is built.
    recommendedPct = matchPctTarget > 0 ? matchPctTarget : Math.min(3, affordablePct);
    recStage = "ef";
  } else {
    recommendedPct = Math.max(matchPctTarget, Math.min(TARGET_PCT, affordablePct));
    recStage = "grow";
  }
  recommendedPct = Math.round(recommendedPct * 10) / 10;
  const recScenario = scenarios.find((s) => Math.abs(s.pct - recommendedPct) < 0.6);
  const recSurplus = recScenario && budgetKnown ? recScenario.takeHomeMonthly - monthlyExpenses : null;
  const atRecommended = Math.abs(pct - recommendedPct) < 0.6;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
      {/* Header + enroll toggle */}
      <div style={card}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: "15px", fontWeight: 600, color: "var(--text-primary)", fontFamily: "var(--font-display)" }}>
              401(k) & Workplace Retirement
            </div>
            <p style={{ fontSize: "12px", color: "var(--text-secondary)", marginTop: "4px", maxWidth: "60ch", lineHeight: 1.5 }}>
              Model your contribution, capture every dollar of employer match, and see exactly
              how each rate changes your take-home pay. Traditional contributions lower your
              taxable income automatically across BuyTune.
            </p>
          </div>
          <label style={{ display: "inline-flex", alignItems: "center", gap: "8px", cursor: "pointer", whiteSpace: "nowrap" }}>
            <input type="checkbox" checked={enrolled} onChange={(e) => setEnrolled(e.target.checked)} style={{ width: "16px", height: "16px", accentColor: "var(--accent)" }} />
            <span style={{ fontSize: "13px", color: "var(--text-primary)", fontWeight: 500 }}>I have a 401(k)</span>
          </label>
        </div>
      </div>

      {enrolled && (
        <>
          {/* Inputs */}
          <div style={card}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "16px" }}>
              {/* Contribution % with slider */}
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={label}>Your contribution: <span style={{ ...mono, color: "var(--accent)", fontSize: "14px" }}>{fmtPct(pct)}</span> of pay</label>
                <input
                  type="range" min={0} max={Math.max(30, Math.ceil(pct))} step={0.5} value={pct}
                  onChange={(e) => setPct(Number(e.target.value))}
                  style={{ width: "100%", accentColor: "var(--accent)" }}
                />
                <div style={{ display: "flex", alignItems: "center", gap: "10px", marginTop: "6px", flexWrap: "wrap" }}>
                  <input
                    type="number" min={0} max={100} step={0.5} value={pct}
                    onChange={(e) => setPct(Math.max(0, Math.min(100, Number(e.target.value))))}
                    style={{ ...field, width: "90px" }}
                  />
                  <span style={{ fontSize: "12px", color: "var(--text-tertiary)" }}>
                    ≈ {fmt(monthlyDeferral)}/mo · {fmt(perPaycheck)}/paycheck ({payPeriod.label})
                  </span>
                </div>
                <p style={{ fontSize: "11px", color: "var(--text-tertiary)", marginTop: "6px", lineHeight: 1.5 }}>
                  Drag the slider or type any rate (e.g. 4%). There&apos;s no fixed % cap — you can defer up to
                  the {fmt(limits.k401)} IRS {year} limit; your <em>plan</em> may cap the percent of pay you can elect
                  (often 15–100%). We stop the contribution at whichever you hit first.
                </p>
              </div>

              {/* Roth vs Traditional */}
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={label}>Contribution type</label>
                <div style={{ display: "inline-flex", borderRadius: "10px", overflow: "hidden", border: "1px solid var(--card-border)" }}>
                  {[{ v: false, t: "Traditional (pre-tax)" }, { v: true, t: "Roth (after-tax)" }].map((o) => (
                    <button
                      key={String(o.v)} type="button" onClick={() => setIsRoth(o.v)}
                      style={{
                        padding: "8px 14px", fontSize: "12px", fontWeight: 600, border: "none", cursor: "pointer",
                        background: isRoth === o.v ? "var(--accent)" : "transparent",
                        color: isRoth === o.v ? "#fff" : "var(--text-secondary)",
                      }}
                    >
                      {o.t}
                    </button>
                  ))}
                </div>
                <p style={{ fontSize: "11px", color: "var(--text-tertiary)", marginTop: "6px", lineHeight: 1.5 }}>
                  {isRoth
                    ? "Roth: pay tax now, withdrawals in retirement are tax-free. No taxable-income reduction today."
                    : "Traditional: contributions are pre-tax, lowering your taxable income now; you pay tax on withdrawals later."}
                </p>
              </div>

              {/* Employer match */}
              <div>
                <label style={label}>Employer match rate</label>
                <div style={{ position: "relative" }}>
                  <input type="number" min={0} max={200} step={5} value={matchPct} onChange={(e) => setMatchPct(Math.max(0, Number(e.target.value)))} style={field} />
                </div>
                <p style={{ fontSize: "11px", color: "var(--text-tertiary)", marginTop: "4px" }}>100 = dollar-for-dollar, 50 = $0.50 per $1</p>
              </div>
              <div>
                <label style={label}>Matched up to (% of pay)</label>
                <input type="number" min={0} max={100} step={0.5} value={matchLimitPct} onChange={(e) => setMatchLimitPct(Math.max(0, Math.min(100, Number(e.target.value))))} style={field} />
                <p style={{ fontSize: "11px", color: "var(--text-tertiary)", marginTop: "4px" }}>{matchValueLabel}</p>
              </div>

              {/* Current 401(k) balance — defaults to 0 if you haven't started */}
              <div>
                <label style={label}>Current balance</label>
                <input type="number" min={0} step={1000} value={balance} placeholder="0" onChange={(e) => setBalance(e.target.value)} style={field} />
                <p style={{ fontSize: "11px", color: "var(--text-tertiary)", marginTop: "4px" }}>Set to 0 if you haven&apos;t started yet — we project it forward.</p>
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "12px", marginTop: "16px" }}>
              <button
                type="button" onClick={save} disabled={isPending}
                style={{
                  background: "linear-gradient(135deg,#2563eb,#4f46e5)", color: "#fff", border: "none",
                  borderRadius: "10px", padding: "9px 18px", fontSize: "13px", fontWeight: 600,
                  cursor: isPending ? "default" : "pointer", opacity: isPending ? 0.6 : 1,
                }}
              >
                {isPending ? "Saving…" : "Save 401(k) settings"}
              </button>
              {saved && <span style={{ fontSize: "12px", color: "var(--accent)" }}>Saved — take-home updated everywhere ✓</span>}
              {error && <span style={{ fontSize: "12px", color: "#f87171" }}>{error}</span>}
            </div>
          </div>

          {/* Atlas recommendation — what rate to pick, given match + taxes + budget */}
          <div style={{ ...card, borderColor: "rgba(37,99,235,0.35)", background: "linear-gradient(135deg, rgba(37,99,235,0.08), rgba(124,58,237,0.05))" }}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: "220px" }}>
                <div style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--accent)", marginBottom: "6px" }}>Atlas suggests</div>
                <div style={{ display: "flex", alignItems: "baseline", gap: "10px", flexWrap: "wrap" }}>
                  <div style={{ ...mono, fontSize: "30px", fontWeight: 700, color: "var(--text-primary)" }}>{fmtPct(recommendedPct)}</div>
                  <div style={{ fontSize: "12px", color: "var(--text-secondary)" }}>of your pay{atRecommended ? " — you're set here ✓" : ""}</div>
                </div>
                <ul style={{ margin: "10px 0 0", padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: "6px" }}>
                  {matchLimitPct > 0 && (
                    <li style={{ fontSize: "12.5px", color: "var(--text-secondary)", lineHeight: 1.5 }}>
                      ✓ Captures your full employer match at {fmtPct(result.fullMatchPct)} — a guaranteed return you don&apos;t skip even while building cash.
                    </li>
                  )}
                  {/* Emergency-fund gate */}
                  {!budgetKnown ? (
                    <li style={{ fontSize: "12.5px", color: "var(--amber)", lineHeight: 1.5 }}>
                      → Fill out your monthly budget on the Cash Flow tab so Atlas can check your emergency fund and how much you can comfortably defer. For now it just secures your match.
                    </li>
                  ) : !emergencyMet ? (
                    <li style={{ fontSize: "12.5px", color: "var(--amber)", lineHeight: 1.5 }}>
                      ⚠ Build your emergency fund first — you have <strong style={{ color: "var(--text-primary)" }}>{fmt(liquidAssets)}</strong> (~{(monthsCovered ?? 0).toFixed(1)} mo) vs your {efMonths}-month target of <strong style={{ color: "var(--text-primary)" }}>{fmt(emergencyTarget)}</strong>. Atlas held you at the match so spare cash can top up savings.
                    </li>
                  ) : (
                    <li style={{ fontSize: "12.5px", color: "var(--text-secondary)", lineHeight: 1.5 }}>
                      ✓ Emergency fund covered — <strong style={{ color: "var(--text-primary)" }}>{fmt(liquidAssets)}</strong> in savings ≈ {(monthsCovered ?? 0).toFixed(1)} months, past your {efMonths}-month target.
                    </li>
                  )}
                  {!isRoth && annualTaxSaved > 0 && recStage === "grow" && (
                    <li style={{ fontSize: "12.5px", color: "var(--text-secondary)", lineHeight: 1.5 }}>
                      ✓ Pre-tax deferrals trim your income tax — about <strong style={{ color: "var(--text-primary)" }}>{fmt(annualTaxSaved)}/yr</strong> at this rate.
                    </li>
                  )}
                  {recStage === "grow" && recSurplus != null && (
                    <li style={{ fontSize: "12.5px", color: "var(--text-secondary)", lineHeight: 1.5 }}>
                      ✓ Leaves <strong style={{ color: "var(--text-primary)" }}>{fmt(Math.max(0, recSurplus))}/mo</strong> after your budgeted expenses.
                    </li>
                  )}
                </ul>

                {/* Emergency-fund risk tolerance: how many months of expenses to hold in cash */}
                <div style={{ marginTop: "12px", display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                  <span style={{ fontSize: "11px", color: "var(--text-tertiary)" }}>Emergency fund target:</span>
                  {[6, 9, 12].map((m) => (
                    <button
                      key={m} type="button" onClick={() => setEfMonths(m)}
                      style={{
                        fontSize: "12px", fontWeight: 600, padding: "4px 12px", borderRadius: "8px", cursor: "pointer",
                        border: `1px solid ${efMonths === m ? "var(--accent)" : "var(--card-border)"}`,
                        background: efMonths === m ? "var(--accent)" : "transparent",
                        color: efMonths === m ? "#fff" : "var(--text-secondary)",
                      }}
                    >
                      {m} mo
                    </button>
                  ))}
                  <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>more months = more cautious</span>
                </div>
              </div>
              {!atRecommended && (
                <button type="button" onClick={() => setPct(recommendedPct)}
                  style={{ alignSelf: "center", background: "var(--accent)", color: "#fff", border: "none", borderRadius: "10px", padding: "9px 16px", fontSize: "13px", fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}>
                  Use {fmtPct(recommendedPct)}
                </button>
              )}
            </div>
          </div>

          {/* Insights — forward-looking */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "12px" }}>
            {matchLimitPct > 0 && (
              result.capturesFullMatch ? (
                <div style={{ ...card, borderColor: "rgba(16,185,129,0.3)", background: "rgba(16,185,129,0.06)" }}>
                  <div style={{ fontSize: "12px", fontWeight: 700, color: "#34d399", marginBottom: "4px" }}>✓ Full match captured</div>
                  <div style={{ fontSize: "13px", color: "var(--text-secondary)", lineHeight: 1.5 }}>
                    Your employer adds <strong style={{ color: "var(--text-primary)" }}>{fmt(result.employerAnnual)}/yr</strong> — none left on the table.
                  </div>
                </div>
              ) : (
                <div style={{ ...card, borderColor: "rgba(245,158,11,0.35)", background: "rgba(245,158,11,0.08)" }}>
                  <div style={{ fontSize: "12px", fontWeight: 700, color: "var(--amber)", marginBottom: "4px" }}>⚠ Free money on the table</div>
                  <div style={{ fontSize: "13px", color: "var(--text-secondary)", lineHeight: 1.5 }}>
                    Bump to <strong style={{ color: "var(--text-primary)" }}>{fmtPct(result.fullMatchPct)}</strong> to capture
                    {" "}<strong style={{ color: "var(--text-primary)" }}>{fmt(result.unmatchedFreeMoney)}/yr</strong> more — an instant guaranteed return.
                  </div>
                </div>
              )
            )}

            {/* Projected balance at retirement — the forward-looking headline */}
            <div style={card}>
              <div style={{ fontSize: "12px", fontWeight: 700, color: "var(--text-tertiary)", marginBottom: "4px", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                Projected at {retAge}
              </div>
              <div style={{ ...mono, fontSize: "20px", color: "var(--text-primary)", fontWeight: 600 }}>{fmt(projectedBalance)}</div>
              <div style={{ fontSize: "12px", color: "var(--text-secondary)", marginTop: "4px", lineHeight: 1.4 }}>
                {fmt(currentBalance)} today + {fmt(result.totalAnnual)}/yr, compounded {Number(assumedReturnPct.toFixed(2))}% for {yearsToRetire} yrs — about {fmt(projectedGrowth)} of that is growth.
              </div>
            </div>

            {/* Tax saved — this year + projected over the years to retirement */}
            <div style={card}>
              <div style={{ fontSize: "12px", fontWeight: 700, color: "var(--text-tertiary)", marginBottom: "4px", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                {isRoth ? "Roth — taxed now" : "Tax saved"}
              </div>
              <div style={{ ...mono, fontSize: "20px", color: "var(--text-primary)", fontWeight: 600 }}>
                {isRoth ? fmt(0) : `${fmt(annualTaxSaved)}/yr`}
              </div>
              <div style={{ fontSize: "12px", color: "var(--text-secondary)", marginTop: "4px", lineHeight: 1.4 }}>
                {isRoth
                  ? "Roth is taxed now; qualified withdrawals in retirement are tax-free."
                  : `≈ ${fmt(lifetimeTaxSaved)} kept over ${yearsToRetire} yrs at today's rate. FICA still applies.`}
                {result.cappedByIrs && <span style={{ color: "var(--amber)" }}> · capped at the {fmt(result.irsEmployeeLimit)} IRS {year} limit</span>}
              </div>
            </div>
          </div>

          {/* Scenario comparison */}
          <div style={card}>
            <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)", marginBottom: "4px" }}>
              How your contribution rate changes things
            </div>
            <p style={{ fontSize: "12px", color: "var(--text-tertiary)", marginBottom: "12px" }}>
              Monthly take-home is your pay after tax and after the contribution leaves your check. Employer match is on top of that.
            </p>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12.5px" }}>
                <thead>
                  <tr style={{ color: "var(--text-tertiary)", textAlign: "right" }}>
                    <th style={{ textAlign: "left", padding: "6px 8px", fontWeight: 600 }}>Rate</th>
                    <th style={{ padding: "6px 8px", fontWeight: 600 }}>You / yr</th>
                    <th style={{ padding: "6px 8px", fontWeight: 600 }}>Employer / yr</th>
                    <th style={{ padding: "6px 8px", fontWeight: 600 }}>Total saved / yr</th>
                    <th style={{ padding: "6px 8px", fontWeight: 600 }}>Take-home / mo</th>
                  </tr>
                </thead>
                <tbody>
                  {scenarios.map((s) => {
                    const isCurrent = Math.abs(s.pct - pct) < 0.6;
                    const isFullMatch = matchLimitPct > 0 && Math.abs(s.pct - matchLimitPct) < 0.6;
                    return (
                      <tr
                        key={s.pct}
                        style={{
                          borderTop: "1px solid var(--card-border)",
                          background: isCurrent ? "rgba(37,99,235,0.08)" : "transparent",
                          textAlign: "right",
                        }}
                      >
                        <td style={{ textAlign: "left", padding: "8px", color: "var(--text-primary)", fontWeight: isCurrent ? 700 : 500 }}>
                          {fmtPct(s.pct)}
                          {isCurrent && <span style={{ color: "var(--accent)", fontSize: "10px", marginLeft: "6px" }}>YOU</span>}
                          {isFullMatch && !isCurrent && <span style={{ color: "#34d399", fontSize: "10px", marginLeft: "6px" }}>FULL MATCH</span>}
                        </td>
                        <td style={{ ...mono, padding: "8px", color: "var(--text-secondary)" }}>{fmt(s.employeeAnnual)}</td>
                        <td style={{ ...mono, padding: "8px", color: s.employerAnnual > 0 ? "#34d399" : "var(--text-tertiary)" }}>
                          {s.employerAnnual > 0 ? `+${fmt(s.employerAnnual)}` : "—"}
                        </td>
                        <td style={{ ...mono, padding: "8px", color: "var(--text-primary)", fontWeight: 600 }}>{fmt(s.totalSavedAnnual)}</td>
                        <td style={{ ...mono, padding: "8px", color: "var(--text-primary)" }}>{fmt(s.takeHomeMonthly)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p style={{ fontSize: "11px", color: "var(--text-tertiary)", marginTop: "10px", lineHeight: 1.5 }}>
              Planning estimate, not tax advice. {year} IRS employee limit: {fmt(limits.k401)}
              {profile.current_age != null && profile.current_age >= 50 ? ` (+catch-up, you qualify)` : ""}.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
