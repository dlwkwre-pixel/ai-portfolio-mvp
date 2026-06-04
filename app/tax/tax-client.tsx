"use client";

import { useState } from "react";
import Link from "next/link";
import type { TaxPageData, RealizedLot, TLHOpportunity, WashSaleWarning } from "./page";
import { estimateTax, FILING_STATUS_LABELS, INCOME_TYPE_LABELS, US_STATES } from "@/lib/tax/estimator";
import type { FilingStatus, IncomeType } from "@/lib/tax/estimator";

// ─── helpers ─────────────────────────────────────────────────────────────────

function fmt(v: number, showSign = false) {
  const abs = `$${Math.abs(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (!showSign) return (v < 0 ? "-" : "") + abs;
  return (v >= 0 ? "+" : "-") + abs;
}

function fmtPct(v: number | null) {
  if (v === null) return "—";
  return `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function glColor(v: number) {
  if (v > 0) return "var(--green)";
  if (v < 0) return "var(--red)";
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
  { id: "overview", label: "Overview" },
  { id: "realized", label: "Realized G/L" },
  { id: "tlh", label: "Tax-Loss Harvesting" },
  { id: "wash", label: "Wash Sales" },
  { id: "ai", label: "AI Strategy" },
  { id: "rates", label: "Rates & Rules" },
] as const;
type TabId = typeof TABS[number]["id"];

// ─── main component ────────────────────────────────────────────────────────

export default function TaxClient({ data }: { data: TaxPageData }) {
  const [tab, setTab] = useState<TabId>("overview");
  const [stcgRate, setStcgRate] = useState(0.22);
  const [ltcgRate, setLtcgRate] = useState(0.15);
  const [niitApplies, setNiitApplies] = useState(false);
  const [aiOutput, setAiOutput] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [realizedFilter, setRealizedFilter] = useState<"all" | "gains" | "losses">("all");

  const { realizedLots, dividendIncome, tlhOpportunities, washSaleWarnings, selectedYear, taxProfile } = data;

  // ── Income tax estimate from planning profile ──
  const incomeTaxEstimate = taxProfile?.grossMonthly
    ? estimateTax(
        taxProfile.grossMonthly,
        (taxProfile.filingStatus as FilingStatus) ?? "single",
        (taxProfile.incomeType as IncomeType) ?? "w2",
        taxProfile.stateCode ?? "",
      )
    : null;

  // Derived filing/marginal rates from profile (used as defaults for cap gains bracket picker)
  const derivedStcgRate = incomeTaxEstimate?.federalMarginalRate ?? 0.22;
  const derivedLtcgRate = incomeTaxEstimate
    ? incomeTaxEstimate.grossAnnual > (taxProfile?.filingStatus === "married_filing_jointly" ? 583_750 : 518_900)
      ? 0.20
      : incomeTaxEstimate.grossAnnual > (taxProfile?.filingStatus === "married_filing_jointly" ? 94_050 : 47_025)
        ? 0.15 : 0.00
    : 0.15;

  // ── aggregates ──
  const stcgLots = realizedLots.filter(l => l.termType === "short");
  const ltcgLots = realizedLots.filter(l => l.termType === "long");
  const unknownLots = realizedLots.filter(l => l.termType === "unknown");

  const stcgNet = stcgLots.reduce((s, l) => s + l.gainLoss, 0);
  const ltcgNet = ltcgLots.reduce((s, l) => s + l.gainLoss, 0);
  const unknownNet = unknownLots.reduce((s, l) => s + l.gainLoss, 0);
  const totalRealizedGain = stcgNet + ltcgNet + unknownNet;
  const totalTLHAvailable = tlhOpportunities.reduce((s, o) => s + (o.unrealizedLoss ?? 0), 0);

  // Capital gains tax (using derived or manual rates)
  const cgStcgRate = incomeTaxEstimate ? derivedStcgRate : stcgRate;
  const cgLtcgRate = incomeTaxEstimate ? derivedLtcgRate : ltcgRate;
  const cgNiit = incomeTaxEstimate
    ? (incomeTaxEstimate.grossAnnual > (taxProfile?.filingStatus === "married_filing_jointly" ? 250_000 : 200_000))
    : niitApplies;

  const estimatedCapGainsTax = Math.max(0, stcgNet) * cgStcgRate
    + Math.max(0, ltcgNet) * (cgLtcgRate + (cgNiit ? 0.038 : 0))
    + dividendIncome * cgLtcgRate;

  // Legacy manual picker tax (for override panel)
  const estimatedTax = Math.max(0, stcgNet) * stcgRate
    + Math.max(0, ltcgNet) * (ltcgRate + (niitApplies ? 0.038 : 0))
    + dividendIncome * ltcgRate;

  const potentialSavings = Math.abs(totalTLHAvailable) * cgStcgRate;

  // ── filtered realized lots ──
  const filteredLots = realizedLots.filter(l =>
    realizedFilter === "all" ? true : realizedFilter === "gains" ? l.gainLoss >= 0 : l.gainLoss < 0
  );

  async function runAiStrategy() {
    setAiLoading(true); setAiError(null); setAiOutput(null);
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
      const res = await fetch("/api/tax/ai-strategy", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) throw new Error(await res.text());
      const json = await res.json();
      setAiOutput(json.analysis);
    } catch (e) {
      setAiError(e instanceof Error ? e.message : "Analysis failed.");
    } finally {
      setAiLoading(false);
    }
  }

  const disclaimer = (
    <div style={{ padding: "8px 12px", borderRadius: "var(--radius-sm)", background: "rgba(245,158,11,0.05)", border: "1px solid rgba(245,158,11,0.15)", fontSize: "10px", color: "var(--text-muted)", lineHeight: 1.5 }}>
      <strong style={{ color: "#f59e0b" }}>Not tax advice.</strong> This is an educational estimate based on your transaction history. Consult a CPA or tax professional before making filing or investment decisions. Data may be incomplete if transactions are missing acquisition dates.
    </div>
  );

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
              transition: "all 0.12s",
            }}
          >
            {y}
          </Link>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: "0", borderBottom: "1px solid var(--border-subtle)", overflowX: "auto" }}>
        {TABS.map(t => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            style={{
              padding: "8px 14px", fontSize: "12px", fontWeight: 500,
              background: "none", border: "none", cursor: "pointer",
              color: tab === t.id ? "var(--text-primary)" : "var(--text-tertiary)",
              borderBottom: `2px solid ${tab === t.id ? "var(--brand-blue)" : "transparent"}`,
              whiteSpace: "nowrap", transition: "color 0.12s",
            }}
          >
            {t.label}
            {t.id === "wash" && washSaleWarnings.length > 0 && (
              <span style={{ marginLeft: "5px", fontSize: "9px", padding: "1px 5px", borderRadius: "var(--radius-full)", background: "rgba(239,68,68,0.15)", color: "var(--red)" }}>
                {washSaleWarnings.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── OVERVIEW TAB ── */}
      {tab === "overview" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>

          {/* ── Income tax setup prompt if no profile ── */}
          {!taxProfile?.grossMonthly && (
            <div style={{ padding: "14px 16px", background: "oklch(0.55 0.15 265 / 0.07)", border: "1px solid oklch(0.55 0.15 265 / 0.22)", borderRadius: "var(--radius-lg)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
              <div>
                <div style={{ fontSize: "12px", fontWeight: 600, color: "oklch(0.72 0.18 265)", marginBottom: "3px" }}>Add income to see your full tax picture</div>
                <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>Set gross income + filing status in your Planning profile to combine W-2 income tax with capital gains tax below.</div>
              </div>
              <Link href="/planning" style={{ fontSize: "11px", fontWeight: 600, color: "oklch(0.72 0.18 265)", textDecoration: "none", whiteSpace: "nowrap", padding: "5px 12px", borderRadius: "var(--radius-full)", border: "1px solid oklch(0.55 0.15 265 / 0.3)", background: "oklch(0.55 0.15 265 / 0.08)" }}>Set up profile →</Link>
            </div>
          )}

          {/* ── Unified Tax Picture (when profile exists) ── */}
          {incomeTaxEstimate && (
            <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-lg)", padding: "18px 20px" }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "16px" }}>
                <div>
                  <div style={{ fontSize: "14px", fontWeight: 700, color: "var(--text-primary)", fontFamily: "var(--font-display)", marginBottom: "2px" }}>Your {selectedYear} Tax Picture</div>
                  <div style={{ fontSize: "11px", color: "var(--text-tertiary)" }}>
                    {INCOME_TYPE_LABELS[(taxProfile!.incomeType as IncomeType) ?? "w2"]} · {FILING_STATUS_LABELS[(taxProfile!.filingStatus as FilingStatus) ?? "single"]}
                    {taxProfile?.stateCode ? ` · ${US_STATES.find(s => s.code === taxProfile.stateCode)?.name ?? taxProfile.stateCode}` : ""}
                  </div>
                </div>
                <div style={{ textAlign: "right" as const }}>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: "22px", fontWeight: 700, color: "var(--red)", lineHeight: 1 }}>{fmt(Math.round(incomeTaxEstimate.totalTax + estimatedCapGainsTax))}</div>
                  <div style={{ fontSize: "9px", color: "var(--text-muted)", marginTop: "3px" }}>total estimated tax</div>
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginBottom: "14px" }}>
                {/* Income tax row */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", background: "var(--bg-elevated)", borderRadius: "var(--radius-md)", border: "1px solid var(--border-subtle)" }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-primary)", fontFamily: "var(--font-body)" }}>Income Tax (Federal + State)</div>
                    <div style={{ fontSize: "10px", color: "var(--text-muted)", marginTop: "2px" }}>
                      {fmt(Math.round(taxProfile!.grossMonthly! * 12))} gross · {Math.round(incomeTaxEstimate.federalEffectiveRate * 100 + incomeTaxEstimate.stateEffectiveRate * 100)}% effective
                      {taxProfile!.incomeType !== "w2" && " · includes SE tax"}
                    </div>
                  </div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: "15px", fontWeight: 700, color: "var(--red)", flexShrink: 0, marginLeft: "12px" }}>{fmt(Math.round(incomeTaxEstimate.totalTax))}</div>
                </div>
                {/* Cap gains row */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", background: "var(--bg-elevated)", borderRadius: "var(--radius-md)", border: "1px solid var(--border-subtle)" }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-primary)", fontFamily: "var(--font-body)" }}>Capital Gains + Dividends ({selectedYear})</div>
                    <div style={{ fontSize: "10px", color: "var(--text-muted)", marginTop: "2px" }}>
                      STCG {Math.round(cgStcgRate * 100)}% · LTCG {Math.round(cgLtcgRate * 100)}%{cgNiit ? " + 3.8% NIIT" : ""}
                    </div>
                  </div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: "15px", fontWeight: 700, color: estimatedCapGainsTax > 0 ? "var(--red)" : "var(--text-muted)", flexShrink: 0, marginLeft: "12px" }}>{fmt(Math.round(estimatedCapGainsTax))}</div>
                </div>
              </div>

              {/* Breakdown grid */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))", gap: "8px" }}>
                <TaxEstCard label="Federal Income Tax" value={incomeTaxEstimate.federalIncomeTax} sub={`${(incomeTaxEstimate.federalEffectiveRate * 100).toFixed(1)}% effective`} />
                <TaxEstCard label={taxProfile!.incomeType === "self_employed" || taxProfile!.incomeType === "mixed" ? "SE Tax" : "FICA (employee)"} value={taxProfile!.incomeType === "self_employed" || taxProfile!.incomeType === "mixed" ? incomeTaxEstimate.seTax : incomeTaxEstimate.ficaTax} sub={taxProfile!.incomeType === "self_employed" ? "15.3% on net SE income" : "SS + Medicare"} />
                <TaxEstCard label={`State Tax${taxProfile?.stateCode ? ` (${taxProfile.stateCode})` : ""}`} value={incomeTaxEstimate.stateTax} sub={`${(incomeTaxEstimate.stateEffectiveRate * 100).toFixed(1)}% effective`} />
                <TaxEstCard label="Cap Gains Tax" value={estimatedCapGainsTax} sub={`${selectedYear} trades & dividends`} />
              </div>

              {/* W-2 withholding note / self-employed quarterly */}
              <div style={{ marginTop: "12px", padding: "10px 12px", background: taxProfile!.incomeType === "w2" ? "rgba(0,211,149,0.04)" : "rgba(245,158,11,0.05)", border: `1px solid ${taxProfile!.incomeType === "w2" ? "rgba(0,211,149,0.15)" : "rgba(245,158,11,0.15)"}`, borderRadius: "var(--radius-md)" }}>
                {taxProfile!.incomeType === "w2" ? (
                  <div style={{ fontSize: "11px", color: "var(--text-secondary)", lineHeight: 1.55 }}>
                    <span style={{ fontWeight: 600, color: "var(--green)" }}>W-2 note:</span> Your employer withholds income tax and FICA automatically. The cap gains tax above may require you to make an estimated payment or withhold extra via Form W-4 if it exceeds $1,000.
                  </div>
                ) : (
                  <div>
                    <div style={{ fontSize: "11px", fontWeight: 600, color: "#f59e0b", marginBottom: "4px" }}>Self-employed quarterly estimate</div>
                    <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
                      <div>
                        <div style={{ fontSize: "9px", color: "var(--text-muted)", marginBottom: "2px" }}>Per quarter (income tax + SE)</div>
                        <div style={{ fontFamily: "var(--font-mono)", fontSize: "14px", fontWeight: 700, color: "#f59e0b" }}>{fmt(Math.round((incomeTaxEstimate.totalTax) / 4))}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: "9px", color: "var(--text-muted)", marginBottom: "2px" }}>Due dates</div>
                        <div style={{ fontSize: "11px", color: "var(--text-secondary)" }}>Apr 15 · Jun 16 · Sep 15 · Jan 15</div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Summary cards */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "10px" }}>
            <SummaryCard
              label="Short-Term Gains (STCG)"
              value={stcgNet}
              sub={`${stcgLots.length} sale${stcgLots.length !== 1 ? "s" : ""} · held ≤1 year`}
              colored
            />
            <SummaryCard
              label="Long-Term Gains (LTCG)"
              value={ltcgNet}
              sub={`${ltcgLots.length} sale${ltcgLots.length !== 1 ? "s" : ""} · held >1 year`}
              colored
            />
            <SummaryCard
              label="Unknown Term"
              value={unknownNet}
              sub={`${unknownLots.length} sale${unknownLots.length !== 1 ? "s" : ""} · no acquisition date`}
              colored
            />
            <SummaryCard
              label="Dividend Income"
              value={dividendIncome}
              sub="Qualified dividends"
              colored={false}
            />
          </div>

          {/* Bracket selector + estimated tax — shown as override when no profile, or as collapsible override when profile exists */}
          {!incomeTaxEstimate && (
          <div className="bt-card" style={{ padding: "18px 20px" }}>
            <div style={{ marginBottom: "14px" }}>
              <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "4px" }}>Estimated Cap Gains Tax — {selectedYear}</div>
              <div style={{ fontSize: "10px", color: "var(--text-muted)" }}>Set your marginal rates to calculate your estimated liability</div>
            </div>
            <div style={{ display: "flex", gap: "16px", flexWrap: "wrap", marginBottom: "16px" }}>
              <div>
                <div style={{ fontSize: "10px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--text-tertiary)", marginBottom: "5px" }}>Ordinary Rate (STCG)</div>
                <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
                  {STCG_BRACKETS.map(b => (
                    <button key={b.label} type="button" onClick={() => setStcgRate(b.rate)}
                      style={{ padding: "3px 9px", borderRadius: "var(--radius-full)", fontSize: "11px", cursor: "pointer", border: "1px solid", background: stcgRate === b.rate ? "var(--brand-blue)" : "var(--bg-elevated)", borderColor: stcgRate === b.rate ? "var(--brand-blue)" : "var(--border)", color: stcgRate === b.rate ? "#fff" : "var(--text-secondary)", fontFamily: "var(--font-mono)" }}>
                      {b.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <div style={{ fontSize: "10px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--text-tertiary)", marginBottom: "5px" }}>LTCG Rate</div>
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
                  <div style={{ width: "14px", height: "14px", borderRadius: "3px", border: `2px solid ${niitApplies ? "var(--brand-blue)" : "var(--border-strong)"}`, background: niitApplies ? "var(--brand-blue)" : "transparent", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
                    onClick={() => setNiitApplies(v => !v)}>
                    {niitApplies && <svg width="8" height="8" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                  </div>
                  3.8% NIIT surtax applies (income &gt;$200k)
                </label>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: "8px" }}>
              <TaxEstCard label="STCG Tax" value={Math.max(0, stcgNet) * stcgRate} sub={`${Math.round(stcgRate * 100)}% on $${Math.max(0, stcgNet).toLocaleString(undefined, { maximumFractionDigits: 0 })}`} />
              <TaxEstCard label="LTCG Tax" value={Math.max(0, ltcgNet) * (ltcgRate + (niitApplies ? 0.038 : 0))} sub={`${Math.round((ltcgRate + (niitApplies ? 0.038 : 0)) * 100)}% on $${Math.max(0, ltcgNet).toLocaleString(undefined, { maximumFractionDigits: 0 })}`} />
              <TaxEstCard label="Dividend Tax" value={dividendIncome * ltcgRate} sub={`${Math.round(ltcgRate * 100)}% on $${dividendIncome.toLocaleString(undefined, { maximumFractionDigits: 0 })}`} />
              <div style={{ padding: "12px 14px", background: "rgba(37,99,235,0.06)", border: "1px solid rgba(37,99,235,0.15)", borderRadius: "var(--radius-md)" }}>
                <div style={{ fontSize: "9px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-tertiary)", marginBottom: "4px" }}>Total Estimated</div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: "18px", fontWeight: 600, color: "var(--brand-blue)" }}>{fmt(estimatedTax)}</div>
                <div style={{ fontSize: "9px", color: "var(--text-muted)", marginTop: "2px" }}>federal only</div>
              </div>
            </div>
          </div>
          )}

          {/* TLH snapshot */}
          {tlhOpportunities.length > 0 && (
            <div style={{ padding: "14px 16px", background: "rgba(0,211,149,0.04)", border: "1px solid rgba(0,211,149,0.15)", borderRadius: "var(--radius-lg)" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "7px" }}>
                  <svg width="13" height="13" viewBox="0 0 20 20" fill="var(--green)"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
                  <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--green)" }}>Tax-Loss Harvesting Available</span>
                </div>
                <button type="button" onClick={() => setTab("tlh")} style={{ fontSize: "10px", color: "var(--brand-blue)", background: "none", border: "none", cursor: "pointer" }}>View all →</button>
              </div>
              <div style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
                <span style={{ fontFamily: "var(--font-mono)", fontWeight: 600, color: "var(--text-primary)" }}>{tlhOpportunities.length} position{tlhOpportunities.length !== 1 ? "s" : ""}</span> with unrealized losses totaling{" "}
                <span style={{ fontFamily: "var(--font-mono)", color: "var(--red)", fontWeight: 600 }}>{fmt(totalTLHAvailable)}</span>.{" "}
                Potential tax savings at your bracket:{" "}
                <span style={{ fontFamily: "var(--font-mono)", color: "var(--green)", fontWeight: 600 }}>{fmt(potentialSavings)}</span>
              </div>
            </div>
          )}

          {washSaleWarnings.length > 0 && (
            <div style={{ padding: "12px 16px", background: "rgba(239,68,68,0.04)", border: "1px solid rgba(239,68,68,0.18)", borderRadius: "var(--radius-lg)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <svg width="13" height="13" viewBox="0 0 20 20" fill="var(--red)"><path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
                <span style={{ fontSize: "12px", color: "var(--red)", fontWeight: 500 }}>
                  {washSaleWarnings.length} potential wash sale rule violation{washSaleWarnings.length !== 1 ? "s" : ""} detected
                </span>
              </div>
              <button type="button" onClick={() => setTab("wash")} style={{ fontSize: "10px", color: "var(--red)", background: "none", border: "none", cursor: "pointer", whiteSpace: "nowrap" }}>Review →</button>
            </div>
          )}

          {disclaimer}
        </div>
      )}

      {/* ── REALIZED G/L TAB ── */}
      {tab === "realized" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
            <span style={{ fontSize: "11px", color: "var(--text-tertiary)" }}>Filter:</span>
            {(["all", "gains", "losses"] as const).map(f => (
              <button key={f} type="button" onClick={() => setRealizedFilter(f)}
                style={{ padding: "3px 10px", borderRadius: "var(--radius-full)", fontSize: "11px", cursor: "pointer", border: "1px solid", background: realizedFilter === f ? "var(--brand-blue)" : "var(--bg-elevated)", borderColor: realizedFilter === f ? "var(--brand-blue)" : "var(--border)", color: realizedFilter === f ? "#fff" : "var(--text-secondary)" }}>
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
            <span style={{ marginLeft: "auto", fontSize: "10px", color: "var(--text-muted)" }}>
              {filteredLots.length} transaction{filteredLots.length !== 1 ? "s" : ""}
            </span>
          </div>

          {filteredLots.length === 0 ? (
            <EmptyState icon="📊" title={`No ${realizedFilter === "all" ? "realized" : realizedFilter} transactions in ${selectedYear}`} sub="Add sell transactions with acquisition dates to see your tax lot breakdown." />
          ) : (
            <div style={{ overflowX: "auto", borderRadius: "var(--radius-md)", border: "1px solid var(--border-subtle)" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11px" }}>
                <thead>
                  <tr style={{ background: "var(--bg-surface)" }}>
                    {["Ticker", "Portfolio", "Sold", "Acquired", "Held", "Term", "Shares", "Cost Basis", "Proceeds", "Gain / Loss"].map(h => (
                      <th key={h} style={{ padding: "8px 12px", textAlign: "left", fontWeight: 600, color: "var(--text-tertiary)", fontSize: "9px", textTransform: "uppercase", letterSpacing: "0.06em", borderBottom: "1px solid var(--border-subtle)", whiteSpace: "nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredLots.map((lot, i) => (
                    <tr key={lot.id} style={{ borderBottom: "1px solid var(--border-subtle)", background: i % 2 === 0 ? "transparent" : "var(--bg-elevated)" }}>
                      <td style={{ padding: "8px 12px", fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--text-primary)" }}>{lot.ticker}</td>
                      <td style={{ padding: "8px 12px", color: "var(--text-muted)", maxWidth: "120px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{lot.portfolioName}</td>
                      <td style={{ padding: "8px 12px", color: "var(--text-secondary)", whiteSpace: "nowrap" }}>{fmtDate(lot.soldAt)}</td>
                      <td style={{ padding: "8px 12px", color: lot.acquiredAt ? "var(--text-secondary)" : "var(--text-muted)", whiteSpace: "nowrap" }}>{lot.acquiredAt ? fmtDate(lot.acquiredAt) : "—"}</td>
                      <td style={{ padding: "8px 12px", fontFamily: "var(--font-mono)", color: "var(--text-muted)" }}>{lot.holdingDays !== null ? `${lot.holdingDays}d` : "—"}</td>
                      <td style={{ padding: "8px 12px" }}>
                        <TermBadge term={lot.termType} />
                      </td>
                      <td style={{ padding: "8px 12px", fontFamily: "var(--font-mono)", color: "var(--text-secondary)" }}>{lot.quantity.toLocaleString(undefined, { maximumFractionDigits: 4 })}</td>
                      <td style={{ padding: "8px 12px", fontFamily: "var(--font-mono)", color: "var(--text-secondary)" }}>{fmt(lot.costBasis)}</td>
                      <td style={{ padding: "8px 12px", fontFamily: "var(--font-mono)", color: "var(--text-secondary)" }}>{fmt(lot.proceeds)}</td>
                      <td style={{ padding: "8px 12px", fontFamily: "var(--font-mono)", fontWeight: 600, color: glColor(lot.gainLoss), whiteSpace: "nowrap" }}>
                        {fmt(lot.gainLoss, true)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ background: "var(--bg-surface)", borderTop: "2px solid var(--border)" }}>
                    <td colSpan={8} style={{ padding: "8px 12px", fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--text-tertiary)" }}>Total</td>
                    <td style={{ padding: "8px 12px", fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--text-primary)" }}>{fmt(filteredLots.reduce((s, l) => s + l.proceeds, 0))}</td>
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
              <strong style={{ color: "#f59e0b" }}>{unknownLots.length} sale{unknownLots.length !== 1 ? "s" : ""} missing acquisition date.</strong> Add the "Date Acquired" when recording sell transactions to enable STCG/LTCG classification. These are listed as "Unknown" and may be taxed at ordinary rates.
            </div>
          )}

          {disclaimer}
        </div>
      )}

      {/* ── TLH TAB ── */}
      {tab === "tlh" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
          <div className="bt-card" style={{ padding: "16px 18px" }}>
            <h2 style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)", marginBottom: "6px" }}>What is Tax-Loss Harvesting?</h2>
            <p style={{ fontSize: "12px", color: "var(--text-secondary)", lineHeight: 1.65 }}>
              Tax-loss harvesting (TLH) means selling positions at a loss to offset capital gains — reducing your tax liability. You can then reinvest in a similar (but not "substantially identical") security to maintain your market exposure. The IRS wash sale rule prohibits repurchasing the same security within 30 days before or after the sale.
            </p>
          </div>

          {tlhOpportunities.length === 0 ? (
            <EmptyState icon="✅" title="No unrealized losses right now" sub="All your current holdings are above cost basis. Check back after market movements." />
          ) : (
            <>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--red)" }}>{tlhOpportunities.length} position{tlhOpportunities.length !== 1 ? "s" : ""}</span> with total unrealized losses of{" "}
                  <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--red)" }}>{fmt(totalTLHAvailable)}</span>
                </div>
                <div style={{ fontSize: "10px", color: "var(--text-muted)" }}>Potential savings at {Math.round(stcgRate * 100)}%: <span style={{ color: "var(--green)", fontFamily: "var(--font-mono)", fontWeight: 600 }}>{fmt(potentialSavings)}</span></div>
              </div>

              <div style={{ overflowX: "auto", borderRadius: "var(--radius-md)", border: "1px solid var(--border-subtle)" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11px" }}>
                  <thead>
                    <tr style={{ background: "var(--bg-surface)" }}>
                      {["Ticker", "Portfolio", "Shares", "Cost Basis", "Current Value", "Unrealized Loss", "Loss %", "Potential Saving"].map(h => (
                        <th key={h} style={{ padding: "8px 12px", textAlign: "left", fontWeight: 600, color: "var(--text-tertiary)", fontSize: "9px", textTransform: "uppercase", letterSpacing: "0.06em", borderBottom: "1px solid var(--border-subtle)", whiteSpace: "nowrap" }}>{h}</th>
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
                        <td style={{ padding: "8px 12px", color: "var(--text-muted)", maxWidth: "110px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{opp.portfolioName}</td>
                        <td style={{ padding: "8px 12px", fontFamily: "var(--font-mono)", color: "var(--text-secondary)" }}>{opp.shares.toLocaleString(undefined, { maximumFractionDigits: 4 })}</td>
                        <td style={{ padding: "8px 12px", fontFamily: "var(--font-mono)", color: "var(--text-secondary)" }}>{fmt(opp.costBasis)}</td>
                        <td style={{ padding: "8px 12px", fontFamily: "var(--font-mono)", color: "var(--text-secondary)" }}>{opp.currentValue !== null ? fmt(opp.currentValue) : "—"}</td>
                        <td style={{ padding: "8px 12px", fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--red)" }}>{opp.unrealizedLoss !== null ? fmt(opp.unrealizedLoss) : "—"}</td>
                        <td style={{ padding: "8px 12px", fontFamily: "var(--font-mono)", color: "var(--red)" }}>{fmtPct(opp.unrealizedLossPct)}</td>
                        <td style={{ padding: "8px 12px", fontFamily: "var(--font-mono)", fontWeight: 600, color: "var(--green)" }}>
                          {opp.unrealizedLoss !== null ? fmt(Math.abs(opp.unrealizedLoss) * stcgRate) : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div style={{ padding: "14px 16px", background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: "var(--radius-md)" }}>
                <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-primary)", marginBottom: "8px" }}>TLH Process Checklist</div>
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  {[
                    "Sell the position at a loss to realize the tax deduction",
                    "Wait 31+ days before buying back the same security (to avoid wash sale rule)",
                    "While waiting, buy a similar-but-not-identical security (e.g. sell VTI → buy ITOT or SCHB)",
                    "Up to $3,000 of net capital losses can offset ordinary income per year",
                    "Excess losses carry forward to future tax years indefinitely",
                  ].map((step, i) => (
                    <div key={i} style={{ display: "flex", gap: "10px", alignItems: "flex-start" }}>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: "10px", color: "var(--brand-blue)", flexShrink: 0, marginTop: "1px" }}>{i + 1}.</span>
                      <span style={{ fontSize: "11px", color: "var(--text-secondary)", lineHeight: 1.5 }}>{step}</span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
          {disclaimer}
        </div>
      )}

      {/* ── WASH SALE TAB ── */}
      {tab === "wash" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
          <div className="bt-card" style={{ padding: "16px 18px" }}>
            <h2 style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)", marginBottom: "6px" }}>Wash Sale Rule</h2>
            <p style={{ fontSize: "12px", color: "var(--text-secondary)", lineHeight: 1.65 }}>
              IRS Revenue Code §1091 disallows a loss deduction if you sell a security at a loss and buy a "substantially identical" security within 30 days before or after the sale. The disallowed loss is added to the cost basis of the replacement shares (deferred, not eliminated). BuyTune detects sell + buy pairs of the exact same ticker within 30 days as a warning.
            </p>
          </div>

          {washSaleWarnings.length === 0 ? (
            <EmptyState icon="✅" title="No wash sale violations detected" sub="No buy/sell pairs of the same ticker found within 30 days. Keep monitoring as you make trades." />
          ) : (
            <div style={{ overflowX: "auto", borderRadius: "var(--radius-md)", border: "1px solid rgba(239,68,68,0.2)" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11px" }}>
                <thead>
                  <tr style={{ background: "rgba(239,68,68,0.06)" }}>
                    {["Ticker", "Portfolio", "Sold", "Rebought", "Days Between", "Disallowed Loss"].map(h => (
                      <th key={h} style={{ padding: "8px 12px", textAlign: "left", fontWeight: 600, color: "var(--text-tertiary)", fontSize: "9px", textTransform: "uppercase", letterSpacing: "0.06em", borderBottom: "1px solid rgba(239,68,68,0.15)", whiteSpace: "nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {washSaleWarnings.map((w, i) => (
                    <tr key={i} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                      <td style={{ padding: "8px 12px", fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--red)" }}>{w.ticker}</td>
                      <td style={{ padding: "8px 12px", color: "var(--text-muted)" }}>{w.portfolioName}</td>
                      <td style={{ padding: "8px 12px", color: "var(--text-secondary)", whiteSpace: "nowrap" }}>
                        {fmtDate(w.sellDate)}<div style={{ fontSize: "9px", color: "var(--text-muted)" }}>{fmt(w.sellPrice)}/sh</div>
                      </td>
                      <td style={{ padding: "8px 12px", color: "var(--text-secondary)", whiteSpace: "nowrap" }}>
                        {fmtDate(w.rebuyDate)}<div style={{ fontSize: "9px", color: "var(--text-muted)" }}>{fmt(w.rebuyPrice)}/sh</div>
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

          <div style={{ padding: "14px 16px", background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: "var(--radius-md)" }}>
            <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-primary)", marginBottom: "8px" }}>What counts as substantially identical?</div>
            <div style={{ display: "flex", flexDirection: "column", gap: "5px", fontSize: "11px", color: "var(--text-secondary)", lineHeight: 1.5 }}>
              <div>✗ Same stock: Sell AAPL → Buy AAPL within 30 days → Wash sale</div>
              <div>✓ Different stock: Sell AAPL → Buy MSFT → Not a wash sale</div>
              <div>✓ Different ETF: Sell VTI → Buy ITOT (similar but not identical) → Generally OK</div>
              <div>✗ Options: Sell SPY stock → Buy SPY calls → May trigger wash sale</div>
              <div style={{ marginTop: "4px", fontSize: "10px", color: "var(--text-muted)" }}>When in doubt, consult a tax professional. BuyTune only detects exact ticker matches — it cannot evaluate substantially identical securities.</div>
            </div>
          </div>
          {disclaimer}
        </div>
      )}

      {/* ── AI STRATEGY TAB ── */}
      {tab === "ai" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
          <div className="bt-card" style={{ padding: "18px 20px" }}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "12px", marginBottom: "14px" }}>
              <div>
                <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)", marginBottom: "4px" }}>AI Tax Strategy</div>
                <div style={{ fontSize: "11px", color: "var(--text-tertiary)" }}>
                  Analyzes your {selectedYear} gains, losses, and opportunities. Powered by Gemini.
                </div>
              </div>
              <button
                type="button"
                onClick={runAiStrategy}
                disabled={aiLoading}
                style={{ padding: "8px 16px", borderRadius: "var(--radius-md)", border: "none", background: "var(--brand-blue)", color: "#fff", fontSize: "12px", fontWeight: 600, cursor: aiLoading ? "not-allowed" : "pointer", opacity: aiLoading ? 0.7 : 1, flexShrink: 0, fontFamily: "var(--font-body)" }}
              >
                {aiLoading ? "Analyzing..." : aiOutput ? "Re-run Analysis" : "Run Analysis"}
              </button>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: "8px", marginBottom: "14px", padding: "12px 14px", background: "var(--bg-surface)", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-subtle)" }}>
              <MiniStat label="STCG" value={fmt(stcgNet, true)} color={glColor(stcgNet)} />
              <MiniStat label="LTCG" value={fmt(ltcgNet, true)} color={glColor(ltcgNet)} />
              <MiniStat label="Dividends" value={fmt(dividendIncome)} color="var(--text-primary)" />
              <MiniStat label="TLH Available" value={fmt(totalTLHAvailable)} color={totalTLHAvailable < 0 ? "var(--green)" : "var(--text-muted)"} />
              <MiniStat label="Wash Sales" value={`${washSaleWarnings.length}`} color={washSaleWarnings.length > 0 ? "var(--red)" : "var(--text-muted)"} />
            </div>

            {aiError && (
              <div style={{ padding: "10px 12px", borderRadius: "var(--radius-sm)", background: "rgba(239,68,68,0.07)", border: "1px solid rgba(239,68,68,0.18)", fontSize: "12px", color: "var(--red)", marginBottom: "12px" }}>
                {aiError}
              </div>
            )}

            {aiOutput ? (
              <div style={{ fontSize: "13px", color: "var(--text-secondary)", lineHeight: 1.75, whiteSpace: "pre-wrap" }}>
                {aiOutput}
              </div>
            ) : !aiLoading && (
              <div style={{ textAlign: "center", padding: "24px 0", color: "var(--text-muted)", fontSize: "12px" }}>
                Click "Run Analysis" to get personalized tax strategy suggestions for {selectedYear}.
              </div>
            )}
            {aiLoading && (
              <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "16px 0", color: "var(--text-muted)", fontSize: "12px" }}>
                <svg style={{ animation: "spin 1s linear infinite" }} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" /></svg>
                Analyzing your tax situation...
              </div>
            )}
          </div>
          {disclaimer}
        </div>
      )}

      {/* ── RATES REFERENCE TAB ── */}
      {tab === "rates" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>

          <div className="bt-card" style={{ padding: "18px 20px" }}>
            <h2 style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)", marginBottom: "14px" }}>2025 Long-Term Capital Gains Rates</h2>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
                <thead>
                  <tr style={{ background: "var(--bg-surface)" }}>
                    {["Rate", "Single Filers", "Married Filing Jointly", "Head of Household"].map(h => (
                      <th key={h} style={{ padding: "8px 12px", textAlign: "left", fontWeight: 600, color: "var(--text-tertiary)", fontSize: "9px", textTransform: "uppercase", letterSpacing: "0.06em", borderBottom: "1px solid var(--border-subtle)" }}>{h}</th>
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
            <h2 style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)", marginBottom: "14px" }}>2025 Short-Term Capital Gains (Ordinary Income) Rates</h2>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
                <thead>
                  <tr style={{ background: "var(--bg-surface)" }}>
                    {["Rate", "Single", "Married Filing Jointly"].map(h => (
                      <th key={h} style={{ padding: "8px 12px", textAlign: "left", fontWeight: 600, color: "var(--text-tertiary)", fontSize: "9px", textTransform: "uppercase", letterSpacing: "0.06em", borderBottom: "1px solid var(--border-subtle)" }}>{h}</th>
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
            <h2 style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)", marginBottom: "14px" }}>Key Tax Rules for Investors</h2>
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              {[
                { title: "Short-Term vs Long-Term", body: "Assets held ≤365 days are short-term (taxed as ordinary income). Assets held ≥366 days are long-term (taxed at preferential LTCG rates). The holding period begins the day after purchase and ends on the sale date." },
                { title: "$3,000 Capital Loss Deduction", body: "Net capital losses exceeding capital gains can offset up to $3,000 of ordinary income per year. Excess losses carry forward to future years with no expiration." },
                { title: "Wash Sale Rule (§1091)", body: "Losses are disallowed if you buy a 'substantially identical' security 30 days before or after a sale. The disallowed loss adds to your replacement security's cost basis — it's deferred, not eliminated." },
                { title: "Net Investment Income Tax (NIIT)", body: "A 3.8% surtax applies to investment income (capital gains, dividends, interest) for single filers earning over $200k or joint filers over $250k. This stacks on top of LTCG rates." },
                { title: "Qualified Dividends", body: "Dividends from US corporations held >60 days qualify for LTCG rates (0%/15%/20%) rather than ordinary income rates. Unqualified dividends are taxed as ordinary income." },
                { title: "401(k) / IRA Tax Shelter", body: "Gains in tax-advantaged accounts (Traditional IRA, Roth IRA, 401k) are not subject to capital gains tax. Traditional accounts tax withdrawals as ordinary income; Roth withdrawals are tax-free in retirement." },
                { title: "Specific ID / FIFO / LIFO", body: "When you sell a portion of a position, you can choose which lots are sold. Specific identification lets you choose the highest-cost lots first to minimize gains. Without election, brokers often default to FIFO (first in, first out)." },
              ].map(({ title, body }) => (
                <div key={title} style={{ padding: "12px 14px", background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-sm)" }}>
                  <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-primary)", marginBottom: "5px" }}>{title}</div>
                  <div style={{ fontSize: "11px", color: "var(--text-secondary)", lineHeight: 1.6 }}>{body}</div>
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

// ─── small sub-components ──────────────────────────────────────────────────

function SummaryCard({ label, value, sub, colored }: { label: string; value: number; sub: string; colored: boolean }) {
  return (
    <div className="bt-card" style={{ padding: "14px 16px" }}>
      <div style={{ fontSize: "10px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--text-tertiary)", marginBottom: "6px" }}>{label}</div>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: "18px", fontWeight: 600, color: colored ? (value > 0 ? "var(--red)" : value < 0 ? "var(--green)" : "var(--text-primary)") : "var(--text-primary)" }}>
        {fmt(value, value !== 0)}
      </div>
      <div style={{ fontSize: "10px", color: "var(--text-muted)", marginTop: "3px" }}>{sub}</div>
    </div>
  );
}

function TaxEstCard({ label, value, sub }: { label: string; value: number; sub: string }) {
  return (
    <div style={{ padding: "10px 12px", background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-md)" }}>
      <div style={{ fontSize: "9px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-tertiary)", marginBottom: "4px" }}>{label}</div>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: "15px", fontWeight: 600, color: "var(--text-primary)" }}>{fmt(value)}</div>
      <div style={{ fontSize: "9px", color: "var(--text-muted)", marginTop: "2px" }}>{sub}</div>
    </div>
  );
}

function TermBadge({ term }: { term: "short" | "long" | "unknown" }) {
  const styles = {
    short: { bg: "rgba(239,68,68,0.1)", color: "var(--red)", label: "Short" },
    long: { bg: "rgba(0,211,149,0.1)", color: "var(--green)", label: "Long" },
    unknown: { bg: "var(--bg-elevated)", color: "var(--text-muted)", label: "?" },
  };
  const s = styles[term];
  return (
    <span style={{ fontSize: "9px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", padding: "2px 7px", borderRadius: "var(--radius-full)", background: s.bg, color: s.color }}>
      {s.label}
    </span>
  );
}

function MiniStat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div>
      <div style={{ fontSize: "9px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--text-tertiary)", marginBottom: "3px" }}>{label}</div>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: "13px", fontWeight: 600, color }}>{value}</div>
    </div>
  );
}

function EmptyState({ icon, title, sub }: { icon: string; title: string; sub: string }) {
  return (
    <div style={{ textAlign: "center", padding: "32px 20px", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-lg)", background: "var(--bg-elevated)" }}>
      <div style={{ fontSize: "28px", marginBottom: "10px" }}>{icon}</div>
      <div style={{ fontSize: "13px", fontWeight: 500, color: "var(--text-secondary)", marginBottom: "5px" }}>{title}</div>
      <div style={{ fontSize: "11px", color: "var(--text-muted)", maxWidth: "340px", margin: "0 auto", lineHeight: 1.5 }}>{sub}</div>
    </div>
  );
}
