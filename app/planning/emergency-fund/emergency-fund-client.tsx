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
    <InfoTooltip text={text} align="start" width={230}>
      <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: "14px", height: "14px", borderRadius: "50%", marginLeft: "5px", cursor: "help", background: "rgba(99,102,241,0.12)", border: "1px solid rgba(99,102,241,0.3)", color: "var(--accent, #818cf8)", fontSize: "10px", fontWeight: 700 }}>?</span>
    </InfoTooltip>
  );
}

const STABILITY: { key: string; label: string; months: number; note: string }[] = [
  { key: "stable", label: "Very stable (dual income, secure job)", months: 3, note: "Two incomes or a hard-to-lose role — 3 months is a solid floor." },
  { key: "normal", label: "Typical single income", months: 6, note: "The standard target for most people: 6 months of essentials." },
  { key: "variable", label: "Variable / self-employed / 1 income + kids", months: 9, note: "Irregular income or sole earner with dependents — lean toward 9–12 months." },
];

const TIERS = [3, 6, 9, 12];

export default function EmergencyFundClient({ monthlyExpenses, liquidAssets }: { monthlyExpenses: number; liquidAssets: number }) {
  const [essentials, setEssentials] = useState(monthlyExpenses || 3500);
  const [current, setCurrent] = useState(liquidAssets || 0);
  const [stabilityKey, setStabilityKey] = useState("normal");
  const [monthly, setMonthly] = useState(0);
  const [apy, setApy] = useState(4.5);
  const [cardApr, setCardApr] = useState(24);

  const stability = STABILITY.find((s) => s.key === stabilityKey) ?? STABILITY[1];

  const calc = useMemo(() => {
    const target = essentials * stability.months;
    const gap = Math.max(0, target - current);
    const monthsCovered = essentials > 0 ? current / essentials : 0;
    const pct = target > 0 ? Math.min(100, (current / target) * 100) : 0;
    const monthsToFull = gap > 0 && monthly > 0 ? Math.ceil(gap / monthly) : gap <= 0 ? 0 : null;
    // Months to reach each tier from current.
    const tierETA = TIERS.map((t) => {
      const tTarget = essentials * t;
      if (current >= tTarget) return { months: t, eta: 0, funded: true };
      const need = tTarget - current;
      return { months: t, eta: monthly > 0 ? Math.ceil(need / monthly) : null, funded: false };
    });
    const interestAtTarget = target * (apy / 100);
    // Cost of a shock with no fund: one month of essentials financed on a card, paid over 18 months.
    const shock = essentials; // a typical month-sized shock
    const rm = cardApr / 100 / 12, nMonths = 18;
    const cardPayment = rm > 0 ? (shock * rm * Math.pow(1 + rm, nMonths)) / (Math.pow(1 + rm, nMonths) - 1) : shock / nMonths;
    const cardInterest = cardPayment * nMonths - shock;
    return { target, gap, monthsCovered, pct, monthsToFull, tierETA, interestAtTarget, cardInterest, shock };
  }, [essentials, current, stability.months, monthly, apy, cardApr]);

  const status = calc.gap <= 0 ? "funded" : calc.monthsCovered >= 1 ? "building" : "thin";
  const statusColor = status === "funded" ? "var(--green)" : status === "building" ? "var(--amber, #f59e0b)" : "var(--red)";
  const statusLabel = status === "funded" ? "Fully funded" : status === "building" ? "Building" : "Thin cushion";

  // Tier ladder marker position (0–12 months scale).
  const markerPct = Math.min(100, (calc.monthsCovered / 12) * 100);

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", color: "var(--text-primary)", fontFamily: "var(--font-body)" }}>
      <div style={{ padding: "12px 24px", borderBottom: "1px solid var(--border-subtle)", background: "var(--bg-base)", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "3px" }}>
          <Link href="/planning?tab=events" style={{ display: "flex", alignItems: "center", gap: "5px", fontSize: "12px", color: "var(--text-muted)", textDecoration: "none" }}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M10 3L5 8l5 5" strokeLinecap="round" strokeLinejoin="round" /></svg>
            Planning
          </Link>
          <span style={{ color: "var(--border)" }}>/</span>
          <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)" }}>Emergency Fund</span>
        </div>
        <div style={{ display: "flex", alignItems: "baseline", gap: "10px" }}>
          <span style={{ fontSize: "16px", fontWeight: 700 }}>Emergency Fund Planner</span>
          <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>The cushion that keeps a shock from derailing the plan</span>
        </div>
      </div>

      <div className="bt-page-content" style={{ flex: 1, overflowY: "auto", padding: "20px 24px 80px", display: "flex", flexDirection: "column", gap: "16px", maxWidth: "1000px", width: "100%", margin: "0 auto" }}>

        {/* Verdict hero */}
        <div style={{ ...cardStyle, background: `linear-gradient(135deg, color-mix(in srgb, ${statusColor} 8%, var(--bg-card)), var(--bg-card))`, border: `1px solid color-mix(in srgb, ${statusColor} 26%, transparent)` }}>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
            <div>
              <div style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: statusColor }}>{statusLabel}</div>
              <div style={{ fontSize: "28px", fontWeight: 800, fontFamily: "var(--font-display)", letterSpacing: "-1px", color: "var(--text-primary)", lineHeight: 1.1, marginTop: "2px" }}>
                {calc.monthsCovered.toFixed(1)}<span style={{ fontSize: "14px", color: "var(--text-tertiary)", fontWeight: 600 }}> months covered</span>
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: "10px", color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Target ({stability.months} mo)</div>
              <div style={{ fontSize: "22px", fontWeight: 800, fontFamily: "var(--font-mono)", color: "var(--text-primary)" }}>{fmt(calc.target)}</div>
              <div style={{ fontSize: "10px", color: calc.gap > 0 ? "var(--amber, #f59e0b)" : "var(--green)" }}>{calc.gap > 0 ? `${fmt(calc.gap)} to go` : "reached"}</div>
            </div>
          </div>
          {/* Tier ladder */}
          <div style={{ marginTop: "16px", position: "relative", height: "10px", borderRadius: "5px", background: "rgba(148,163,184,0.14)" }}>
            <div style={{ position: "absolute", inset: 0, width: `${markerPct}%`, background: statusColor, borderRadius: "5px", transition: "width 0.6s cubic-bezier(0.16,1,0.3,1)" }} />
            {TIERS.map((t) => (
              <div key={t} style={{ position: "absolute", left: `${(t / 12) * 100}%`, top: "-3px", bottom: "-3px", width: "1.5px", background: "rgba(255,255,255,0.3)" }} />
            ))}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: "5px" }}>
            {TIERS.map((t) => (
              <span key={t} style={{ fontSize: "10px", fontFamily: "var(--font-mono)", color: calc.monthsCovered >= t ? statusColor : "var(--text-muted)" }}>{t}mo</span>
            ))}
          </div>
        </div>

        {/* Inputs */}
        <div style={cardStyle}>
          <span style={sectionTitle}>Your numbers</span>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "14px" }}>
            <div><label style={labelStyle}>Essential expenses / mo<HintDot text="Housing, food, utilities, insurance, minimum debt payments — not your full budget. Discretionary spending stops in a real emergency." /></label><input style={inputStyle} type="number" min="0" value={essentials || ""} onChange={(e) => setEssentials(Number(e.target.value) || 0)} /></div>
            <div><label style={labelStyle}>Cash saved now</label><input style={inputStyle} type="number" min="0" value={current || ""} onChange={(e) => setCurrent(Number(e.target.value) || 0)} /></div>
            <div><label style={labelStyle}>Saving / month</label><input style={inputStyle} type="number" min="0" value={monthly || ""} onChange={(e) => setMonthly(Number(e.target.value) || 0)} placeholder="0" /></div>
            <div><label style={labelStyle}>HYSA yield (APY %)<HintDot text="A high-yield savings or money-market account keeps the fund liquid but still earning. Typical online HYSA: 4-5%." /></label><input style={inputStyle} type="number" min="0" step="0.1" value={apy || ""} onChange={(e) => setApy(Number(e.target.value) || 0)} /></div>
          </div>
          <div style={{ marginTop: "14px" }}>
            <label style={labelStyle}>Your situation</label>
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              {STABILITY.map((s) => (
                <button key={s.key} type="button" onClick={() => setStabilityKey(s.key)}
                  style={{ textAlign: "left", padding: "9px 12px", borderRadius: "8px", cursor: "pointer", fontSize: "12px", fontFamily: "var(--font-body)",
                    border: `1px solid ${stabilityKey === s.key ? "var(--brand-blue, #2563eb)" : "var(--border-subtle)"}`,
                    background: stabilityKey === s.key ? "rgba(37,99,235,0.1)" : "var(--bg-base)",
                    color: stabilityKey === s.key ? "var(--text-primary)" : "var(--text-secondary)" }}>
                  <strong>{s.months} months</strong> — {s.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Funding plan */}
        <div style={cardStyle}>
          <span style={sectionTitle}>Funding plan</span>
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            {calc.tierETA.map((t) => (
              <div key={t.months} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "8px 11px", borderRadius: "8px", background: t.funded ? "rgba(34,197,94,0.06)" : "var(--bg-base)", border: `1px solid ${t.funded ? "rgba(34,197,94,0.18)" : "var(--border-subtle)"}` }}>
                <span style={{ width: "7px", height: "7px", borderRadius: "50%", background: t.funded ? "var(--green)" : "var(--text-muted)", flexShrink: 0 }} />
                <span style={{ fontSize: "12.5px", color: "var(--text-secondary)", flex: 1 }}>{t.months}-month fund · {fmt(essentials * t.months)}</span>
                <span style={{ fontSize: "12.5px", fontFamily: "var(--font-mono)", fontWeight: 600, color: t.funded ? "var(--green)" : t.eta != null ? "var(--text-primary)" : "var(--text-muted)" }}>
                  {t.funded ? "Funded ✓" : t.eta != null ? `${t.eta} mo away` : "set a monthly amount"}
                </span>
              </div>
            ))}
          </div>
          {calc.monthsToFull != null && calc.monthsToFull > 0 && (
            <p style={{ fontSize: "12px", color: "var(--text-secondary)", marginTop: "12px", lineHeight: 1.5 }}>
              At {fmt(monthly)}/mo you hit your {stability.months}-month target in <strong style={{ color: "var(--text-primary)" }}>{calc.monthsToFull} month{calc.monthsToFull === 1 ? "" : "s"}</strong>. Park it in a HYSA at {apy}% and it earns ~<strong style={{ color: "var(--green)" }}>{fmt(Math.round(calc.interestAtTarget))}/yr</strong> while it sits there.
            </p>
          )}
        </div>

        {/* Why it matters: cost of a shock without a fund */}
        <div style={cardStyle}>
          <span style={sectionTitle}>What a shock costs without it<HintDot text="Without a fund, a surprise expense goes on a credit card. This shows the interest you'd pay financing one month of essentials at your card's APR over 18 months — money the fund makes free." /></span>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "14px", alignItems: "flex-end", marginBottom: "12px" }}>
            <div style={{ flex: "0 1 160px" }}><label style={labelStyle}>Credit card APR (%)</label><input style={inputStyle} type="number" min="0" step="0.5" value={cardApr || ""} onChange={(e) => setCardApr(Number(e.target.value) || 0)} /></div>
          </div>
          <div style={{ padding: "10px 12px", borderRadius: "10px", background: "rgba(239,68,68,0.07)", border: "1px solid rgba(239,68,68,0.18)", fontSize: "12px", color: "var(--text-secondary)", lineHeight: 1.55 }}>
            A {fmt(Math.round(calc.shock))} surprise (one month of essentials) financed on a {cardApr}% card over 18 months costs <strong style={{ color: "var(--red)" }}>{fmt(Math.round(calc.cardInterest))}</strong> in interest. With a funded cushion that&apos;s {fmt(0)} — the fund quietly pays for itself the first time life happens.
          </div>
        </div>

        <p style={{ fontSize: "11px", color: "var(--text-tertiary)", margin: 0, lineHeight: 1.5 }}>Keep it liquid and separate from spending. {stability.note} Once you&apos;re past your target, extra cash is better invested than sitting idle.</p>
      </div>
    </div>
  );
}
