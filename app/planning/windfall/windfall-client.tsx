"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import AddToPlanButton from "@/app/planning/add-to-plan-button";

function fmt(n: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

type Allocation = {
  key: string;
  label: string;
  amount: number;
  color: string;
  rationale: string;
};

const inputStyle: React.CSSProperties = { width: "100%", padding: "9px 11px", borderRadius: "8px", border: "1px solid var(--border-subtle)", background: "var(--bg-base)", color: "var(--text-primary)", fontSize: "14px", fontFamily: "var(--font-body)", outline: "none", boxSizing: "border-box" };
const labelStyle: React.CSSProperties = { display: "block", fontSize: "10px", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--text-tertiary)", marginBottom: "6px" };
const cardStyle: React.CSSProperties = { background: "var(--bg-card)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-lg, 14px)", padding: "16px 18px" };

// Tax treatment by windfall source. Bonuses and RSU vests are ordinary income (federal
// supplemental withholding ~22% + FICA ~7.65% ≈ 30% rough effective). A tax refund is
// already your after-tax money; inheritances and gifts are not taxable income to the
// recipient (federally). "Other" is treated as already-net unless you say otherwise.
const SOURCES: { name: string; taxRate: number; note: string }[] = [
  { name: "Bonus", taxRate: 0.30, note: "Taxed as supplemental wages — withholding plus FICA." },
  { name: "RSU / stock vest", taxRate: 0.30, note: "Taxed as ordinary income at vesting; withholding often underestimates." },
  { name: "Tax refund", taxRate: 0, note: "Already your after-tax money — no further tax." },
  { name: "Inheritance", taxRate: 0, note: "Not taxable income to you federally. Inherited investments get a stepped-up basis." },
  { name: "Gift", taxRate: 0, note: "Not taxable to the recipient." },
  { name: "Other", taxRate: 0, note: "Assumed already after-tax — adjust if it's pre-tax income." },
];

export default function WindfallClient({
  monthlyExpenses, highInterestDebt, liquidAssets,
}: {
  monthlyExpenses: number; highInterestDebt: number; liquidAssets: number;
}) {
  const [amount, setAmount] = useState<number>(10000);
  const [sourceName, setSourceName] = useState<string>("Bonus");
  const [isGross, setIsGross] = useState<boolean>(true);
  const [emergencyTargetMonths, setEmergencyTargetMonths] = useState<number>(6);
  const [unmatchedMatch, setUnmatchedMatch] = useState<number>(0);

  const source = SOURCES.find((s) => s.name === sourceName) ?? SOURCES[0];
  const taxRate = source.taxRate;
  // Net amount actually available to allocate.
  const estTax = taxRate > 0 && isGross ? Math.round(Math.max(0, amount) * taxRate) : 0;
  const net = Math.max(0, Math.max(0, amount) - estTax);

  const rec = useMemo<Allocation[]>(() => {
    let remaining = net;
    const out: Allocation[] = [];

    // 1. Emergency starter — get to 1 month of expenses if below
    const starterGap = Math.max(0, monthlyExpenses - liquidAssets);
    if (starterGap > 0 && remaining > 0) {
      const a = Math.min(remaining, starterGap);
      out.push({ key: "starter", label: "Emergency starter", amount: a, color: "oklch(0.78 0.16 70)", rationale: "Get to one month of expenses in cash before anything else." });
      remaining -= a;
    }

    // 2. Capture employer match — an instant ~100% return beats everything
    if (unmatchedMatch > 0 && remaining > 0) {
      const a = Math.min(remaining, unmatchedMatch);
      out.push({ key: "match", label: "Capture employer 401(k) match", amount: a, color: "oklch(0.72 0.19 145)", rationale: "An employer match is an instant ~100% return — the best return available. Reserve this to raise your 401(k) contributions; the windfall backfills the dip in your take-home pay." });
      remaining -= a;
    }

    // 3. High-interest debt
    if (highInterestDebt > 0 && remaining > 0) {
      const a = Math.min(remaining, highInterestDebt);
      out.push({ key: "debt", label: "High-interest debt", amount: a, color: "oklch(0.70 0.19 25)", rationale: "Paying off ~20% APR debt is a guaranteed, tax-free return no investment can match." });
      remaining -= a;
    }

    // 4. Emergency fund to target
    const targetCash = monthlyExpenses * emergencyTargetMonths;
    const afterStarter = liquidAssets + (out.find((o) => o.key === "starter")?.amount ?? 0);
    const efGap = Math.max(0, targetCash - afterStarter);
    if (efGap > 0 && remaining > 0) {
      const a = Math.min(remaining, efGap);
      out.push({ key: "ef", label: `Emergency fund (${emergencyTargetMonths} mo)`, amount: a, color: "oklch(0.72 0.15 200)", rationale: `Brings your cash cushion to ${emergencyTargetMonths} months of expenses so a shock won't force you to sell investments.` });
      remaining -= a;
    }

    // 5. Invest the rest
    if (remaining > 0) {
      out.push({ key: "invest", label: "Invest", amount: remaining, color: "oklch(0.65 0.18 260)", rationale: "With the match captured, debt handled, and a cushion in place, the rest compounds best in the market." });
    }

    return out;
  }, [net, monthlyExpenses, highInterestDebt, liquidAssets, emergencyTargetMonths, unmatchedMatch]);

  const total = rec.reduce((s, r) => s + r.amount, 0);
  const showTax = taxRate > 0;

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", color: "var(--text-primary)", fontFamily: "var(--font-body)" }}>
      {/* Header */}
      <div style={{ padding: "12px 24px", borderBottom: "1px solid var(--border-subtle)", background: "var(--bg-base)", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "3px" }}>
          <Link href="/planning?tab=events" style={{ display: "flex", alignItems: "center", gap: "5px", fontSize: "12px", color: "var(--text-muted)", textDecoration: "none" }}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M10 3L5 8l5 5" strokeLinecap="round" strokeLinejoin="round" /></svg>
            Planning
          </Link>
          <span style={{ color: "var(--border)" }}>/</span>
          <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)" }}>Windfall</span>
        </div>
        <div style={{ display: "flex", alignItems: "baseline", gap: "10px" }}>
          <span style={{ fontSize: "16px", fontWeight: 700 }}>Windfall Planner</span>
          <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>Put a lump sum to work the smart way</span>
        </div>
      </div>

      {/* Body */}
      <div className="bt-page-content" style={{ flex: 1, overflowY: "auto", padding: "20px 24px 80px", display: "flex", flexDirection: "column", gap: "16px", maxWidth: "1000px", width: "100%", margin: "0 auto" }}>

        {/* Verdict hero */}
        {net > 0 && rec.length > 0 && (() => {
          const top = [...rec].sort((a, b) => b.amount - a.amount)[0];
          return (
            <div style={{ ...cardStyle, background: "linear-gradient(135deg, rgba(37,99,235,0.08), var(--bg-card))", border: "1px solid rgba(37,99,235,0.28)" }}>
              <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
                <div>
                  <div style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--brand-blue, #2563eb)" }}>{fmt(net)} to put to work</div>
                  <div style={{ fontSize: "26px", fontWeight: 800, fontFamily: "var(--font-display)", letterSpacing: "-1px", color: "var(--text-primary)", lineHeight: 1.1, marginTop: "2px" }}>
                    First move: {top.label}
                  </div>
                  <div style={{ fontSize: "11px", color: "var(--text-tertiary)", marginTop: "2px" }}>{fmt(top.amount)} ({total > 0 ? Math.round((top.amount / total) * 100) : 0}%) — {rec.length} step plan below</div>
                </div>
                {showTax && isGross && (
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: "10px", color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em" }}>After ~{fmt(estTax)} tax</div>
                    <div style={{ fontSize: "22px", fontWeight: 800, fontFamily: "var(--font-mono)", color: "var(--text-primary)" }}>{fmt(net)}</div>
                    <div style={{ fontSize: "10px", color: "var(--text-tertiary)" }}>of {fmt(amount)} gross</div>
                  </div>
                )}
              </div>
            </div>
          );
        })()}

        {/* Inputs */}
        <div style={cardStyle}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "16px" }}>
            <div style={{ flex: "1 1 160px" }}>
              <label style={labelStyle}>Windfall amount</label>
              <input style={inputStyle} type="number" min="0" value={amount || ""} onChange={(e) => setAmount(Number(e.target.value))} placeholder="10000" />
            </div>
            <div style={{ flex: "1 1 160px" }}>
              <label style={labelStyle}>Source</label>
              <select style={inputStyle} value={sourceName} onChange={(e) => setSourceName(e.target.value)}>
                {SOURCES.map((s) => <option key={s.name} value={s.name}>{s.name}</option>)}
              </select>
            </div>
            <div style={{ flex: "0 1 150px" }}>
              <label style={labelStyle}>Emergency target</label>
              <select style={inputStyle} value={emergencyTargetMonths} onChange={(e) => setEmergencyTargetMonths(Number(e.target.value))}>
                {[3, 4, 5, 6, 9, 12].map((m) => <option key={m} value={m}>{m} months</option>)}
              </select>
            </div>
          </div>

          {/* Tax treatment for this source */}
          <div style={{ marginTop: "14px", display: "flex", flexWrap: "wrap", alignItems: "center", gap: "12px" }}>
            {showTax ? (
              <>
                <label style={{ display: "inline-flex", alignItems: "center", gap: "7px", fontSize: "12px", color: "var(--text-secondary)", cursor: "pointer" }}>
                  <input type="checkbox" checked={isGross} onChange={(e) => setIsGross(e.target.checked)} style={{ accentColor: "var(--brand-blue)", width: "15px", height: "15px" }} />
                  Amount is pre-tax (gross)
                </label>
                {isGross && (
                  <span style={{ fontSize: "12px", color: "var(--text-tertiary)" }}>
                    ≈ <strong style={{ color: "var(--text-secondary)", fontFamily: "var(--font-mono)" }}>{fmt(net)}</strong> after ~{fmt(estTax)} estimated tax
                  </span>
                )}
              </>
            ) : (
              <span style={{ fontSize: "11px", color: "var(--text-tertiary)" }}>{source.note}</span>
            )}
          </div>

          <div style={{ borderTop: "1px solid var(--border-subtle)", marginTop: "14px", paddingTop: "14px" }}>
            <label style={labelStyle}>Employer 401(k) match you{"'"}re not capturing ($/yr)</label>
            <input style={{ ...inputStyle, maxWidth: "200px" }} type="number" min="0" value={unmatchedMatch || ""} onChange={(e) => setUnmatchedMatch(Math.max(0, Number(e.target.value) || 0))} placeholder="0" />
            <div style={{ fontSize: "10px", color: "var(--text-muted)", marginTop: "5px", lineHeight: 1.5 }}>If you aren&apos;t getting your full employer match, enter the annual amount you&apos;re leaving behind. It jumps to the top of the waterfall — free money beats everything.</div>
          </div>

          <div style={{ display: "flex", gap: "18px", flexWrap: "wrap", marginTop: "14px", fontSize: "11px", color: "var(--text-tertiary)" }}>
            <span>Monthly expenses: <strong style={{ color: "var(--text-secondary)" }}>{fmt(monthlyExpenses)}</strong></span>
            <span>High-interest debt: <strong style={{ color: "var(--text-secondary)" }}>{fmt(highInterestDebt)}</strong></span>
            <span>Liquid cash: <strong style={{ color: "var(--text-secondary)" }}>{fmt(liquidAssets)}</strong></span>
          </div>
        </div>

        {net > 0 && (
          <>
            {/* Stacked allocation bar */}
            <div style={cardStyle}>
              <span style={{ fontFamily: "var(--font-display)", fontSize: "13px", fontWeight: 700, display: "block", marginBottom: "12px" }}>
                Recommended split for {fmt(net)}{showTax && isGross ? " (after tax)" : ""}
              </span>
              <div style={{ display: "flex", height: "12px", borderRadius: "6px", overflow: "hidden", background: "var(--bg-elevated, rgba(255,255,255,0.06))", marginBottom: "16px" }}>
                {rec.map((r) => (
                  <div key={r.key} style={{ width: `${total > 0 ? (r.amount / total) * 100 : 0}%`, background: r.color }} title={`${r.label}: ${fmt(r.amount)}`} />
                ))}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                {rec.map((r) => (
                  <div key={r.key} style={{ display: "flex", gap: "12px", alignItems: "flex-start" }}>
                    <span style={{ width: "10px", height: "10px", borderRadius: "3px", background: r.color, flexShrink: 0, marginTop: "3px" }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: "10px", alignItems: "baseline" }}>
                        <span style={{ fontSize: "13px", fontWeight: 600 }}>{r.label}</span>
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: "14px", fontWeight: 700 }}>{fmt(r.amount)}</span>
                      </div>
                      <div style={{ fontSize: "11px", color: "var(--text-tertiary)", lineHeight: 1.5, marginTop: "2px" }}>
                        {r.rationale} <span style={{ color: "var(--text-muted)" }}>· {total > 0 ? Math.round((r.amount / total) * 100) : 0}%</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Growth of the invested slice */}
            {(() => {
              const invest = rec.find((r) => r.key === "invest")?.amount ?? 0;
              if (invest < 100) return null;
              const rate = 0.07;
              const fv10 = invest * Math.pow(1 + rate, 10);
              const fv20 = invest * Math.pow(1 + rate, 20);
              return (
                <div style={cardStyle}>
                  <span style={{ fontFamily: "var(--font-display)", fontSize: "13px", fontWeight: 700, display: "block", marginBottom: "12px" }}>What the invested slice becomes</span>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "12px" }}>
                    <div><div style={{ fontSize: "10px", color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "4px" }}>Invested now</div><div style={{ fontSize: "18px", fontWeight: 700, fontFamily: "var(--font-mono)", color: "var(--text-primary)" }}>{fmt(Math.round(invest))}</div></div>
                    <div><div style={{ fontSize: "10px", color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "4px" }}>In 10 years</div><div style={{ fontSize: "18px", fontWeight: 700, fontFamily: "var(--font-mono)", color: "var(--green)" }}>{fmt(Math.round(fv10))}</div></div>
                    <div><div style={{ fontSize: "10px", color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "4px" }}>In 20 years</div><div style={{ fontSize: "18px", fontWeight: 700, fontFamily: "var(--font-mono)", color: "var(--green)" }}>{fmt(Math.round(fv20))}</div></div>
                  </div>
                  <p style={{ fontSize: "10px", color: "var(--text-tertiary)", marginTop: "10px", lineHeight: 1.5 }}>Assumes ~7%/yr. The real cost of spending a windfall instead of investing it isn&apos;t {fmt(Math.round(invest))} — it&apos;s the {fmt(Math.round(fv20))} it could have become.</p>
                </div>
              );
            })()}

            {/* Add to plan — only meaningful for an expected FUTURE windfall */}
            <div style={cardStyle}>
              <span style={{ fontFamily: "var(--font-display)", fontSize: "13px", fontWeight: 700, display: "block", marginBottom: "10px" }}>Expecting this in the future?</span>
              <AddToPlanButton
                label={`${sourceName} windfall`}
                category="windfall"
                amountImpact={net}
                note="Adds the after-tax amount as a future inflow so your forecast reflects it. Skip if you already have the cash."
              />
            </div>

            {/* Note */}
            <p style={{ fontSize: "11px", color: "var(--text-tertiary)", lineHeight: 1.6, margin: 0 }}>
              The waterfall captures any free employer match first (an instant return), then a one-month cash starter, high-interest debt (a guaranteed return), your full emergency fund, and finally investing. {showTax && "Tax estimates are rough planning figures, not tax advice — your actual withholding and bracket may differ."}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
