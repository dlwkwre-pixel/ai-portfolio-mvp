"use client";

import { useState } from "react";
import Link from "next/link";
import type { TaxPageData, RealizedLot, TLHOpportunity, WashSaleWarning } from "./page";
import { estimateTax, FILING_STATUS_LABELS, INCOME_TYPE_LABELS, US_STATES } from "@/lib/tax/estimator";
import type { FilingStatus, IncomeType } from "@/lib/tax/estimator";

// ─── helpers ─────────────────────────────────────────────────────────────────

function fmt(v: number, showSign = false) {
  const abs = `$${Math.abs(v).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  if (!showSign) return (v < 0 ? "-" : "") + abs;
  return (v >= 0 ? "+" : "-") + abs;
}

function fmtFull(v: number) {
  return `$${Math.abs(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtPct(v: number | null) {
  if (v === null) return "—";
  return `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function glColor(v: number) {
  if (v > 0) return "var(--red)";
  if (v < 0) return "var(--green)";
  return "var(--text-secondary)";
}

// 2025 federal capital gains rates
const LTCG_RATES = [
  { bracket: "Up to $47,025 (single) / $94,050 (MFJ)", rate: 0, label: "0%" },
  { bracket: "$47,026–$518,900 (single) / $94,051–$583,750 (MFJ)", rate: 0.15, label: "15%" },
  { bracket: "Over $518,900 (single) / Over $583,750 (MFJ)", rate: 0.20, label: "20%" },
];

const STCG_BRACKETS = [
  { label: "10%", rate: 0.10 }, { label: "12%", rate: 0.12 }, { label: "22%", rate: 0.22 },
  { label: "24%", rate: 0.24 }, { label: "32%", rate: 0.32 }, { label: "35%", rate: 0.35 },
  { label: "37%", rate: 0.37 },
];

const TABS = [
  { id: "outlook", label: "Tax Outlook" },
  { id: "trades", label: "My Trades" },
  { id: "reduce", label: "Reduce My Bill" },
  { id: "reference", label: "Tax Rates" },
] as const;
type TabId = typeof TABS[number]["id"];

// Rule-based FINN insights — no AI call, always instant
type FinnInsight = { type: "good" | "warn" | "info"; text: string };

function buildFinnInsights({
  stcgNet, ltcgNet, dividendIncome, totalTLHAvailable,
  tlhOpportunities, washSaleWarnings, incomeTaxEstimate,
  estimatedCapGainsTax, taxProfile, cgNiit, cgStcgRate, cgLtcgRate,
}: {
  stcgNet: number; ltcgNet: number; dividendIncome: number; totalTLHAvailable: number;
  tlhOpportunities: TLHOpportunity[]; washSaleWarnings: WashSaleWarning[];
  incomeTaxEstimate: ReturnType<typeof estimateTax> | null;
  estimatedCapGainsTax: number;
  taxProfile: { grossMonthly: number | null; filingStatus: string; incomeType: string; stateCode: string | null } | null;
  cgNiit: boolean; cgStcgRate: number; cgLtcgRate: number;
}): FinnInsight[] {
  const insights: FinnInsight[] = [];

  if (stcgNet > 2000 && cgStcgRate > cgLtcgRate) {
    insights.push({ type: "warn", text: `${fmt(stcgNet)} of your gains come from short-term trades. Had those positions been held just over a year, your tax rate would drop from ${Math.round(cgStcgRate * 100)}% to ${Math.round(cgLtcgRate * 100)}% — saving ${fmt(Math.round(stcgNet * (cgStcgRate - cgLtcgRate)))}.` });
  }

  if (tlhOpportunities.length > 0 && (stcgNet + ltcgNet) > 0) {
    const harvestable = Math.min(Math.abs(totalTLHAvailable), stcgNet + ltcgNet);
    const savings = Math.round(harvestable * cgStcgRate);
    insights.push({ type: "good", text: `You have ${tlhOpportunities.length} position${tlhOpportunities.length !== 1 ? "s" : ""} sitting at a loss. Selling them before year-end could offset your gains and save approximately ${fmt(savings)} in taxes.` });
  }

  const netCapLoss = stcgNet + ltcgNet;
  if (netCapLoss < -3000) {
    insights.push({ type: "good", text: `Your net capital loss is ${fmt(Math.abs(netCapLoss))}. Up to $3,000 can be used to reduce your regular taxable income this year — the rest carries forward and reduces future gains.` });
  }

  if (washSaleWarnings.length > 0) {
    const disallowed = washSaleWarnings.reduce((s, w) => s + (w.disallowedLoss ?? 0), 0);
    insights.push({ type: "warn", text: `${washSaleWarnings.length} potential wash sale violation${washSaleWarnings.length !== 1 ? "s" : ""} detected. Up to ${fmt(disallowed)} in losses may be disallowed — review them in "Reduce My Bill."` });
  }

  if (taxProfile?.incomeType !== "w2" && incomeTaxEstimate) {
    const q = Math.round(incomeTaxEstimate.totalTax / 4);
    insights.push({ type: "info", text: `As a self-employed filer, you're responsible for quarterly tax payments of approximately ${fmt(q)} each. Missing them can trigger an underpayment penalty from the IRS.` });
  }

  if (taxProfile?.incomeType === "w2" && estimatedCapGainsTax > 1000) {
    insights.push({ type: "info", text: `Your trading gains add ${fmt(Math.round(estimatedCapGainsTax))} to your tax bill beyond your regular withholding. You may want to pay an estimated tax installment or increase your W-4 withholding to avoid a surprise at filing.` });
  }

  if (incomeTaxEstimate && !cgNiit) {
    const threshold = taxProfile?.filingStatus === "married_filing_jointly" ? 250_000 : 200_000;
    const gap = threshold - incomeTaxEstimate.grossAnnual;
    if (gap > 0 && gap < 25_000) {
      insights.push({ type: "warn", text: `Your income is only ${fmt(gap)} below the NIIT threshold. If investment income pushes you over, an extra 3.8% surtax applies to your capital gains and dividends.` });
    }
  }

  if (dividendIncome > 500 && incomeTaxEstimate) {
    insights.push({ type: "info", text: `You received ${fmt(Math.round(dividendIncome))} in dividends. If qualified, these are taxed at the lower ${Math.round(cgLtcgRate * 100)}% rate rather than your ordinary income rate.` });
  }

  return insights;
}

// ─── main component ───────────────────────────────────────────────────────────

export default function TaxClient({ data }: { data: TaxPageData }) {
  const [tab, setTab] = useState<TabId>("outlook");
  const [stcgRate, setStcgRate] = useState(0.22);
  const [ltcgRate, setLtcgRate] = useState(0.15);
  const [niitApplies, setNiitApplies] = useState(false);
  const [finnOutput, setFinnOutput] = useState<string | null>(null);
  const [finnLoading, setFinnLoading] = useState(false);
  const [finnError, setFinnError] = useState<string | null>(null);
  const [realizedFilter, setRealizedFilter] = useState<"all" | "gains" | "losses">("all");

  const { realizedLots, dividendIncome, tlhOpportunities, washSaleWarnings, selectedYear, taxProfile } = data;

  const incomeTaxEstimate = taxProfile?.grossMonthly
    ? estimateTax(
        taxProfile.grossMonthly,
        (taxProfile.filingStatus as FilingStatus) ?? "single",
        (taxProfile.incomeType as IncomeType) ?? "w2",
        taxProfile.stateCode ?? "",
      )
    : null;

  const derivedStcgRate = incomeTaxEstimate?.federalMarginalRate ?? 0.22;
  const derivedLtcgRate = incomeTaxEstimate
    ? incomeTaxEstimate.grossAnnual > (taxProfile?.filingStatus === "married_filing_jointly" ? 583_750 : 518_900)
      ? 0.20
      : incomeTaxEstimate.grossAnnual > (taxProfile?.filingStatus === "married_filing_jointly" ? 94_050 : 47_025)
        ? 0.15 : 0.00
    : 0.15;

  const stcgLots = realizedLots.filter(l => l.termType === "short");
  const ltcgLots = realizedLots.filter(l => l.termType === "long");
  const unknownLots = realizedLots.filter(l => l.termType === "unknown");

  const stcgNet = stcgLots.reduce((s, l) => s + l.gainLoss, 0);
  const ltcgNet = ltcgLots.reduce((s, l) => s + l.gainLoss, 0);
  const unknownNet = unknownLots.reduce((s, l) => s + l.gainLoss, 0);
  const totalRealizedGain = stcgNet + ltcgNet + unknownNet;
  const totalTLHAvailable = tlhOpportunities.reduce((s, o) => s + (o.unrealizedLoss ?? 0), 0);

  const cgStcgRate = incomeTaxEstimate ? derivedStcgRate : stcgRate;
  const cgLtcgRate = incomeTaxEstimate ? derivedLtcgRate : ltcgRate;
  const cgNiit = incomeTaxEstimate
    ? (incomeTaxEstimate.grossAnnual > (taxProfile?.filingStatus === "married_filing_jointly" ? 250_000 : 200_000))
    : niitApplies;

  const estimatedCapGainsTax = Math.max(0, stcgNet) * cgStcgRate
    + Math.max(0, ltcgNet) * (cgLtcgRate + (cgNiit ? 0.038 : 0))
    + dividendIncome * cgLtcgRate;

  const potentialSavings = Math.abs(totalTLHAvailable) * cgStcgRate;
  const filteredLots = realizedLots.filter(l =>
    realizedFilter === "all" ? true : realizedFilter === "gains" ? l.gainLoss >= 0 : l.gainLoss < 0
  );

  const finnInsights = buildFinnInsights({
    stcgNet, ltcgNet, dividendIncome, totalTLHAvailable,
    tlhOpportunities, washSaleWarnings, incomeTaxEstimate,
    estimatedCapGainsTax, taxProfile, cgNiit, cgStcgRate, cgLtcgRate,
  });

  async function runFinnAnalysis() {
    setFinnLoading(true); setFinnError(null); setFinnOutput(null);
    try {
      const body = {
        year: selectedYear,
        stcgNet, ltcgNet, unknownNet, dividendIncome,
        tlhTotal: totalTLHAvailable,
        washSaleCount: washSaleWarnings.length,
        lots: realizedLots.slice(0, 20).map(l => ({
          ticker: l.ticker, gainLoss: l.gainLoss, termType: l.termType, soldAt: l.soldAt,
        })),
        opportunities: tlhOpportunities.slice(0, 10).map(o => ({
          ticker: o.ticker, unrealizedLoss: o.unrealizedLoss, shares: o.shares,
        })),
      };
      const res = await fetch("/api/tax/ai-strategy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await res.text());
      const json = await res.json();
      setFinnOutput(json.analysis);
    } catch (e) {
      setFinnError(e instanceof Error ? e.message : "Analysis failed.");
    } finally {
      setFinnLoading(false);
    }
  }

  const totalTax = Math.round((incomeTaxEstimate?.totalTax ?? 0) + estimatedCapGainsTax);
  const grossAnnual = incomeTaxEstimate?.grossAnnual ?? 0;
  const effectiveRate = grossAnnual > 0 ? ((totalTax / grossAnnual) * 100).toFixed(1) : null;

  const disclaimer = (
    <p style={{ fontSize: "10px", color: "var(--text-muted)", lineHeight: 1.5, margin: 0 }}>
      <strong style={{ color: "#f59e0b" }}>Not tax advice.</strong> Educational estimates based on your transaction history. Consult a CPA before making filing or investment decisions. Data may be incomplete if transactions are missing acquisition dates.
    </p>
  );

  const insightIcon = (type: FinnInsight["type"]) => {
    if (type === "good") return { icon: "✓", color: "var(--green)", bg: "rgba(0,211,149,0.06)", border: "rgba(0,211,149,0.18)" };
    if (type === "warn") return { icon: "⚠", color: "#f59e0b", bg: "rgba(245,158,11,0.06)", border: "rgba(245,158,11,0.2)" };
    return { icon: "→", color: "oklch(0.65 0.18 260)", bg: "rgba(99,102,241,0.06)", border: "rgba(99,102,241,0.18)" };
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>

      {/* Year picker */}
      <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
        {data.years.map(y => (
          <Link
            key={y}
            href={`/tax?year=${y}`}
            style={{
              padding: "4px 12px", borderRadius: "var(--radius-full)",
              fontSize: "12px", fontWeight: 500, textDecoration: "none",
              background: y === selectedYear ? "var(--brand-blue)" : "var(--bg-elevated)",
              color: y === selectedYear ? "#fff" : "var(--text-secondary)",
              border: `1px solid ${y === selectedYear ? "var(--brand-blue)" : "var(--border)"}`,
            }}
          >
            {y}
          </Link>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", borderBottom: "1px solid var(--border-subtle)", overflowX: "auto" }}>
        {TABS.map(t => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            style={{
              padding: "8px 16px", fontSize: "12px", fontWeight: 500,
              background: "none", border: "none", cursor: "pointer",
              color: tab === t.id ? "var(--text-primary)" : "var(--text-tertiary)",
              borderBottom: `2px solid ${tab === t.id ? "var(--brand-blue)" : "transparent"}`,
              whiteSpace: "nowrap", transition: "color 0.12s", position: "relative",
            }}
          >
            {t.label}
            {t.id === "reduce" && washSaleWarnings.length > 0 && (
              <span style={{ marginLeft: "5px", fontSize: "9px", padding: "1px 5px", borderRadius: "var(--radius-full)", background: "rgba(239,68,68,0.15)", color: "var(--red)" }}>
                {washSaleWarnings.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── TAX OUTLOOK ─────────────────────────────────────────────────────── */}
      {tab === "outlook" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>

          {/* Setup prompt */}
          {!taxProfile?.grossMonthly && (
            <div style={{ padding: "14px 16px", background: "oklch(0.55 0.15 265 / 0.07)", border: "1px solid oklch(0.55 0.15 265 / 0.22)", borderRadius: "var(--radius-lg)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
              <div>
                <p style={{ fontSize: "12px", fontWeight: 600, color: "oklch(0.72 0.18 265)", margin: "0 0 3px" }}>Add your income to see your full tax picture</p>
                <p style={{ fontSize: "11px", color: "var(--text-muted)", margin: 0 }}>Connect your salary, filing status, and state so we can combine your W-2 tax with your investment gains into one number.</p>
              </div>
              <Link href="/planning" style={{ fontSize: "11px", fontWeight: 600, color: "oklch(0.72 0.18 265)", textDecoration: "none", whiteSpace: "nowrap", padding: "5px 12px", borderRadius: "var(--radius-full)", border: "1px solid oklch(0.55 0.15 265 / 0.3)", background: "oklch(0.55 0.15 265 / 0.08)" }}>
                Set up profile →
              </Link>
            </div>
          )}

          {/* Total bill hero */}
          {incomeTaxEstimate && (
            <div style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)", borderRadius: "var(--radius-lg)", overflow: "hidden" }}>
              <div style={{ padding: "20px 20px 16px", display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "16px", flexWrap: "wrap" as const }}>
                <div>
                  <p style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase" as const, color: "var(--text-muted)", margin: "0 0 6px", fontFamily: "var(--font-body)" }}>
                    Your Estimated {selectedYear} Tax Bill
                  </p>
                  <div style={{ display: "flex", alignItems: "baseline", gap: "10px", flexWrap: "wrap" as const }}>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: "34px", fontWeight: 700, color: "var(--text-primary)", lineHeight: 1 }}>
                      {fmt(totalTax)}
                    </span>
                    {effectiveRate && (
                      <span style={{ fontSize: "13px", color: "var(--text-muted)", fontFamily: "var(--font-body)" }}>
                        {effectiveRate}% effective rate
                      </span>
                    )}
                  </div>
                  <p style={{ fontSize: "11px", color: "var(--text-muted)", margin: "6px 0 0", fontFamily: "var(--font-body)" }}>
                    {INCOME_TYPE_LABELS[(taxProfile!.incomeType as IncomeType) ?? "w2"]}
                    {taxProfile?.stateCode ? ` · ${US_STATES.find(s => s.code === taxProfile.stateCode)?.name ?? taxProfile.stateCode}` : ""}
                    {" · "}{FILING_STATUS_LABELS[(taxProfile!.filingStatus as FilingStatus) ?? "single"]}
                  </p>
                </div>
                {grossAnnual > 0 && (
                  <div style={{ textAlign: "right" as const }}>
                    <p style={{ fontSize: "9px", color: "var(--text-muted)", margin: "0 0 4px", textTransform: "uppercase" as const, letterSpacing: "0.07em", fontFamily: "var(--font-body)" }}>Gross income</p>
                    <p style={{ fontFamily: "var(--font-mono)", fontSize: "16px", fontWeight: 600, color: "var(--text-secondary)", margin: 0 }}>{fmt(Math.round(grossAnnual))}</p>
                    <p style={{ fontSize: "9px", color: "var(--text-muted)", margin: "2px 0 0", fontFamily: "var(--font-body)" }}>annualized estimate</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Income tax row — only when profile exists */}
          {incomeTaxEstimate && (
            <div style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)", borderRadius: "var(--radius-lg)", overflow: "hidden" }}>
              <div style={{ padding: "14px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", borderBottom: "1px solid var(--border-subtle)" }}>
                <div>
                  <p style={{ fontSize: "13px", fontWeight: 700, color: "var(--text-primary)", margin: "0 0 2px", fontFamily: "var(--font-body)" }}>Income Tax</p>
                  <p style={{ fontSize: "11px", color: "var(--text-muted)", margin: 0 }}>
                    Based on {fmt(Math.round(grossAnnual))} annual salary
                  </p>
                </div>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: "18px", fontWeight: 700, color: "var(--text-primary)", flexShrink: 0 }}>
                  {fmt(Math.round(incomeTaxEstimate.totalTax))}
                </span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", borderBottom: "1px solid var(--border-subtle)" }}>
                {[
                  { label: "Federal", value: fmt(Math.round(incomeTaxEstimate.federalIncomeTax)), sub: `${(incomeTaxEstimate.federalEffectiveRate * 100).toFixed(1)}% effective` },
                  {
                    label: taxProfile!.incomeType === "w2" ? "FICA" : "SE Tax",
                    value: fmt(Math.round(taxProfile!.incomeType === "w2" ? incomeTaxEstimate.ficaTax : incomeTaxEstimate.seTax)),
                    sub: taxProfile!.incomeType === "w2" ? "SS + Medicare" : "15.3% of net income",
                  },
                  { label: `State${taxProfile?.stateCode ? ` (${taxProfile.stateCode})` : ""}`, value: fmt(Math.round(incomeTaxEstimate.stateTax)), sub: `${(incomeTaxEstimate.stateEffectiveRate * 100).toFixed(1)}% effective` },
                ].map(({ label, value, sub }, i) => (
                  <div key={label} style={{ padding: "10px 16px", borderRight: i < 2 ? "1px solid var(--border-subtle)" : undefined }}>
                    <p style={{ fontSize: "9px", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" as const, color: "var(--text-muted)", fontFamily: "var(--font-body)", margin: "0 0 3px" }}>{label}</p>
                    <p style={{ fontFamily: "var(--font-mono)", fontSize: "14px", fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>{value}</p>
                    <p style={{ fontSize: "9px", color: "var(--text-muted)", margin: "1px 0 0", fontFamily: "var(--font-body)" }}>{sub}</p>
                  </div>
                ))}
              </div>
              <div style={{ padding: "10px 16px", background: taxProfile!.incomeType === "w2" ? "rgba(0,211,149,0.03)" : "rgba(245,158,11,0.03)" }}>
                {taxProfile!.incomeType === "w2" ? (
                  <p style={{ fontSize: "11px", color: "var(--text-secondary)", margin: 0, lineHeight: 1.55 }}>
                    <span style={{ fontWeight: 600, color: "var(--green)" }}>Already handled.</span> Your employer withholds income tax and FICA from every paycheck — you won&apos;t write a check for this amount.
                  </p>
                ) : (
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" as const, gap: "12px" }}>
                    <div>
                      <p style={{ fontSize: "11px", fontWeight: 600, color: "#f59e0b", margin: "0 0 2px" }}>Quarterly estimated payments required</p>
                      <p style={{ fontSize: "11px", color: "var(--text-muted)", margin: 0 }}>Due: Apr 15 · Jun 16 · Sep 15 · Jan 15</p>
                    </div>
                    <div style={{ textAlign: "right" as const }}>
                      <p style={{ fontSize: "9px", color: "var(--text-muted)", margin: "0 0 2px", fontFamily: "var(--font-body)" }}>Per quarter</p>
                      <p style={{ fontFamily: "var(--font-mono)", fontSize: "18px", fontWeight: 700, color: "#f59e0b", margin: 0 }}>{fmt(Math.round(incomeTaxEstimate.totalTax / 4))}</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Trading gains / losses section */}
          <div style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)", borderRadius: "var(--radius-lg)", overflow: "hidden" }}>
            <div style={{ padding: "14px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", borderBottom: "1px solid var(--border-subtle)" }}>
              <div>
                <p style={{ fontSize: "13px", fontWeight: 700, color: "var(--text-primary)", margin: "0 0 2px", fontFamily: "var(--font-body)" }}>
                  Investment Gains &amp; Losses
                </p>
                <p style={{ fontSize: "11px", color: "var(--text-muted)", margin: 0 }}>
                  {realizedLots.length === 0
                    ? `No trades recorded in ${selectedYear}`
                    : `${realizedLots.length} sale${realizedLots.length !== 1 ? "s" : ""} in ${selectedYear}`}
                  {dividendIncome > 0 ? ` · ${fmt(Math.round(dividendIncome))} dividends` : ""}
                </p>
              </div>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: "18px", fontWeight: 700, color: estimatedCapGainsTax > 0 ? "var(--red)" : "var(--text-muted)", flexShrink: 0 }}>
                {estimatedCapGainsTax > 0 ? fmt(Math.round(estimatedCapGainsTax)) : fmt(0)}
              </span>
            </div>

            {realizedLots.length === 0 && dividendIncome === 0 ? (
              <div style={{ padding: "20px", textAlign: "center" as const }}>
                <p style={{ fontSize: "12px", color: "var(--text-muted)", margin: 0 }}>
                  No recorded sales or dividends in {selectedYear}. Add transactions in your portfolio to see your investment tax picture.
                </p>
              </div>
            ) : (
              <div>
                {stcgNet !== 0 && (
                  <div style={{ padding: "12px 20px", borderBottom: "1px solid var(--border-subtle)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "2px" }}>
                        <span style={{ fontSize: "11px", fontWeight: 600, color: "var(--text-primary)", fontFamily: "var(--font-body)" }}>Short-term sales</span>
                        <span style={{ fontSize: "9px", padding: "1px 6px", borderRadius: "var(--radius-full)", background: "rgba(239,68,68,0.1)", color: "var(--red)", fontFamily: "var(--font-body)", fontWeight: 600 }}>held &lt;1 year</span>
                      </div>
                      <p style={{ fontSize: "10px", color: "var(--text-muted)", margin: 0 }}>
                        {stcgLots.length} sale{stcgLots.length !== 1 ? "s" : ""} · net {fmt(stcgNet, true)} · taxed at {Math.round(cgStcgRate * 100)}% (your ordinary rate)
                      </p>
                    </div>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: "14px", fontWeight: 700, color: stcgNet > 0 ? "var(--red)" : "var(--green)", flexShrink: 0 }}>
                      {stcgNet > 0 ? fmt(Math.round(Math.max(0, stcgNet) * cgStcgRate)) : "—"}
                    </span>
                  </div>
                )}
                {ltcgNet !== 0 && (
                  <div style={{ padding: "12px 20px", borderBottom: "1px solid var(--border-subtle)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "2px" }}>
                        <span style={{ fontSize: "11px", fontWeight: 600, color: "var(--text-primary)", fontFamily: "var(--font-body)" }}>Long-term sales</span>
                        <span style={{ fontSize: "9px", padding: "1px 6px", borderRadius: "var(--radius-full)", background: "rgba(0,211,149,0.1)", color: "var(--green)", fontFamily: "var(--font-body)", fontWeight: 600 }}>held &gt;1 year</span>
                      </div>
                      <p style={{ fontSize: "10px", color: "var(--text-muted)", margin: 0 }}>
                        {ltcgLots.length} sale{ltcgLots.length !== 1 ? "s" : ""} · net {fmt(ltcgNet, true)} · taxed at {Math.round(cgLtcgRate * 100)}%{cgNiit ? " + 3.8% NIIT" : ""} (preferred rate)
                      </p>
                    </div>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: "14px", fontWeight: 700, color: ltcgNet > 0 ? "var(--red)" : "var(--green)", flexShrink: 0 }}>
                      {ltcgNet > 0 ? fmt(Math.round(Math.max(0, ltcgNet) * (cgLtcgRate + (cgNiit ? 0.038 : 0)))) : "—"}
                    </span>
                  </div>
                )}
                {dividendIncome > 0 && (
                  <div style={{ padding: "12px 20px", borderBottom: "1px solid var(--border-subtle)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
                    <div>
                      <p style={{ fontSize: "11px", fontWeight: 600, color: "var(--text-primary)", margin: "0 0 2px", fontFamily: "var(--font-body)" }}>Dividend income</p>
                      <p style={{ fontSize: "10px", color: "var(--text-muted)", margin: 0 }}>{fmt(Math.round(dividendIncome))} received · taxed at {Math.round(cgLtcgRate * 100)}% if qualified</p>
                    </div>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: "14px", fontWeight: 700, color: "var(--red)", flexShrink: 0 }}>
                      {fmt(Math.round(dividendIncome * cgLtcgRate))}
                    </span>
                  </div>
                )}
                {unknownLots.length > 0 && (
                  <div style={{ padding: "10px 20px", background: "rgba(245,158,11,0.03)" }}>
                    <p style={{ fontSize: "11px", color: "#f59e0b", margin: 0 }}>
                      <strong>{unknownLots.length} sale{unknownLots.length !== 1 ? "s" : ""}</strong> are missing an acquisition date — they can&apos;t be classified as short or long-term. Add purchase dates to get accurate tax estimates.
                    </p>
                  </div>
                )}

                {/* No profile — manual bracket picker */}
                {!incomeTaxEstimate && (
                  <div style={{ padding: "14px 16px", borderTop: "1px solid var(--border-subtle)" }}>
                    <p style={{ fontSize: "11px", color: "var(--text-muted)", margin: "0 0 10px" }}>Set your tax bracket to estimate your capital gains tax:</p>
                    <div style={{ display: "flex", gap: "16px", flexWrap: "wrap" as const }}>
                      <div>
                        <p style={{ fontSize: "10px", fontWeight: 600, textTransform: "uppercase" as const, letterSpacing: "0.07em", color: "var(--text-tertiary)", margin: "0 0 5px" }}>Ordinary rate (short-term)</p>
                        <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" as const }}>
                          {STCG_BRACKETS.map(b => (
                            <button key={b.label} type="button" onClick={() => setStcgRate(b.rate)}
                              style={{ padding: "3px 9px", borderRadius: "var(--radius-full)", fontSize: "11px", cursor: "pointer", border: "1px solid", background: stcgRate === b.rate ? "var(--brand-blue)" : "var(--bg-elevated)", borderColor: stcgRate === b.rate ? "var(--brand-blue)" : "var(--border)", color: stcgRate === b.rate ? "#fff" : "var(--text-secondary)", fontFamily: "var(--font-mono)" }}>
                              {b.label}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div>
                        <p style={{ fontSize: "10px", fontWeight: 600, textTransform: "uppercase" as const, letterSpacing: "0.07em", color: "var(--text-tertiary)", margin: "0 0 5px" }}>Long-term rate</p>
                        <div style={{ display: "flex", gap: "4px" }}>
                          {LTCG_RATES.map(b => (
                            <button key={b.label} type="button" onClick={() => setLtcgRate(b.rate)}
                              style={{ padding: "3px 9px", borderRadius: "var(--radius-full)", fontSize: "11px", cursor: "pointer", border: "1px solid", background: ltcgRate === b.rate ? "var(--brand-blue)" : "var(--bg-elevated)", borderColor: ltcgRate === b.rate ? "var(--brand-blue)" : "var(--border)", color: ltcgRate === b.rate ? "#fff" : "var(--text-secondary)", fontFamily: "var(--font-mono)" }}>
                              {b.label}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div style={{ display: "flex", alignItems: "flex-end" }}>
                        <label style={{ display: "flex", alignItems: "center", gap: "7px", cursor: "pointer", fontSize: "11px", color: "var(--text-secondary)" }}>
                          <div
                            style={{ width: "14px", height: "14px", borderRadius: "3px", border: `2px solid ${niitApplies ? "var(--brand-blue)" : "var(--border-strong)"}`, background: niitApplies ? "var(--brand-blue)" : "transparent", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
                            onClick={() => setNiitApplies(v => !v)}
                          >
                            {niitApplies && <svg width="8" height="8" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                          </div>
                          3.8% NIIT (income &gt; $200k)
                        </label>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Smart moves — TLH + wash sales */}
          {(tlhOpportunities.length > 0 || washSaleWarnings.length > 0) && (
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {tlhOpportunities.length > 0 && (
                <div style={{ padding: "14px 16px", background: "rgba(0,211,149,0.04)", border: "1px solid rgba(0,211,149,0.15)", borderRadius: "var(--radius-lg)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
                  <div>
                    <p style={{ fontSize: "12px", fontWeight: 600, color: "var(--green)", margin: "0 0 3px" }}>Tax savings available</p>
                    <p style={{ fontSize: "11px", color: "var(--text-secondary)", margin: 0 }}>
                      {tlhOpportunities.length} position{tlhOpportunities.length !== 1 ? "s" : ""} are below cost basis for a total unrealized loss of {fmt(totalTLHAvailable)}.
                      {" "}Selling them could save approximately <strong>{fmt(Math.round(potentialSavings))}</strong> in taxes.
                    </p>
                  </div>
                  <button type="button" onClick={() => setTab("reduce")} style={{ fontSize: "11px", fontWeight: 600, color: "var(--green)", background: "none", border: "1px solid rgba(0,211,149,0.25)", borderRadius: "var(--radius-full)", padding: "4px 12px", cursor: "pointer", flexShrink: 0, fontFamily: "var(--font-body)" }}>
                    View →
                  </button>
                </div>
              )}
              {washSaleWarnings.length > 0 && (
                <div style={{ padding: "14px 16px", background: "rgba(239,68,68,0.04)", border: "1px solid rgba(239,68,68,0.18)", borderRadius: "var(--radius-lg)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
                  <div>
                    <p style={{ fontSize: "12px", fontWeight: 600, color: "var(--red)", margin: "0 0 3px" }}>Wash sale warning</p>
                    <p style={{ fontSize: "11px", color: "var(--text-secondary)", margin: 0 }}>
                      {washSaleWarnings.length} potential violation{washSaleWarnings.length !== 1 ? "s" : ""} detected. If you sold a stock at a loss and bought it back within 30 days, the IRS may disallow that loss deduction.
                    </p>
                  </div>
                  <button type="button" onClick={() => setTab("reduce")} style={{ fontSize: "11px", fontWeight: 600, color: "var(--red)", background: "none", border: "1px solid rgba(239,68,68,0.25)", borderRadius: "var(--radius-full)", padding: "4px 12px", cursor: "pointer", flexShrink: 0, fontFamily: "var(--font-body)" }}>
                    Review →
                  </button>
                </div>
              )}
            </div>
          )}

          {/* FINN section */}
          <div style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)", borderRadius: "var(--radius-lg)", overflow: "hidden" }}>
            <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--border-subtle)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <div style={{ width: "28px", height: "28px", borderRadius: "8px", background: "linear-gradient(135deg,#2563eb,#4f46e5)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <svg width="14" height="14" viewBox="0 0 20 20" fill="#fff"><path d="M10 2a8 8 0 100 16A8 8 0 0010 2zm0 3a1 1 0 110 2 1 1 0 010-2zm1 9H9V9h2v5z" /></svg>
                </div>
                <div>
                  <p style={{ fontSize: "13px", fontWeight: 700, color: "var(--text-primary)", margin: 0, fontFamily: "var(--font-body)" }}>FINN&apos;s Tax Observations</p>
                  <p style={{ fontSize: "10px", color: "var(--text-muted)", margin: 0 }}>Smart patterns based on your {selectedYear} data</p>
                </div>
              </div>
              <button
                type="button"
                onClick={runFinnAnalysis}
                disabled={finnLoading}
                style={{ fontSize: "11px", fontWeight: 600, color: "#fff", background: "linear-gradient(135deg,#2563eb,#4f46e5)", border: "none", borderRadius: "8px", padding: "6px 14px", cursor: finnLoading ? "not-allowed" : "pointer", opacity: finnLoading ? 0.7 : 1, flexShrink: 0, fontFamily: "var(--font-body)" }}
              >
                {finnLoading ? "Analyzing…" : finnOutput ? "Re-run" : "Get full analysis"}
              </button>
            </div>

            <div style={{ padding: "14px 20px", display: "flex", flexDirection: "column", gap: "8px" }}>
              {finnInsights.length === 0 && !finnOutput && !finnLoading && (
                <p style={{ fontSize: "12px", color: "var(--text-muted)", margin: 0 }}>
                  {realizedLots.length === 0 && !taxProfile?.grossMonthly
                    ? "Add income and record trades to get personalized FINN observations."
                    : "No specific flags right now. Click \"Get full analysis\" for a deeper look at your tax situation."}
                </p>
              )}

              {finnInsights.map((insight, i) => {
                const style = insightIcon(insight.type);
                return (
                  <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: "10px", padding: "10px 12px", borderRadius: "var(--radius-md)", background: style.bg, border: `1px solid ${style.border}` }}>
                    <span style={{ fontSize: "11px", fontWeight: 700, color: style.color, flexShrink: 0, marginTop: "1px", fontFamily: "var(--font-mono)" }}>{style.icon}</span>
                    <p style={{ fontSize: "12px", color: "var(--text-secondary)", margin: 0, lineHeight: 1.6 }}>{insight.text}</p>
                  </div>
                );
              })}

              {finnError && (
                <div style={{ padding: "10px 12px", borderRadius: "var(--radius-md)", background: "rgba(239,68,68,0.07)", border: "1px solid rgba(239,68,68,0.18)", fontSize: "12px", color: "var(--red)" }}>
                  {finnError}
                </div>
              )}

              {finnLoading && (
                <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "var(--text-muted)", fontSize: "12px" }}>
                  <svg style={{ animation: "spin 1s linear infinite" }} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" /></svg>
                  FINN is reviewing your tax situation…
                </div>
              )}

              {finnOutput && (
                <div style={{ marginTop: "4px", fontSize: "13px", color: "var(--text-secondary)", lineHeight: 1.75, whiteSpace: "pre-wrap" as const, borderTop: "1px solid var(--border-subtle)", paddingTop: "12px" }}>
                  {finnOutput}
                </div>
              )}
            </div>
          </div>

          {disclaimer}
        </div>
      )}

      {/* ── MY TRADES ─────────────────────────────────────────────────────────── */}
      {tab === "trades" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" as const }}>
            <span style={{ fontSize: "11px", color: "var(--text-tertiary)" }}>Show:</span>
            {(["all", "gains", "losses"] as const).map(f => (
              <button key={f} type="button" onClick={() => setRealizedFilter(f)}
                style={{ padding: "3px 10px", borderRadius: "var(--radius-full)", fontSize: "11px", cursor: "pointer", border: "1px solid", background: realizedFilter === f ? "var(--brand-blue)" : "var(--bg-elevated)", borderColor: realizedFilter === f ? "var(--brand-blue)" : "var(--border)", color: realizedFilter === f ? "#fff" : "var(--text-secondary)" }}>
                {f === "all" ? "All trades" : f === "gains" ? "Gains only" : "Losses only"}
              </button>
            ))}
            <span style={{ marginLeft: "auto", fontSize: "10px", color: "var(--text-muted)" }}>
              {filteredLots.length} transaction{filteredLots.length !== 1 ? "s" : ""}
            </span>
          </div>

          {filteredLots.length === 0 ? (
            <EmptyState
              icon="📊"
              title={`No ${realizedFilter === "all" ? "recorded" : realizedFilter} transactions in ${selectedYear}`}
              sub="Add sell transactions with acquisition dates to see your tax lot breakdown."
            />
          ) : (
            <div style={{ overflowX: "auto", borderRadius: "var(--radius-md)", border: "1px solid var(--border-subtle)" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11px" }}>
                <thead>
                  <tr style={{ background: "var(--bg-surface)" }}>
                    {["Ticker", "Portfolio", "Sold", "Acquired", "Held", "Term", "Shares", "Cost Basis", "Proceeds", "Gain / Loss"].map(h => (
                      <th key={h} style={{ padding: "8px 12px", textAlign: "left" as const, fontWeight: 600, color: "var(--text-tertiary)", fontSize: "9px", textTransform: "uppercase" as const, letterSpacing: "0.06em", borderBottom: "1px solid var(--border-subtle)", whiteSpace: "nowrap" as const }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredLots.map((lot, i) => (
                    <tr key={lot.id} style={{ borderBottom: "1px solid var(--border-subtle)", background: i % 2 === 0 ? "transparent" : "var(--bg-elevated)" }}>
                      <td style={{ padding: "8px 12px", fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--text-primary)" }}>{lot.ticker}</td>
                      <td style={{ padding: "8px 12px", color: "var(--text-muted)", maxWidth: "120px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{lot.portfolioName}</td>
                      <td style={{ padding: "8px 12px", color: "var(--text-secondary)", whiteSpace: "nowrap" as const }}>{fmtDate(lot.soldAt)}</td>
                      <td style={{ padding: "8px 12px", color: lot.acquiredAt ? "var(--text-secondary)" : "var(--text-muted)", whiteSpace: "nowrap" as const }}>{lot.acquiredAt ? fmtDate(lot.acquiredAt) : "—"}</td>
                      <td style={{ padding: "8px 12px", fontFamily: "var(--font-mono)", color: "var(--text-muted)" }}>{lot.holdingDays !== null ? `${lot.holdingDays}d` : "—"}</td>
                      <td style={{ padding: "8px 12px" }}><TermBadge term={lot.termType} /></td>
                      <td style={{ padding: "8px 12px", fontFamily: "var(--font-mono)", color: "var(--text-secondary)" }}>{lot.quantity.toLocaleString(undefined, { maximumFractionDigits: 4 })}</td>
                      <td style={{ padding: "8px 12px", fontFamily: "var(--font-mono)", color: "var(--text-secondary)" }}>{fmtFull(lot.costBasis)}</td>
                      <td style={{ padding: "8px 12px", fontFamily: "var(--font-mono)", color: "var(--text-secondary)" }}>{fmtFull(lot.proceeds)}</td>
                      <td style={{ padding: "8px 12px", fontFamily: "var(--font-mono)", fontWeight: 600, color: glColor(lot.gainLoss), whiteSpace: "nowrap" as const }}>
                        {fmt(lot.gainLoss, true)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ background: "var(--bg-surface)", borderTop: "2px solid var(--border)" }}>
                    <td colSpan={8} style={{ padding: "8px 12px", fontSize: "10px", fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.07em", color: "var(--text-tertiary)" }}>Total</td>
                    <td style={{ padding: "8px 12px", fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--text-primary)" }}>{fmtFull(filteredLots.reduce((s, l) => s + l.proceeds, 0))}</td>
                    <td style={{ padding: "8px 12px", fontFamily: "var(--font-mono)", fontWeight: 700, color: glColor(filteredLots.reduce((s, l) => s + l.gainLoss, 0)) }}>
                      {fmt(filteredLots.reduce((s, l) => s + l.gainLoss, 0), true)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          {unknownLots.length > 0 && (
            <div style={{ padding: "10px 12px", background: "rgba(245,158,11,0.05)", border: "1px solid rgba(245,158,11,0.15)", borderRadius: "var(--radius-sm)", fontSize: "11px", color: "var(--text-muted)", lineHeight: 1.5 }}>
              <strong style={{ color: "#f59e0b" }}>{unknownLots.length} sale{unknownLots.length !== 1 ? "s" : ""} missing an acquisition date.</strong> Add the purchase date when recording sell transactions to get accurate short-term vs long-term classification.
            </div>
          )}

          {disclaimer}
        </div>
      )}

      {/* ── REDUCE MY BILL ──────────────────────────────────────────────────────── */}
      {tab === "reduce" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>

          {/* TLH section */}
          <div style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)", borderRadius: "var(--radius-lg)", overflow: "hidden" }}>
            <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border-subtle)" }}>
              <p style={{ fontSize: "13px", fontWeight: 700, color: "var(--text-primary)", margin: "0 0 4px" }}>Tax-Loss Harvesting</p>
              <p style={{ fontSize: "11px", color: "var(--text-muted)", margin: 0, lineHeight: 1.55 }}>
                If you own stocks that are currently worth less than what you paid, you can sell them to &quot;realize&quot; that loss on paper. That loss then cancels out gains you made elsewhere — lowering your tax bill. You can reinvest the money in a similar (not identical) stock right away to stay in the market.
              </p>
            </div>

            {tlhOpportunities.length === 0 ? (
              <div style={{ padding: "28px 20px", textAlign: "center" as const }}>
                <p style={{ fontSize: "13px", fontWeight: 500, color: "var(--text-secondary)", margin: "0 0 4px" }}>No positions below cost basis right now</p>
                <p style={{ fontSize: "11px", color: "var(--text-muted)", margin: 0 }}>All current holdings are above what you paid. Check back after market movements.</p>
              </div>
            ) : (
              <div>
                <div style={{ padding: "12px 20px", borderBottom: "1px solid var(--border-subtle)", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" as const, gap: "8px" }}>
                  <p style={{ fontSize: "12px", color: "var(--text-secondary)", margin: 0 }}>
                    <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--red)" }}>{tlhOpportunities.length} position{tlhOpportunities.length !== 1 ? "s" : ""}</span>
                    {" "}with total unrealized losses of{" "}
                    <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--red)" }}>{fmt(totalTLHAvailable)}</span>
                  </p>
                  <p style={{ fontSize: "11px", color: "var(--text-secondary)", margin: 0 }}>
                    Potential tax savings: <span style={{ fontFamily: "var(--font-mono)", color: "var(--green)", fontWeight: 700 }}>{fmt(Math.round(potentialSavings))}</span>
                  </p>
                </div>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11px" }}>
                    <thead>
                      <tr style={{ background: "var(--bg-surface)" }}>
                        {["Stock", "Portfolio", "Shares", "Cost Basis", "Current Value", "Unrealized Loss", "Loss %", "Est. Tax Saved"].map(h => (
                          <th key={h} style={{ padding: "8px 12px", textAlign: "left" as const, fontWeight: 600, color: "var(--text-tertiary)", fontSize: "9px", textTransform: "uppercase" as const, letterSpacing: "0.06em", borderBottom: "1px solid var(--border-subtle)", whiteSpace: "nowrap" as const }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {tlhOpportunities.map((opp, i) => (
                        <tr key={`${opp.portfolioId}-${opp.ticker}`} style={{ borderBottom: "1px solid var(--border-subtle)", background: i % 2 === 0 ? "transparent" : "var(--bg-elevated)" }}>
                          <td style={{ padding: "8px 12px" }}>
                            <div style={{ fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--text-primary)" }}>{opp.ticker}</div>
                            {opp.companyName && <div style={{ fontSize: "9px", color: "var(--text-muted)", marginTop: "1px" }}>{opp.companyName}</div>}
                          </td>
                          <td style={{ padding: "8px 12px", color: "var(--text-muted)", maxWidth: "110px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{opp.portfolioName}</td>
                          <td style={{ padding: "8px 12px", fontFamily: "var(--font-mono)", color: "var(--text-secondary)" }}>{opp.shares.toLocaleString(undefined, { maximumFractionDigits: 4 })}</td>
                          <td style={{ padding: "8px 12px", fontFamily: "var(--font-mono)", color: "var(--text-secondary)" }}>{fmtFull(opp.costBasis)}</td>
                          <td style={{ padding: "8px 12px", fontFamily: "var(--font-mono)", color: "var(--text-secondary)" }}>{opp.currentValue !== null ? fmtFull(opp.currentValue) : "—"}</td>
                          <td style={{ padding: "8px 12px", fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--red)" }}>{opp.unrealizedLoss !== null ? fmt(opp.unrealizedLoss) : "—"}</td>
                          <td style={{ padding: "8px 12px", fontFamily: "var(--font-mono)", color: "var(--red)" }}>{fmtPct(opp.unrealizedLossPct)}</td>
                          <td style={{ padding: "8px 12px", fontFamily: "var(--font-mono)", fontWeight: 600, color: "var(--green)" }}>
                            {opp.unrealizedLoss !== null ? fmt(Math.abs(opp.unrealizedLoss) * cgStcgRate) : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div style={{ padding: "14px 20px", background: "var(--bg-elevated)", borderTop: "1px solid var(--border-subtle)" }}>
                  <p style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-primary)", margin: "0 0 8px" }}>How to do it in 3 steps</p>
                  <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                    {[
                      "Sell the position — the loss is now \"realized\" and can offset your gains",
                      "Wait at least 31 days before buying the same stock back (the wash sale rule)",
                      "While waiting, park the money in a similar ETF (e.g. sell VTI → buy ITOT or SCHB) to stay invested",
                    ].map((step, i) => (
                      <div key={i} style={{ display: "flex", gap: "10px", alignItems: "flex-start" }}>
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: "10px", color: "var(--brand-blue)", flexShrink: 0, marginTop: "1px" }}>{i + 1}.</span>
                        <span style={{ fontSize: "11px", color: "var(--text-secondary)", lineHeight: 1.5 }}>{step}</span>
                      </div>
                    ))}
                  </div>
                  <p style={{ fontSize: "10px", color: "var(--text-muted)", margin: "10px 0 0" }}>
                    Also: net capital losses above your gains can offset up to $3,000 of ordinary income per year. Excess carries forward indefinitely.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Wash sale section */}
          <div style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)", borderRadius: "var(--radius-lg)", overflow: "hidden" }}>
            <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border-subtle)" }}>
              <p style={{ fontSize: "13px", fontWeight: 700, color: "var(--text-primary)", margin: "0 0 4px" }}>Wash Sale Warnings</p>
              <p style={{ fontSize: "11px", color: "var(--text-muted)", margin: 0, lineHeight: 1.55 }}>
                If you sell a stock at a loss and then buy the same stock back within 30 days (before or after), the IRS calls this a &quot;wash sale&quot; and won&apos;t let you claim the loss. The loss isn&apos;t gone — it gets added to your new shares&apos; cost basis — but it delays the tax benefit.
              </p>
            </div>

            {washSaleWarnings.length === 0 ? (
              <div style={{ padding: "28px 20px", textAlign: "center" as const }}>
                <p style={{ fontSize: "13px", fontWeight: 500, color: "var(--text-secondary)", margin: "0 0 4px" }}>No wash sale violations detected</p>
                <p style={{ fontSize: "11px", color: "var(--text-muted)", margin: 0 }}>No buy/sell pairs of the same stock found within 30 days.</p>
              </div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11px" }}>
                  <thead>
                    <tr style={{ background: "rgba(239,68,68,0.06)" }}>
                      {["Stock", "Portfolio", "Sold", "Bought Back", "Days Between", "Disallowed Loss"].map(h => (
                        <th key={h} style={{ padding: "8px 12px", textAlign: "left" as const, fontWeight: 600, color: "var(--text-tertiary)", fontSize: "9px", textTransform: "uppercase" as const, letterSpacing: "0.06em", borderBottom: "1px solid rgba(239,68,68,0.15)", whiteSpace: "nowrap" as const }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {washSaleWarnings.map((w, i) => (
                      <tr key={i} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                        <td style={{ padding: "8px 12px", fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--red)" }}>{w.ticker}</td>
                        <td style={{ padding: "8px 12px", color: "var(--text-muted)" }}>{w.portfolioName}</td>
                        <td style={{ padding: "8px 12px", color: "var(--text-secondary)", whiteSpace: "nowrap" as const }}>
                          {fmtDate(w.sellDate)}<div style={{ fontSize: "9px", color: "var(--text-muted)" }}>{fmtFull(w.sellPrice)}/sh</div>
                        </td>
                        <td style={{ padding: "8px 12px", color: "var(--text-secondary)", whiteSpace: "nowrap" as const }}>
                          {fmtDate(w.rebuyDate)}<div style={{ fontSize: "9px", color: "var(--text-muted)" }}>{fmtFull(w.rebuyPrice)}/sh</div>
                        </td>
                        <td style={{ padding: "8px 12px", fontFamily: "var(--font-mono)", color: w.daysBetween <= 7 ? "var(--red)" : "#f59e0b" }}>{w.daysBetween}d</td>
                        <td style={{ padding: "8px 12px", fontFamily: "var(--font-mono)", fontWeight: 600, color: "var(--red)" }}>
                          {w.disallowedLoss !== null ? fmt(w.disallowedLoss) : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {disclaimer}
        </div>
      )}

      {/* ── TAX RATES REFERENCE ─────────────────────────────────────────────────── */}
      {tab === "reference" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>

          <div className="bt-card" style={{ padding: "18px 20px" }}>
            <h2 style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)", marginBottom: "14px" }}>2025 Long-Term Capital Gains Rates</h2>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
                <thead>
                  <tr style={{ background: "var(--bg-surface)" }}>
                    {["Rate", "Single Filers", "Married Filing Jointly", "Head of Household"].map(h => (
                      <th key={h} style={{ padding: "8px 12px", textAlign: "left" as const, fontWeight: 600, color: "var(--text-tertiary)", fontSize: "9px", textTransform: "uppercase" as const, letterSpacing: "0.06em", borderBottom: "1px solid var(--border-subtle)" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[
                    ["0%", "$0 – $47,025", "$0 – $94,050", "$0 – $63,000"],
                    ["15%", "$47,026 – $518,900", "$94,051 – $583,750", "$63,001 – $551,350"],
                    ["20%", "Over $518,900", "Over $583,750", "Over $551,350"],
                    ["+ 3.8% NIIT", "Over $200,000", "Over $250,000", "Over $200,000"],
                  ].map(([rate, single, mfj, hoh], i) => (
                    <tr key={i} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                      <td style={{ padding: "8px 12px", fontFamily: "var(--font-mono)", fontWeight: 700, color: rate.includes("NIIT") ? "#f59e0b" : "var(--brand-blue)" }}>{rate}</td>
                      <td style={{ padding: "8px 12px", color: "var(--text-secondary)" }}>{single}</td>
                      <td style={{ padding: "8px 12px", color: "var(--text-secondary)" }}>{mfj}</td>
                      <td style={{ padding: "8px 12px", color: "var(--text-secondary)" }}>{hoh}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bt-card" style={{ padding: "18px 20px" }}>
            <h2 style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)", marginBottom: "14px" }}>2025 Short-Term / Ordinary Income Rates</h2>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
                <thead>
                  <tr style={{ background: "var(--bg-surface)" }}>
                    {["Rate", "Single", "Married Filing Jointly"].map(h => (
                      <th key={h} style={{ padding: "8px 12px", textAlign: "left" as const, fontWeight: 600, color: "var(--text-tertiary)", fontSize: "9px", textTransform: "uppercase" as const, letterSpacing: "0.06em", borderBottom: "1px solid var(--border-subtle)" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[
                    ["10%", "$0 – $11,925", "$0 – $23,850"],
                    ["12%", "$11,926 – $48,475", "$23,851 – $96,950"],
                    ["22%", "$48,476 – $103,350", "$96,951 – $206,700"],
                    ["24%", "$103,351 – $197,300", "$206,701 – $394,600"],
                    ["32%", "$197,301 – $250,525", "$394,601 – $501,050"],
                    ["35%", "$250,526 – $626,350", "$501,051 – $751,600"],
                    ["37%", "Over $626,350", "Over $751,600"],
                  ].map(([rate, single, mfj], i) => (
                    <tr key={i} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                      <td style={{ padding: "8px 12px", fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--brand-blue)" }}>{rate}</td>
                      <td style={{ padding: "8px 12px", color: "var(--text-secondary)" }}>{single}</td>
                      <td style={{ padding: "8px 12px", color: "var(--text-secondary)" }}>{mfj}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bt-card" style={{ padding: "18px 20px" }}>
            <h2 style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)", marginBottom: "14px" }}>Key Rules to Know</h2>
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {[
                { title: "Short-term vs long-term", body: "Stocks held 365 days or fewer are taxed at your ordinary income rate (up to 37%). Hold for 366+ days and you get the lower long-term rate (0%, 15%, or 20%). The difference can be substantial — worth planning around." },
                { title: "$3,000 capital loss deduction", body: "If your losses exceed your gains, up to $3,000 can reduce your regular taxable income this year. Any excess loss carries forward to future years with no expiration." },
                { title: "Wash sale rule", body: "Selling a stock at a loss and buying it back within 30 days triggers the wash sale rule — the IRS disallows the loss deduction. The loss isn't eliminated, it's added to your new shares' cost basis." },
                { title: "Net Investment Income Tax (NIIT)", body: "A 3.8% extra tax applies to investment income if your income exceeds $200k (single) or $250k (married). It stacks on top of your regular capital gains rate." },
                { title: "Qualified dividends", body: "Dividends from US companies held over 60 days qualify for the lower long-term capital gains rate. Unqualified dividends are taxed at your ordinary income rate." },
                { title: "Tax-advantaged accounts", body: "Gains inside a 401(k), IRA, or Roth IRA are not subject to capital gains tax while in the account. Traditional accounts tax withdrawals as ordinary income; Roth withdrawals in retirement are tax-free." },
              ].map(({ title, body }) => (
                <div key={title} style={{ padding: "12px 14px", background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-sm)" }}>
                  <p style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-primary)", margin: "0 0 5px" }}>{title}</p>
                  <p style={{ fontSize: "11px", color: "var(--text-secondary)", lineHeight: 1.6, margin: 0 }}>{body}</p>
                </div>
              ))}
            </div>
          </div>

          {disclaimer}
        </div>
      )}
    </div>
  );
}

// ─── sub-components ────────────────────────────────────────────────────────────

function TermBadge({ term }: { term: "short" | "long" | "unknown" }) {
  const styles = {
    short: { bg: "rgba(239,68,68,0.1)", color: "var(--red)", label: "Short" },
    long: { bg: "rgba(0,211,149,0.1)", color: "var(--green)", label: "Long" },
    unknown: { bg: "var(--bg-elevated)", color: "var(--text-muted)", label: "?" },
  };
  const s = styles[term];
  return (
    <span style={{ fontSize: "9px", fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.07em", padding: "2px 7px", borderRadius: "var(--radius-full)", background: s.bg, color: s.color }}>
      {s.label}
    </span>
  );
}

function EmptyState({ icon, title, sub }: { icon: string; title: string; sub: string }) {
  return (
    <div style={{ textAlign: "center" as const, padding: "32px 20px", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-lg)", background: "var(--bg-elevated)" }}>
      <div style={{ fontSize: "28px", marginBottom: "10px" }}>{icon}</div>
      <div style={{ fontSize: "13px", fontWeight: 500, color: "var(--text-secondary)", marginBottom: "5px" }}>{title}</div>
      <div style={{ fontSize: "11px", color: "var(--text-muted)", maxWidth: "340px", margin: "0 auto", lineHeight: 1.5 }}>{sub}</div>
    </div>
  );
}
