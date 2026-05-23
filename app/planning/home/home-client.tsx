"use client";

import { useState, useMemo, useTransition, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import type { HomeScenario } from "./home-actions";
import { saveHomeScenario, deleteHomeScenario } from "./home-actions";
import type { FinancialProfile } from "@/app/planning/planning-actions";
import { addFutureEvent } from "@/app/planning/planning-actions";
import type { HomeFinnRequest } from "@/app/api/planning/home-finn/route";
import type { HomeMarketData } from "@/app/api/planning/home-market/route";

// ── Math engines ──────────────────────────────────────────────────────────────

function calcMortgagePayment(loan: number, annualRate: number, termYears: number): number {
  if (loan <= 0) return 0;
  if (annualRate <= 0) return loan / (termYears * 12);
  const r = annualRate / 12;
  const n = termYears * 12;
  return (loan * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
}

type YearPoint = {
  year: number;
  homeEquity: number;
  homeValue: number;
  rentPortfolio: number;
  monthlyOwn: number;
  monthlyRent: number;
};

function buildTimeline(
  purchasePrice: number,
  downPayment: number,
  annualRate: number,
  termYears: number,
  taxMonthly: number,
  insMonthly: number,
  hoaMonthly: number,
  maintPct: number,
  startRent: number,
  rentGrowth: number,
  appreciation: number,
  investReturn: number,
  closingPct: number,
  holdYears: number,
): YearPoint[] {
  const loan = purchasePrice - downPayment;
  const closingCosts = purchasePrice * closingPct;
  const monthlyPmt = calcMortgagePayment(loan, annualRate, termYears);
  const r = annualRate / 12;
  const ir = investReturn / 12;

  let homeValue = purchasePrice;
  let balance = loan;
  // Renter invests the down payment + closing costs instead of putting them into a house
  let rentPortfolio = downPayment + closingCosts;

  const points: YearPoint[] = [];

  for (let y = 0; y <= holdYears; y++) {
    if (y > 0) {
      for (let m = 0; m < 12; m++) {
        // Appreciation
        homeValue *= 1 + appreciation / 12;
        // Amortize
        if (balance > 0) {
          const interest = balance * r;
          const principal = Math.min(monthlyPmt - interest, balance);
          balance = Math.max(0, balance - principal);
        }
        // Monthly cost comparison
        const ownCost = monthlyPmt + taxMonthly + insMonthly + hoaMonthly + (homeValue * maintPct) / 12;
        const rentNow = startRent * Math.pow(1 + rentGrowth, (y - 1) + m / 12);
        // Renter invests the cost difference if ownership is pricier
        const savingsByRenting = ownCost - rentNow;
        if (savingsByRenting > 0) rentPortfolio += savingsByRenting;
        // Portfolio grows
        rentPortfolio *= 1 + ir;
      }
    }

    const equity = homeValue - balance;
    const maintMonthly = (homeValue * maintPct) / 12;
    const currentRent = startRent * Math.pow(1 + rentGrowth, y);
    const currentOwn = monthlyPmt + taxMonthly + insMonthly + hoaMonthly + maintMonthly;

    points.push({
      year: y,
      homeEquity: Math.round(equity),
      homeValue: Math.round(homeValue),
      rentPortfolio: Math.round(rentPortfolio),
      monthlyOwn: Math.round(currentOwn),
      monthlyRent: Math.round(currentRent),
    });
  }
  return points;
}

function calcRetirementProb(netWorth: number, annualExpenses: number): number | null {
  if (annualExpenses <= 0 || netWorth <= 0) return null;
  const ratio = netWorth / (annualExpenses * 25);
  if (ratio >= 1.5) return 95;
  if (ratio >= 1.2) return 88;
  if (ratio >= 1.0) return 82;
  if (ratio >= 0.8) return 70;
  if (ratio >= 0.6) return 55;
  if (ratio >= 0.4) return 38;
  return 20;
}

// ── Amortization table ────────────────────────────────────────────────────────

type AmorRow = {
  year: number;
  balance: number;
  annualPrincipal: number;
  annualInterest: number;
  cumulativeInterest: number;
  homeValue: number;
  equity: number;
};

function buildAmortization(
  loan: number,
  annualRate: number,
  termYears: number,
  purchasePrice: number,
  appreciation: number,
  showYears: number,
): AmorRow[] {
  if (loan <= 0 || annualRate <= 0) return [];
  const r = annualRate / 12;
  const n = termYears * 12;
  const monthlyPmt = (loan * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);

  let balance = loan;
  let homeValue = purchasePrice;
  let cumulativeInterest = 0;
  const rows: AmorRow[] = [
    { year: 0, balance, annualPrincipal: 0, annualInterest: 0, cumulativeInterest, homeValue, equity: homeValue - balance },
  ];

  const maxYear = Math.min(termYears, showYears);
  for (let year = 1; year <= maxYear; year++) {
    let annualPrincipal = 0;
    let annualInterest = 0;
    for (let m = 0; m < 12; m++) {
      if (balance <= 0) break;
      homeValue *= 1 + appreciation / 12;
      const interest = balance * r;
      const principal = Math.min(monthlyPmt - interest, balance);
      balance = Math.max(0, balance - principal);
      annualPrincipal += principal;
      annualInterest += interest;
      cumulativeInterest += interest;
    }
    rows.push({ year, balance, annualPrincipal, annualInterest, cumulativeInterest, homeValue, equity: homeValue - balance });
  }
  return rows;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmt = (n: number) => "$" + Math.round(n).toLocaleString("en-US");
const fmtK = (n: number) => {
  if (Math.abs(n) >= 1_000_000) return "$" + (n / 1_000_000).toFixed(1) + "M";
  if (Math.abs(n) >= 1_000) return "$" + (n / 1000).toFixed(0) + "K";
  return "$" + Math.round(n);
};
const pct = (n: number) => n.toFixed(2) + "%";

// ── Styles ────────────────────────────────────────────────────────────────────

const inputS: React.CSSProperties = {
  width: "100%", padding: "7px 10px", borderRadius: "10px",
  border: "1px solid var(--card-border)", background: "var(--bg-elevated)",
  color: "var(--text-primary)", fontSize: "13px", fontFamily: "var(--font-mono)",
  outline: "none", boxSizing: "border-box",
};
const labelS: React.CSSProperties = {
  display: "block", fontSize: "10px", fontWeight: 600, letterSpacing: "0.08em",
  textTransform: "uppercase", color: "var(--text-tertiary)", marginBottom: "4px",
  fontFamily: "var(--font-body)",
};
const cardS: React.CSSProperties = {
  background: "var(--card-bg)", border: "1px solid var(--card-border)",
  borderRadius: "var(--radius-lg)", padding: "16px",
};
const sectionHead: React.CSSProperties = {
  fontSize: "10px", fontWeight: 700, textTransform: "uppercase",
  letterSpacing: "0.08em", color: "var(--text-muted)", marginBottom: "12px",
  fontFamily: "var(--font-body)",
};

// ── Default scenario ──────────────────────────────────────────────────────────

const BASE_DEFAULTS = {
  name: "New Home Scenario",
  purchase_price: 500000,
  down_payment: 100000,
  mortgage_rate: 6.75,
  loan_term_years: 30,
  property_tax_monthly: 500,
  insurance_monthly: 150,
  hoa_monthly: 0,
  maintenance_pct: 1.0,
  monthly_rent: 2500,
  rent_growth_rate: 3.0,
  expected_appreciation: 3.5,
  investment_return: 7.0,
  hold_years: 7,
  closing_cost_pct: 3.0,
};

type Inputs = typeof BASE_DEFAULTS;

// Derive smart defaults from the user's financial profile.
// Uses the 28% front-end DTI rule to estimate a comfortable purchase price,
// then backs into a down payment (20%) and property tax/insurance from price.
function buildDefaults(
  profile: FinancialProfile | null,
  defaultInvestmentReturn: number,
): Inputs {
  const base: Inputs = {
    ...BASE_DEFAULTS,
    investment_return: +(defaultInvestmentReturn * 100).toFixed(2),
  };

  if (!profile?.monthly_income || profile.monthly_income <= 0) return base;

  const income = profile.monthly_income;

  // 28% rule: max PITI (principal + interest + tax + insurance)
  const maxPITI = income * 0.28;

  // At a standard 6.75% rate, 30yr, 20% down:
  // monthly P&I factor on the full loan amount = mortgage_factor
  const rMonthly = 0.0675 / 12;
  const n = 360;
  const mortgageFactor = (rMonthly * Math.pow(1 + rMonthly, n)) / (Math.pow(1 + rMonthly, n) - 1);
  // P&I per dollar of purchase price (80% LTV) = 0.8 * mortgageFactor
  const piPerDollar = 0.8 * mortgageFactor;

  // Annual overhead per dollar of price: tax 1.2% + insurance 0.4% = 1.6%/yr → /12
  const overheadPerDollar = 0.016 / 12;

  // price = maxPITI / (piPerDollar + overheadPerDollar), rounded to nearest $5k
  const rawPrice = maxPITI / (piPerDollar + overheadPerDollar);
  const suggestedPrice = Math.round(rawPrice / 5000) * 5000;

  if (suggestedPrice < 50_000) return base;

  const suggestedDown = Math.round(suggestedPrice * 0.2 / 1000) * 1000;
  const suggestedTax = Math.round((suggestedPrice * 0.012) / 12 / 10) * 10;
  const suggestedIns = Math.round((suggestedPrice * 0.004) / 12 / 10) * 10;

  // Use monthly_expenses as a proxy for current rent if available
  const suggestedRent = profile.monthly_expenses && profile.monthly_expenses > 0
    ? Math.round(profile.monthly_expenses / 100) * 100
    : base.monthly_rent;

  return {
    ...base,
    purchase_price: suggestedPrice,
    down_payment: suggestedDown,
    property_tax_monthly: suggestedTax,
    insurance_monthly: Math.max(75, suggestedIns),
    monthly_rent: suggestedRent,
  };
}

// ── Local Market Panel ────────────────────────────────────────────────────────

const SIGNAL_CONFIG: Record<NonNullable<HomeMarketData["buyRentSignal"]>, { label: string; color: string; bg: string }> = {
  strongly_buy:  { label: "Strong Buy Signal",  color: "oklch(0.80 0.15 155)", bg: "color-mix(in oklch, oklch(0.55 0.15 155) 12%, transparent)" },
  lean_buy:      { label: "Lean Buy",           color: "oklch(0.78 0.12 160)", bg: "color-mix(in oklch, oklch(0.55 0.15 155) 8%, transparent)" },
  neutral:       { label: "Neutral",            color: "oklch(0.80 0.10 80)",  bg: "color-mix(in oklch, oklch(0.70 0.12 80) 10%, transparent)" },
  lean_rent:     { label: "Lean Rent",          color: "oklch(0.75 0.12 45)",  bg: "color-mix(in oklch, oklch(0.60 0.15 45) 10%, transparent)" },
  strongly_rent: { label: "Strong Rent Signal", color: "oklch(0.70 0.15 25)",  bg: "color-mix(in oklch, oklch(0.45 0.18 25) 12%, transparent)" },
};

function LocalMarketPanel({
  profile,
  onApplyData,
}: {
  profile: FinancialProfile | null;
  onApplyData: (data: { purchasePrice: number; monthlyRent: number; mortgageRate: number }) => void;
}) {
  const [zip, setZip] = useState("");
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<HomeMarketData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [applied, setApplied] = useState(false);

  async function lookup() {
    const trimmed = zip.trim();
    if (!/^\d{5}$/.test(trimmed)) { setError("Enter a valid 5-digit ZIP code."); return; }
    setLoading(true);
    setError(null);
    setData(null);
    setApplied(false);
    try {
      const res = await fetch(`/api/planning/home-market?zip=${trimmed}`);
      const json = await res.json() as HomeMarketData & { error?: string };
      if (json.error) { setError(json.error); return; }
      if (!json.censusAvailable) { setError("No Census data found for this ZIP. Try a nearby ZIP."); return; }
      setData(json);
    } catch {
      setError("Unable to fetch market data. Try again.");
    } finally {
      setLoading(false);
    }
  }

  const signal = data?.buyRentSignal ? SIGNAL_CONFIG[data.buyRentSignal] : null;

  // Affordability check against the user's income
  const userAffordability = (() => {
    if (!data?.monthlyPIAtMedian || !profile?.monthly_income) return null;
    const maxPITI = profile.monthly_income * 0.28;
    const pct = Math.round((data.monthlyPIAtMedian / maxPITI) * 100);
    return { pct, isOver: pct > 100, maxPITI };
  })();

  // Max home price the user can afford at 28% DTI
  const maxAffordable = (() => {
    if (!profile?.monthly_income) return null;
    const maxPI = profile.monthly_income * 0.28 - 400; // rough tax+insurance
    const rate = (data?.mortgageRate ?? 6.75) / 100 / 12;
    const n = 360;
    if (rate <= 0) return null;
    const loanMax = maxPI * ((Math.pow(1 + rate, n) - 1) / (rate * Math.pow(1 + rate, n)));
    return Math.round(loanMax / 0.8 / 5000) * 5000; // divide by 0.8 for 20% down
  })();

  const fmt = (n: number) => "$" + Math.round(n).toLocaleString("en-US");
  const fmtK = (n: number) => {
    if (n >= 1_000_000) return "$" + (n / 1_000_000).toFixed(2) + "M";
    if (n >= 1_000) return "$" + (n / 1000).toFixed(0) + "K";
    return "$" + Math.round(n);
  };

  return (
    <div style={{ ...cardS, display: "flex", flexDirection: "column", gap: "14px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "8px" }}>
        <p style={{ ...sectionHead, margin: 0 }}>Local Market Intelligence</p>
        {data && (
          <span style={{ fontSize: "10px", color: "var(--text-muted)", fontFamily: "var(--font-body)" }}>
            Census ACS 2022 · {data.fredAvailable ? "FRED live rate" : "FRED unavailable"}
          </span>
        )}
      </div>

      {/* ZIP input */}
      <div style={{ display: "flex", gap: "8px", alignItems: "stretch" }}>
        <input
          type="text"
          inputMode="numeric"
          maxLength={5}
          placeholder="ZIP code (e.g. 90210)"
          value={zip}
          onChange={(e) => { setZip(e.target.value.replace(/\D/g, "").slice(0, 5)); setError(null); }}
          onKeyDown={(e) => { if (e.key === "Enter") void lookup(); }}
          style={{ ...inputS, flex: 1 }}
        />
        <button
          type="button"
          onClick={() => void lookup()}
          disabled={loading}
          style={{ padding: "7px 16px", borderRadius: "10px", border: "none", background: "linear-gradient(135deg,#2563eb,#4f46e5)", color: "#fff", fontSize: "12px", fontWeight: 600, cursor: loading ? "default" : "pointer", opacity: loading ? 0.7 : 1, flexShrink: 0, fontFamily: "var(--font-body)" }}
        >
          {loading ? "…" : "Look up"}
        </button>
      </div>

      {error && (
        <p style={{ fontSize: "11px", color: "var(--red)", fontFamily: "var(--font-body)", margin: 0 }}>{error}</p>
      )}

      {data && signal && (
        <>
          {/* Buy vs Rent signal banner */}
          <div style={{ padding: "10px 14px", borderRadius: "var(--radius-md)", background: signal.bg, border: `1px solid ${signal.color.replace("0.80", "0.50")}20`, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "8px" }}>
            <div>
              <div style={{ fontSize: "11px", fontWeight: 700, color: signal.color, fontFamily: "var(--font-body)", textTransform: "uppercase", letterSpacing: "0.06em" }}>{signal.label}</div>
              {data.priceToRentRatio && (
                <div style={{ fontSize: "10px", color: "var(--text-tertiary)", marginTop: "2px" }}>
                  Price-to-rent ratio: <span style={{ fontFamily: "var(--font-mono)", color: "var(--text-secondary)" }}>{data.priceToRentRatio}x</span>
                  {" "}— {data.priceToRentRatio < 15 ? "cheap to own relative to rent" : data.priceToRentRatio < 20 ? "buying is competitive" : data.priceToRentRatio < 25 ? "borderline, depends on your plan" : data.priceToRentRatio < 30 ? "renting often wins financially" : "renting is strongly favored"}
                </div>
              )}
            </div>
            {data.mortgageRate && (
              <div style={{ textAlign: "right" }}>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: "16px", fontWeight: 700, color: "var(--text-primary)" }}>{data.mortgageRate.toFixed(2)}%</div>
                <div style={{ fontSize: "9px", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>30yr rate</div>
              </div>
            )}
          </div>

          {/* Key stats grid */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "8px" }}>
            {[
              { label: "Median Home", value: data.medianHomeValue ? fmtK(data.medianHomeValue) : "—", sub: "Census ACS" },
              { label: "Median Rent", value: data.medianRent ? fmt(data.medianRent) + "/mo" : "—", sub: "Census ACS" },
              { label: "Median Income", value: data.medianHouseholdIncome ? fmtK(data.medianHouseholdIncome) + "/yr" : "—", sub: "household" },
            ].map(({ label, value, sub }) => (
              <div key={label} style={{ background: "var(--bg-elevated)", borderRadius: "var(--radius-md)", padding: "9px 11px" }}>
                <div style={{ fontSize: "9px", textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--text-muted)", marginBottom: "3px", fontFamily: "var(--font-body)" }}>{label}</div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: "14px", fontWeight: 700, color: "var(--text-primary)" }}>{value}</div>
                <div style={{ fontSize: "9px", color: "var(--text-tertiary)", marginTop: "1px", fontFamily: "var(--font-body)" }}>{sub}</div>
              </div>
            ))}
          </div>

          {/* Affordability breakdown */}
          {data.monthlyPIAtMedian && (
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", padding: "5px 0", borderBottom: "1px solid var(--border-subtle)" }}>
                <span style={{ color: "var(--text-secondary)" }}>Est. monthly P&I at median (20% down)</span>
                <span style={{ fontFamily: "var(--font-mono)", color: "var(--text-primary)" }}>{fmt(data.monthlyPIAtMedian)}/mo</span>
              </div>
              {data.debtToIncomeAtMedian && (
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", padding: "5px 0", borderBottom: "1px solid var(--border-subtle)" }}>
                  <span style={{ color: "var(--text-secondary)" }}>DTI at median income</span>
                  <span style={{ fontFamily: "var(--font-mono)", color: data.debtToIncomeAtMedian > 36 ? "var(--amber)" : "var(--text-primary)" }}>{data.debtToIncomeAtMedian}%{data.debtToIncomeAtMedian > 36 ? " ▲ high" : ""}</span>
                </div>
              )}
              {data.downPayment20Pct && (
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", padding: "5px 0", borderBottom: "1px solid var(--border-subtle)" }}>
                  <span style={{ color: "var(--text-secondary)" }}>20% down needed</span>
                  <span style={{ fontFamily: "var(--font-mono)", color: "var(--text-primary)" }}>{fmt(data.downPayment20Pct)}</span>
                </div>
              )}
              {data.yearsToSave20Pct && (
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", padding: "5px 0", borderBottom: "1px solid var(--border-subtle)" }}>
                  <span style={{ color: "var(--text-secondary)" }}>Years to save down (20% savings rate)</span>
                  <span style={{ fontFamily: "var(--font-mono)", color: "var(--text-primary)" }}>{data.yearsToSave20Pct} yrs</span>
                </div>
              )}

              {/* User-specific affordability vs local market */}
              {userAffordability && (
                <div style={{
                  marginTop: "4px", padding: "9px 12px", borderRadius: "var(--radius-md)",
                  background: userAffordability.isOver
                    ? "color-mix(in oklch, oklch(0.45 0.18 25) 10%, transparent)"
                    : "color-mix(in oklch, oklch(0.55 0.15 155) 8%, transparent)",
                  border: `1px solid ${userAffordability.isOver ? "color-mix(in oklch, oklch(0.45 0.18 25) 25%, transparent)" : "color-mix(in oklch, oklch(0.55 0.15 155) 20%, transparent)"}`,
                }}>
                  <div style={{ fontSize: "11px", fontWeight: 600, color: userAffordability.isOver ? "oklch(0.75 0.12 25)" : "oklch(0.80 0.12 155)", fontFamily: "var(--font-body)" }}>
                    {userAffordability.isOver
                      ? `Median home is ${userAffordability.pct}% of your 28% limit — likely a stretch`
                      : `Median home is ${userAffordability.pct}% of your 28% limit — within range`}
                  </div>
                  {maxAffordable && (
                    <div style={{ fontSize: "10px", color: "var(--text-tertiary)", marginTop: "3px", fontFamily: "var(--font-body)" }}>
                      Your max affordable price: <span style={{ fontFamily: "var(--font-mono)", color: "var(--text-secondary)" }}>{fmtK(maxAffordable)}</span>
                      {data.medianHomeValue && maxAffordable < data.medianHomeValue
                        ? ` — ${Math.round(((data.medianHomeValue - maxAffordable) / data.medianHomeValue) * 100)}% below local median`
                        : data.medianHomeValue
                          ? ` — above local median`
                          : ""}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Actions */}
          <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
            {!applied && data.medianHomeValue && (
              <button
                type="button"
                onClick={() => {
                  if (!data.medianHomeValue || !data.medianRent) return;
                  onApplyData({
                    purchasePrice: data.medianHomeValue,
                    monthlyRent: data.medianRent,
                    mortgageRate: data.mortgageRate ?? 6.75,
                  });
                  setApplied(true);
                }}
                style={{ display: "flex", alignItems: "center", gap: "5px", padding: "6px 12px", borderRadius: "8px", border: "1px solid var(--border)", background: "var(--bg-elevated)", color: "var(--text-primary)", fontSize: "11px", fontWeight: 600, cursor: "pointer", fontFamily: "var(--font-body)" }}
              >
                <svg width="11" height="11" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4 4l12 6-12 6V4z" strokeLinecap="round" strokeLinejoin="round"/></svg>
                Use local data
              </button>
            )}
            {applied && (
              <span style={{ fontSize: "11px", color: "var(--green)", fontFamily: "var(--font-body)", display: "flex", alignItems: "center", gap: "4px" }}>
                <svg width="11" height="11" viewBox="0 0 20 20" fill="none" stroke="var(--green)" strokeWidth="2"><path d="M4 10l5 5L16 6" strokeLinecap="round" strokeLinejoin="round"/></svg>
                Applied to scenario
              </span>
            )}
            {data.medianHomeValue && (
              <a
                href={`https://www.zillow.com/homes/${zip}_rb/`}
                target="_blank"
                rel="noopener noreferrer"
                style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "11px", color: "var(--text-muted)", fontFamily: "var(--font-body)", textDecoration: "none" }}
              >
                Browse listings on Zillow
                <svg width="10" height="10" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M7 3h10v10M17 3L3 17" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </a>
            )}
          </div>
        </>
      )}

      {!data && !loading && !error && (
        <p style={{ fontSize: "11px", color: "var(--text-tertiary)", fontFamily: "var(--font-body)", margin: 0, lineHeight: 1.6 }}>
          Enter your target ZIP to pull Census median home values, rents, and income — plus the live 30-year mortgage rate. Data is used to benchmark your scenario and check local affordability.
        </p>
      )}
    </div>
  );
}

function scenarioToInputs(s: HomeScenario): Inputs {
  return {
    name: s.name,
    purchase_price: s.purchase_price,
    down_payment: s.down_payment,
    mortgage_rate: +(s.mortgage_rate * 100).toFixed(3),
    loan_term_years: s.loan_term_years,
    property_tax_monthly: s.property_tax_monthly,
    insurance_monthly: s.insurance_monthly,
    hoa_monthly: s.hoa_monthly,
    maintenance_pct: +(s.maintenance_pct * 100).toFixed(2),
    monthly_rent: s.monthly_rent,
    rent_growth_rate: +(s.rent_growth_rate * 100).toFixed(2),
    expected_appreciation: +(s.expected_appreciation * 100).toFixed(2),
    investment_return: +(s.investment_return * 100).toFixed(2),
    hold_years: s.hold_years,
    closing_cost_pct: +(s.closing_cost_pct * 100).toFixed(2),
  };
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function HomeClient({
  scenarios,
  profile,
  defaultInvestmentReturn,
}: {
  scenarios: HomeScenario[];
  profile: FinancialProfile | null;
  defaultInvestmentReturn: number;
}) {
  const router = useRouter();
  const smartDefaults = buildDefaults(profile, defaultInvestmentReturn);
  const [activeScenarioId, setActiveScenarioId] = useState<string | null>(
    scenarios.length > 0 ? scenarios[0].id : null,
  );
  const [inputs, setInputs] = useState<Inputs>(() => {
    const first = scenarios[0];
    if (first) return scenarioToInputs(first);
    return smartDefaults;
  });
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [isPending, startTransition] = useTransition();
  const [finnCommentary, setFinnCommentary] = useState<string | null>(null);
  const [finnLoading, setFinnLoading] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [showAmortization, setShowAmortization] = useState(false);
  const [applyStatus, setApplyStatus] = useState<"idle" | "applying" | "done" | "error">("idle");

  function set<K extends keyof Inputs>(key: K, val: Inputs[K]) {
    setInputs((p) => ({ ...p, [key]: val }));
    setFinnCommentary(null);
  }
  function num(key: keyof Inputs) {
    return (e: React.ChangeEvent<HTMLInputElement>) => set(key, Number(e.target.value) as Inputs[typeof key]);
  }

  // ── Derived calculations ───────────────────────────────────────────────────

  const computed = useMemo(() => {
    const {
      purchase_price: pp, down_payment: dp, mortgage_rate: rate, loan_term_years: term,
      property_tax_monthly: tax, insurance_monthly: ins, hoa_monthly: hoa,
      maintenance_pct: maint, monthly_rent: rent, rent_growth_rate: rentG,
      expected_appreciation: appr, investment_return: ir, hold_years: hold, closing_cost_pct: cc,
    } = inputs;

    const loan = pp - dp;
    const monthlyPmt = calcMortgagePayment(loan, rate / 100, term);
    const maintMonthly = (pp * (maint / 100)) / 12;
    const totalMonthly = monthlyPmt + tax + ins + hoa + maintMonthly;

    // Year 1 principal (first month)
    const firstInterest = loan * (rate / 100 / 12);
    const firstPrincipal = monthlyPmt - firstInterest;

    // True effective cost: total monthly - principal paydown + opportunity cost on equity
    const opportunityCostOnEquity = (dp * (ir / 100)) / 12;
    const trueEffectiveCost = totalMonthly - firstPrincipal + opportunityCostOnEquity;

    const timeline = buildTimeline(
      pp, dp, rate / 100, term,
      tax, ins, hoa, maint / 100,
      rent, rentG / 100, appr / 100, ir / 100, cc / 100, hold,
    );

    const lastPoint = timeline[timeline.length - 1];
    const breakEvenYear = timeline.find((p) => p.year > 0 && p.homeEquity > p.rentPortfolio)?.year ?? null;

    // Closing costs
    const closingCosts = pp * (cc / 100);

    // Retirement impact
    let retirBaselineProb: number | null = null;
    let retirWithHomeProb: number | null = null;
    if (profile?.current_age && profile?.target_retirement_age && profile?.monthly_income && profile?.monthly_expenses) {
      const yearsToRetire = profile.target_retirement_age - profile.current_age;
      if (yearsToRetire > 0) {
        const annualSavingsBase = (profile.monthly_income - profile.monthly_expenses) * 12;
        const baseGrowth = annualSavingsBase > 0
          ? annualSavingsBase * ((Math.pow(1 + ir / 100, yearsToRetire) - 1) / (ir / 100))
          : 0;
        retirBaselineProb = calcRetirementProb(baseGrowth, profile.monthly_expenses * 12);

        // With home: subtract down payment + closing costs, add monthly cost difference as extra expense
        const extraMonthly = totalMonthly - rent;
        const reducedSavings = annualSavingsBase - Math.max(0, extraMonthly) * 12;
        const withHomeGrowth = reducedSavings > 0
          ? reducedSavings * ((Math.pow(1 + ir / 100, yearsToRetire) - 1) / (ir / 100)) - dp - closingCosts
          : -(dp + closingCosts);
        retirWithHomeProb = calcRetirementProb(Math.max(0, withHomeGrowth + (lastPoint?.homeEquity ?? 0)), profile.monthly_expenses * 12);
      }
    }

    const amortization = buildAmortization(
      loan, rate / 100, term, pp, appr / 100, hold,
    );

    return {
      loan, monthlyPmt, maintMonthly, totalMonthly,
      firstPrincipal, firstInterest, trueEffectiveCost, opportunityCostOnEquity,
      timeline, lastPoint, breakEvenYear, closingCosts,
      retirBaselineProb, retirWithHomeProb, amortization,
    };
  }, [inputs, profile]);

  // ── Save / Delete ──────────────────────────────────────────────────────────

  async function handleSave() {
    setSaveStatus("saving");
    const payload = {
      name: inputs.name,
      purchase_price: inputs.purchase_price,
      down_payment: inputs.down_payment,
      mortgage_rate: inputs.mortgage_rate / 100,
      loan_term_years: inputs.loan_term_years,
      property_tax_monthly: inputs.property_tax_monthly,
      insurance_monthly: inputs.insurance_monthly,
      hoa_monthly: inputs.hoa_monthly,
      maintenance_pct: inputs.maintenance_pct / 100,
      monthly_rent: inputs.monthly_rent,
      rent_growth_rate: inputs.rent_growth_rate / 100,
      expected_appreciation: inputs.expected_appreciation / 100,
      investment_return: inputs.investment_return / 100,
      hold_years: inputs.hold_years,
      closing_cost_pct: inputs.closing_cost_pct / 100,
    };
    const result = await saveHomeScenario(payload, activeScenarioId ?? undefined);
    if (result.error) { setSaveStatus("error"); return; }
    setActiveScenarioId(result.id ?? null);
    setSaveStatus("saved");
    setTimeout(() => setSaveStatus("idle"), 2000);
    router.refresh();
  }

  function handleLoadScenario(s: HomeScenario) {
    setActiveScenarioId(s.id);
    setInputs(scenarioToInputs(s));
    setFinnCommentary(null);
    setSaveStatus("idle");
  }

  function handleNewScenario() {
    setActiveScenarioId(null);
    setInputs(smartDefaults);
    setFinnCommentary(null);
    setSaveStatus("idle");
  }

  async function handleDelete(id: string) {
    startTransition(async () => {
      await deleteHomeScenario(id);
      if (activeScenarioId === id) handleNewScenario();
      setDeleteConfirm(null);
      router.refresh();
    });
  }

  async function fetchFinnCommentary() {
    setFinnLoading(true);
    setFinnCommentary(null);
    const body: HomeFinnRequest = {
      scenario_name: inputs.name,
      purchase_price: inputs.purchase_price,
      down_payment: inputs.down_payment,
      mortgage_rate: inputs.mortgage_rate / 100,
      loan_term_years: inputs.loan_term_years,
      monthly_ownership_cost: computed.totalMonthly,
      monthly_rent: inputs.monthly_rent,
      hold_years: inputs.hold_years,
      monthly_payment: computed.monthlyPmt,
      true_effective_cost: computed.trueEffectiveCost,
      break_even_year: computed.breakEvenYear,
      equity_at_hold: computed.lastPoint?.homeEquity ?? 0,
      home_value_at_hold: computed.lastPoint?.homeValue ?? 0,
      current_age: profile?.current_age ?? null,
      years_to_retire: profile && profile.current_age && profile.target_retirement_age
        ? profile.target_retirement_age - profile.current_age : null,
      net_worth: null,
      retirement_prob_baseline: computed.retirBaselineProb,
      retirement_prob_with_home: computed.retirWithHomeProb,
    };
    try {
      const res = await fetch("/api/planning/home-finn", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json() as { commentary?: string; error?: string };
      setFinnCommentary(data.commentary ?? data.error ?? "Analysis unavailable.");
    } catch {
      setFinnCommentary("Unable to reach FINN — please try again.");
    } finally {
      setFinnLoading(false);
    }
  }

  // ── Chart data ─────────────────────────────────────────────────────────────

  const chartData = computed.timeline.map((p) => ({
    name: p.year === 0 ? "Now" : `Yr ${p.year}`,
    "Home Equity": p.homeEquity,
    "Invested (Rent)": p.rentPortfolio,
  }));

  const downPct = inputs.purchase_price > 0
    ? ((inputs.down_payment / inputs.purchase_price) * 100).toFixed(0) : "0";

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div style={{ flex: 1, overflowY: "auto", color: "var(--text-primary)", fontFamily: "var(--font-body)" }}>
      {/* Header */}
      <div style={{ padding: "12px 24px", borderBottom: "1px solid var(--border-subtle)", display: "flex", alignItems: "center", justifyContent: "space-between", background: "var(--bg-base)", position: "sticky", top: 0, zIndex: 10, gap: "12px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <Link href="/planning" style={{ display: "flex", alignItems: "center", gap: "5px", fontSize: "12px", color: "var(--text-muted)", textDecoration: "none" }}>
            <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M17 10a.75.75 0 01-.75.75H5.612l4.158 3.96a.75.75 0 11-1.04 1.08l-5.5-5.25a.75.75 0 010-1.08l5.5-5.25a.75.75 0 111.04 1.08L5.612 9.25H16.25A.75.75 0 0117 10z" clipRule="evenodd" /></svg>
            Planning
          </Link>
          <span style={{ color: "var(--border)", fontSize: "14px" }}>/</span>
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: "15px", fontWeight: 600, letterSpacing: "-0.2px", margin: 0 }}>Home Planning</h1>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          {scenarios.length > 0 && (
            <button type="button" onClick={handleNewScenario} style={{ fontSize: "11px", color: "var(--text-secondary)", background: "var(--card-bg)", border: "1px solid var(--card-border)", borderRadius: "8px", padding: "5px 11px", cursor: "pointer" }}>
              + New
            </button>
          )}
          <button
            type="button"
            onClick={handleSave}
            disabled={saveStatus === "saving"}
            style={{ fontSize: "11px", fontWeight: 600, color: "#fff", background: "linear-gradient(135deg,#2563eb,#4f46e5)", border: "none", borderRadius: "8px", padding: "6px 14px", cursor: "pointer", opacity: saveStatus === "saving" ? 0.7 : 1 }}
          >
            {saveStatus === "saving" ? "Saving…" : saveStatus === "saved" ? "Saved ✓" : "Save Scenario"}
          </button>
        </div>
      </div>

      <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: "20px" }}>

        {/* Saved scenarios list */}
        {scenarios.length > 0 && (
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            {scenarios.map((s) => (
              <div key={s.id} style={{ display: "flex", alignItems: "center", gap: "0" }}>
                <button
                  type="button"
                  onClick={() => handleLoadScenario(s)}
                  style={{
                    fontSize: "11px", padding: "5px 10px", borderRadius: "8px 0 0 8px",
                    border: "1px solid", borderRight: "none",
                    borderColor: s.id === activeScenarioId ? "rgba(37,99,235,0.5)" : "var(--card-border)",
                    background: s.id === activeScenarioId ? "rgba(37,99,235,0.08)" : "var(--card-bg)",
                    color: s.id === activeScenarioId ? "var(--brand-blue)" : "var(--text-secondary)",
                    cursor: "pointer", fontFamily: "var(--font-body)", fontWeight: s.id === activeScenarioId ? 600 : 400,
                  }}
                >
                  {s.name}
                </button>
                {deleteConfirm === s.id ? (
                  <>
                    <button type="button" onClick={() => handleDelete(s.id)} disabled={isPending} style={{ fontSize: "10px", padding: "5px 8px", border: "1px solid var(--red-border)", borderRight: "none", background: "var(--red-bg)", color: "var(--red)", cursor: "pointer" }}>
                      Delete?
                    </button>
                    <button type="button" onClick={() => setDeleteConfirm(null)} style={{ fontSize: "10px", padding: "5px 8px", borderRadius: "0 8px 8px 0", border: "1px solid var(--card-border)", background: "var(--card-bg)", color: "var(--text-muted)", cursor: "pointer" }}>
                      ×
                    </button>
                  </>
                ) : (
                  <button type="button" onClick={() => setDeleteConfirm(s.id)} style={{ fontSize: "11px", padding: "5px 7px", borderRadius: "0 8px 8px 0", border: "1px solid var(--card-border)", background: "var(--card-bg)", color: "var(--text-muted)", cursor: "pointer" }}>
                    ×
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Local Market Intelligence */}
        <LocalMarketPanel
          profile={profile}
          onApplyData={({ purchasePrice, monthlyRent, mortgageRate }) => {
            setInputs((p) => ({
              ...p,
              purchase_price: purchasePrice,
              down_payment: Math.round(purchasePrice * 0.2 / 1000) * 1000,
              monthly_rent: monthlyRent,
              mortgage_rate: +mortgageRate.toFixed(3),
              property_tax_monthly: Math.round((purchasePrice * 0.012) / 12 / 10) * 10,
              insurance_monthly: Math.max(75, Math.round((purchasePrice * 0.004) / 12 / 10) * 10),
            }));
            setFinnCommentary(null);
          }}
        />

        {/* Main layout: inputs left, analysis right */}
        <div data-home-grid style={{ display: "grid", gridTemplateColumns: "minmax(280px, 380px) 1fr", gap: "20px", alignItems: "start" }}>

          {/* ── LEFT: Inputs ── */}
          <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>

            {/* Scenario name */}
            <div>
              <label style={labelS}>Scenario Name</label>
              <input value={inputs.name} onChange={(e) => set("name", e.target.value)} style={inputS} />
            </div>

            {/* Affordability hint — shown when income is known */}
            {profile?.monthly_income && profile.monthly_income > 0 && (() => {
              const maxPITI = profile.monthly_income! * 0.28;
              const totalMonthly = computed.totalMonthly;
              const ratio = totalMonthly / maxPITI;
              const isOver = ratio > 1;
              return (
                <div style={{
                  padding: "9px 12px", borderRadius: "var(--radius-md)",
                  background: isOver
                    ? "color-mix(in oklch, oklch(0.45 0.18 25) 12%, transparent)"
                    : "color-mix(in oklch, oklch(0.55 0.15 155) 10%, transparent)",
                  border: `1px solid ${isOver ? "color-mix(in oklch, oklch(0.45 0.18 25) 30%, transparent)" : "color-mix(in oklch, oklch(0.55 0.15 155) 22%, transparent)"}`,
                  display: "flex", alignItems: "flex-start", gap: "8px",
                }}>
                  <div style={{
                    width: "16px", height: "16px", borderRadius: "50%", flexShrink: 0, marginTop: "1px",
                    background: isOver ? "oklch(0.45 0.18 25)" : "oklch(0.55 0.15 155)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    <span style={{ fontSize: "9px", color: "#fff", fontWeight: 700 }}>{isOver ? "!" : "✓"}</span>
                  </div>
                  <div>
                    <div style={{ fontSize: "11px", fontWeight: 600, color: isOver ? "oklch(0.75 0.12 25)" : "oklch(0.80 0.12 155)", fontFamily: "var(--font-body)" }}>
                      {isOver
                        ? `${Math.round(ratio * 100)}% of income — above 28% guideline`
                        : `${Math.round(ratio * 100)}% of income — within 28% guideline`}
                    </div>
                    <div style={{ fontSize: "10px", color: "var(--text-tertiary)", fontFamily: "var(--font-body)", marginTop: "2px" }}>
                      Based on {fmt(profile.monthly_income!)}/mo income · 28% rule suggests max {fmt(Math.round(maxPITI))}/mo PITI
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Property */}
            <div style={cardS}>
              <p style={sectionHead}>Property</p>
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                <div>
                  <label style={labelS}>Purchase Price</label>
                  <input type="number" min="0" value={inputs.purchase_price} onChange={num("purchase_price")} style={inputS} />
                </div>
                <div>
                  <label style={labelS}>Down Payment — {downPct}% ({fmt(inputs.down_payment)})</label>
                  <input type="number" min="0" max={inputs.purchase_price} value={inputs.down_payment} onChange={num("down_payment")} style={inputS} />
                </div>
                <div>
                  <label style={labelS}>Closing Costs (%)</label>
                  <input type="number" min="0" max="10" step="0.1" value={inputs.closing_cost_pct} onChange={num("closing_cost_pct")} style={inputS} />
                </div>
              </div>
            </div>

            {/* Financing */}
            <div style={cardS}>
              <p style={sectionHead}>Financing</p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                <div>
                  <label style={labelS}>Rate (%)</label>
                  <input type="number" min="0" max="20" step="0.05" value={inputs.mortgage_rate} onChange={num("mortgage_rate")} style={inputS} />
                </div>
                <div>
                  <label style={labelS}>Term (years)</label>
                  <select value={inputs.loan_term_years} onChange={(e) => set("loan_term_years", Number(e.target.value))} style={{ ...inputS, fontFamily: "var(--font-body)" }}>
                    {[10, 15, 20, 25, 30].map((t) => <option key={t} value={t}>{t} yr</option>)}
                  </select>
                </div>
              </div>
            </div>

            {/* Monthly costs */}
            <div style={cardS}>
              <p style={sectionHead}>Monthly Costs</p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                {([
                  ["Property Tax / mo", "property_tax_monthly"],
                  ["Insurance / mo", "insurance_monthly"],
                  ["HOA / mo", "hoa_monthly"],
                ] as [string, keyof Inputs][]).map(([lbl, key]) => (
                  <div key={key}>
                    <label style={labelS}>{lbl}</label>
                    <input type="number" min="0" value={inputs[key] as number} onChange={num(key)} style={inputS} />
                  </div>
                ))}
                <div>
                  <label style={labelS}>Maintenance (% / yr)</label>
                  <input type="number" min="0" max="5" step="0.1" value={inputs.maintenance_pct} onChange={num("maintenance_pct")} style={inputS} />
                </div>
              </div>
            </div>

            {/* Comparison */}
            <div style={cardS}>
              <p style={sectionHead}>Rent Alternative</p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                <div>
                  <label style={labelS}>Current Rent / mo</label>
                  <input type="number" min="0" value={inputs.monthly_rent} onChange={num("monthly_rent")} style={inputS} />
                </div>
                <div>
                  <label style={labelS}>Rent Growth (%/yr)</label>
                  <input type="number" min="0" max="10" step="0.1" value={inputs.rent_growth_rate} onChange={num("rent_growth_rate")} style={inputS} />
                </div>
              </div>
            </div>

            {/* Long-term assumptions */}
            <div style={cardS}>
              <p style={sectionHead}>Assumptions</p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                <div>
                  <label style={labelS}>Appreciation (%/yr)</label>
                  <input type="number" min="0" max="20" step="0.1" value={inputs.expected_appreciation} onChange={num("expected_appreciation")} style={inputS} />
                </div>
                <div>
                  <label style={labelS}>Inv. Return (%/yr)</label>
                  <input type="number" min="0" max="20" step="0.1" value={inputs.investment_return} onChange={num("investment_return")} style={inputS} />
                </div>
                <div>
                  <label style={labelS}>Hold Period (years)</label>
                  <input type="number" min="1" max="30" value={inputs.hold_years} onChange={num("hold_years")} style={inputS} />
                </div>
              </div>
            </div>

          </div>

          {/* ── RIGHT: Analysis ── */}
          <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>

            {/* Monthly cost breakdown */}
            <div style={cardS}>
              <p style={sectionHead}>Monthly Cost Breakdown</p>
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                {[
                  ["Principal & Interest", computed.monthlyPmt, false],
                  ["Property Tax", inputs.property_tax_monthly, false],
                  ["Insurance", inputs.insurance_monthly, false],
                  ...(inputs.hoa_monthly > 0 ? [["HOA", inputs.hoa_monthly, false]] : []),
                  ["Maintenance (est.)", computed.maintMonthly, false],
                ].map(([lbl, val]) => (
                  <div key={String(lbl)} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "5px 0", borderBottom: "1px solid var(--border-subtle)" }}>
                    <span style={{ fontSize: "12px", color: "var(--text-secondary)" }}>{String(lbl)}</span>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: "13px", color: "var(--text-primary)" }}>{fmt(Number(val))}</span>
                  </div>
                ))}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0 0" }}>
                  <span style={{ fontSize: "13px", fontWeight: 700, color: "var(--text-primary)" }}>Total Monthly</span>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: "18px", fontWeight: 700, color: "var(--text-primary)" }}>{fmt(computed.totalMonthly)}</span>
                </div>
              </div>
            </div>

            {/* Effective cost vs rent */}
            <div style={cardS}>
              <p style={sectionHead}>True Ownership Cost vs Rent</p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px" }}>
                {[
                  { label: "Gross Monthly", value: fmt(computed.totalMonthly), sub: "all in" },
                  { label: "True Effective", value: fmt(computed.trueEffectiveCost), sub: "after principal credit" },
                  { label: "Monthly Rent", value: fmt(inputs.monthly_rent), sub: "alternative" },
                ].map(({ label, value, sub }) => (
                  <div key={label} style={{ background: "var(--bg-elevated)", borderRadius: "var(--radius-md)", padding: "10px 12px" }}>
                    <div style={{ fontSize: "9px", textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--text-muted)", marginBottom: "4px" }}>{label}</div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: "16px", fontWeight: 700, color: "var(--text-primary)" }}>{value}</div>
                    <div style={{ fontSize: "10px", color: "var(--text-tertiary)", marginTop: "2px" }}>{sub}</div>
                  </div>
                ))}
              </div>
              <p style={{ fontSize: "11px", color: "var(--text-tertiary)", margin: "10px 0 0", lineHeight: 1.5 }}>
                True effective cost = gross monthly − principal paydown + opportunity cost on down payment ({pct(inputs.investment_return)} annual return foregone).
              </p>
            </div>

            {/* Break-even + upfront costs */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
              <div style={cardS}>
                <p style={sectionHead}>Break-Even vs Renting</p>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: "28px", fontWeight: 700, color: computed.breakEvenYear != null ? "var(--green)" : "var(--amber)" }}>
                  {computed.breakEvenYear != null ? `Year ${computed.breakEvenYear}` : "N/A"}
                </div>
                <p style={{ fontSize: "11px", color: "var(--text-tertiary)", margin: "6px 0 0", lineHeight: 1.5 }}>
                  {computed.breakEvenYear != null
                    ? `Buying beats the rented + invested path after ${computed.breakEvenYear} ${computed.breakEvenYear === 1 ? "year" : "years"}.`
                    : `Buying doesn't out-earn the rented + invested path within ${inputs.hold_years} years at these rates.`}
                </p>
              </div>
              <div style={cardS}>
                <p style={sectionHead}>Upfront Cash Needed</p>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: "28px", fontWeight: 700, color: "var(--text-primary)" }}>
                  {fmt(inputs.down_payment + computed.closingCosts)}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "3px", marginTop: "6px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px" }}>
                    <span style={{ color: "var(--text-tertiary)" }}>Down payment</span>
                    <span style={{ fontFamily: "var(--font-mono)", color: "var(--text-secondary)" }}>{fmt(inputs.down_payment)}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px" }}>
                    <span style={{ color: "var(--text-tertiary)" }}>Closing costs ({inputs.closing_cost_pct}%)</span>
                    <span style={{ fontFamily: "var(--font-mono)", color: "var(--text-secondary)" }}>{fmt(computed.closingCosts)}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Equity chart */}
            {computed.timeline.length > 1 && (
              <div style={cardS}>
                <p style={sectionHead}>Equity vs Invested Portfolio over {inputs.hold_years} Years</p>
                <div style={{ height: "200px" }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="equityGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.25} />
                          <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="portfolioGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#00d395" stopOpacity={0.2} />
                          <stop offset="95%" stopColor="#00d395" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                      <XAxis dataKey="name" tick={{ fontSize: 10, fill: "var(--text-muted)" }} axisLine={false} tickLine={false} />
                      <YAxis tickFormatter={(v) => fmtK(v)} tick={{ fontSize: 10, fill: "var(--text-muted)" }} axisLine={false} tickLine={false} width={52} />
                      <Tooltip
                        contentStyle={{ background: "var(--card-bg)", border: "1px solid var(--card-border)", borderRadius: "8px", fontSize: "12px" }}
                        formatter={(v) => typeof v === "number" ? fmt(v) : String(v ?? "")}
                      />
                      <Legend wrapperStyle={{ fontSize: "11px", color: "var(--text-secondary)" }} />
                      <Area type="monotone" dataKey="Home Equity" stroke="#3b82f6" fill="url(#equityGrad)" strokeWidth={2} dot={false} />
                      <Area type="monotone" dataKey="Invested (Rent)" stroke="#00d395" fill="url(#portfolioGrad)" strokeWidth={2} dot={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
                {computed.lastPoint && (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px", marginTop: "12px" }}>
                    {[
                      { label: `Equity at yr ${inputs.hold_years}`, value: fmtK(computed.lastPoint.homeEquity), color: "#3b82f6" },
                      { label: "Home value", value: fmtK(computed.lastPoint.homeValue), color: "var(--text-secondary)" },
                      { label: "Renter portfolio", value: fmtK(computed.lastPoint.rentPortfolio), color: "#00d395" },
                    ].map(({ label, value, color }) => (
                      <div key={label} style={{ textAlign: "center" }}>
                        <div style={{ fontFamily: "var(--font-mono)", fontSize: "14px", fontWeight: 700, color }}>{value}</div>
                        <div style={{ fontSize: "9px", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginTop: "2px" }}>{label}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Retirement impact */}
            {computed.retirBaselineProb != null && computed.retirWithHomeProb != null && (
              <div style={cardS}>
                <p style={sectionHead}>Retirement Impact</p>
                <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", gap: "12px" }}>
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: "24px", fontWeight: 700, color: "var(--text-secondary)" }}>{computed.retirBaselineProb}%</div>
                    <div style={{ fontSize: "10px", color: "var(--text-muted)", marginTop: "2px" }}>Without home</div>
                  </div>
                  <svg width="24" height="14" viewBox="0 0 24 14" fill="none">
                    <path d="M1 7h22M16 1l6 6-6 6" stroke={computed.retirWithHomeProb >= computed.retirBaselineProb ? "var(--green)" : "var(--amber)"} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: "24px", fontWeight: 700, color: computed.retirWithHomeProb >= computed.retirBaselineProb ? "var(--green)" : "var(--amber)" }}>
                      {computed.retirWithHomeProb}%
                    </div>
                    <div style={{ fontSize: "10px", color: "var(--text-muted)", marginTop: "2px" }}>
                      With home ({computed.retirWithHomeProb - computed.retirBaselineProb > 0 ? "+" : ""}{computed.retirWithHomeProb - computed.retirBaselineProb}pp)
                    </div>
                  </div>
                </div>
                <p style={{ fontSize: "11px", color: "var(--text-tertiary)", margin: "10px 0 0", lineHeight: 1.5 }}>
                  Estimated retirement on-track probability based on your planning profile. Home equity at year {inputs.hold_years} is counted as a recoverable asset.
                </p>
              </div>
            )}

            {/* FINN guidance */}
            <div style={cardS}>
              <p style={sectionHead}>FINN Analysis</p>
              {finnCommentary ? (
                <>
                  <p style={{ fontSize: "13px", color: "var(--text-secondary)", lineHeight: 1.65, margin: 0 }}>{finnCommentary}</p>
                  <button type="button" onClick={() => setFinnCommentary(null)} style={{ marginTop: "10px", fontSize: "10px", color: "var(--text-muted)", background: "none", border: "none", cursor: "pointer", textDecoration: "underline", padding: 0, fontFamily: "var(--font-body)" }}>
                    Refresh
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={fetchFinnCommentary}
                  disabled={finnLoading}
                  style={{ display: "flex", alignItems: "center", gap: "7px", padding: "7px 14px", borderRadius: "var(--radius-xl)", border: "1px solid rgba(109,40,217,0.22)", background: "rgba(109,40,217,0.07)", color: "#7c3aed", fontFamily: "var(--font-body)", fontSize: "12px", fontWeight: 600, cursor: finnLoading ? "default" : "pointer", opacity: finnLoading ? 0.7 : 1 }}
                >
                  <svg width="12" height="12" viewBox="0 0 20 20" fill="none">
                    <circle cx="10" cy="10" r="8" stroke="#7c3aed" strokeWidth="1.5" />
                    <path d="M7 9c0-1.657 1.343-3 3-3s3 1.343 3 3c0 1.5-1 2.5-2.5 3V13.5" stroke="#7c3aed" strokeWidth="1.5" strokeLinecap="round" />
                    <circle cx="10" cy="15.5" r="0.75" fill="#7c3aed" />
                  </svg>
                  {finnLoading ? "FINN is thinking…" : "Get FINN Analysis"}
                </button>
              )}
            </div>

            {/* Amortization schedule */}
            {computed.amortization.length > 1 && (
              <div style={cardS}>
                <button
                  type="button"
                  onClick={() => setShowAmortization((v) => !v)}
                  style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", background: "none", border: "none", cursor: "pointer", padding: 0, gap: "8px" }}
                >
                  <p style={{ ...sectionHead, margin: 0 }}>Amortization Schedule</p>
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="var(--text-muted)" strokeWidth="1.5" style={{ transform: showAmortization ? "rotate(180deg)" : "none", transition: "transform 0.15s", flexShrink: 0 }}>
                    <path d="M2 4l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
                {showAmortization && (
                  <div style={{ marginTop: "12px", overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11px", fontFamily: "var(--font-mono)" }}>
                      <thead>
                        <tr style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                          {["Yr", "Balance", "Principal", "Interest", "Cum. Interest", "Home Value", "Equity"].map((h) => (
                            <th key={h} style={{ padding: "4px 8px 6px", textAlign: "right", color: "var(--text-muted)", fontWeight: 600, fontSize: "9px", textTransform: "uppercase", letterSpacing: "0.06em", whiteSpace: "nowrap" }}>
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {computed.amortization.map((row) => (
                          <tr
                            key={row.year}
                            style={{ borderBottom: "1px solid var(--border-subtle)", background: row.year === inputs.hold_years ? "color-mix(in oklch, var(--accent) 6%, transparent)" : "transparent" }}
                          >
                            <td style={{ padding: "5px 8px", color: "var(--text-tertiary)", textAlign: "right" }}>{row.year}</td>
                            <td style={{ padding: "5px 8px", color: "var(--text-secondary)", textAlign: "right" }}>{fmtK(row.balance)}</td>
                            <td style={{ padding: "5px 8px", color: "#3b82f6", textAlign: "right" }}>{row.year === 0 ? "—" : fmtK(row.annualPrincipal)}</td>
                            <td style={{ padding: "5px 8px", color: "var(--red)", textAlign: "right" }}>{row.year === 0 ? "—" : fmtK(row.annualInterest)}</td>
                            <td style={{ padding: "5px 8px", color: "var(--text-tertiary)", textAlign: "right" }}>{fmtK(row.cumulativeInterest)}</td>
                            <td style={{ padding: "5px 8px", color: "var(--text-secondary)", textAlign: "right" }}>{fmtK(row.homeValue)}</td>
                            <td style={{ padding: "5px 8px", color: "#00d395", textAlign: "right", fontWeight: 600 }}>{fmtK(row.equity)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <p style={{ fontSize: "10px", color: "var(--text-muted)", marginTop: "8px", fontFamily: "var(--font-body)" }}>
                      Row highlighted in blue = your planned hold year. Equity = home value minus remaining loan balance.
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Add to financial plan */}
            <div style={cardS}>
              <p style={sectionHead}>Link to Financial Plan</p>
              <p style={{ fontSize: "12px", color: "var(--text-tertiary)", fontFamily: "var(--font-body)", margin: "0 0 10px", lineHeight: 1.5 }}>
                Add this scenario as milestone events in your forecast: a down payment outlay today and the projected equity realization in year {inputs.hold_years}.
              </p>
              {applyStatus === "done" ? (
                <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", color: "var(--green)", fontFamily: "var(--font-body)" }}>
                  <svg width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="var(--green)" strokeWidth="2"><path d="M4 10l5 5L16 6" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  Added to your forecast. View in Planning &gt; Life Events.
                </div>
              ) : applyStatus === "error" ? (
                <div style={{ fontSize: "12px", color: "var(--red)", fontFamily: "var(--font-body)" }}>Failed to add events. Try again.</div>
              ) : (
                <button
                  type="button"
                  disabled={applyStatus === "applying" || !computed.lastPoint}
                  onClick={async () => {
                    if (!computed.lastPoint) return;
                    setApplyStatus("applying");
                    const currentYear = new Date().getFullYear();
                    const fdDown = new FormData();
                    fdDown.set("label", `Down payment: ${inputs.name}`);
                    fdDown.set("event_year", String(currentYear));
                    fdDown.set("amount_impact", String(-(inputs.down_payment + computed.closingCosts)));
                    fdDown.set("category", "home_purchase");
                    const fdEquity = new FormData();
                    fdEquity.set("label", `Home equity sale: ${inputs.name}`);
                    fdEquity.set("event_year", String(currentYear + inputs.hold_years));
                    fdEquity.set("amount_impact", String(Math.round(computed.lastPoint.homeEquity)));
                    fdEquity.set("category", "home_sale");
                    const [r1, r2] = await Promise.all([addFutureEvent(fdDown), addFutureEvent(fdEquity)]);
                    if (r1.error || r2.error) { setApplyStatus("error"); return; }
                    setApplyStatus("done");
                  }}
                  style={{ display: "flex", alignItems: "center", gap: "6px", padding: "7px 14px", borderRadius: "var(--radius-md)", border: "1px solid var(--border)", background: "var(--bg-elevated)", color: "var(--text-primary)", fontFamily: "var(--font-body)", fontSize: "12px", fontWeight: 500, cursor: "pointer", opacity: applyStatus === "applying" ? 0.6 : 1 }}
                >
                  <svg width="12" height="12" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M10 3v14M3 10h14" strokeLinecap="round"/></svg>
                  {applyStatus === "applying" ? "Adding…" : "Add to Forecast"}
                </button>
              )}
            </div>

          </div>
        </div>
      </div>

      {/* Responsive: stack on mobile */}
      <style>{`
        @media (max-width: 768px) {
          [data-home-grid] { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}
