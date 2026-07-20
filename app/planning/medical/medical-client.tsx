"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import AddToPlanButton from "@/app/planning/add-to-plan-button";
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
    <InfoTooltip text={text} align="start" width={235}>
      <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: "14px", height: "14px", borderRadius: "50%", marginLeft: "5px", cursor: "help", background: "rgba(63,174,74,0.12)", border: "1px solid rgba(63,174,74,0.3)", color: "var(--accent, #5fbf9a)", fontSize: "10px", fontWeight: 700 }}>?</span>
    </InfoTooltip>
  );
}

export default function MedicalClient({ monthlyIncome, hsaBalance }: { monthlyIncome: number; hsaBalance: number }) {
  const [oopMax, setOopMax] = useState(9000);
  const [estimatedBills, setEstimatedBills] = useState(60000);
  const [hsa, setHsa] = useState(hsaBalance);
  const [weeksOff, setWeeksOff] = useState(8);
  const [coveragePct, setCoveragePct] = useState(0);
  const [income, setIncome] = useState(monthlyIncome || 6000);
  const [emergencyFund, setEmergencyFund] = useState(0);

  const calc = useMemo(() => {
    const yourMedical = Math.min(Math.max(0, estimatedBills), Math.max(0, oopMax));
    const hsaOffset = Math.min(hsa, yourMedical);
    const netMedical = Math.max(0, yourMedical - hsaOffset);
    const weeklyIncome = (income * 12) / 52;
    const incomeLost = weeksOff * weeklyIncome * (1 - coveragePct / 100);
    const totalImpact = netMedical + incomeLost;
    const cushionMonths = income > 0 ? totalImpact / income : 0;
    const covered = Math.min(emergencyFund, totalImpact);
    const coveredPct = totalImpact > 0 ? (covered / totalImpact) * 100 : 100;
    const uncovered = Math.max(0, totalImpact - emergencyFund);
    return { yourMedical, hsaOffset, netMedical, incomeLost, totalImpact, cushionMonths, coveredPct, uncovered };
  }, [oopMax, estimatedBills, hsa, weeksOff, coveragePct, income, emergencyFund]);

  // Readiness checks
  const efCoversOop = emergencyFund >= oopMax && oopMax > 0;
  const hsaFunded = hsa >= oopMax * 0.5 && oopMax > 0;
  const incomeProtected = coveragePct >= 60 || weeksOff === 0;
  const readyCount = [efCoversOop, hsaFunded, incomeProtected].filter(Boolean).length;
  const readyColor = readyCount >= 3 ? "var(--green)" : readyCount === 2 ? "var(--amber, #f59e0b)" : "var(--red)";
  const readyLabel = readyCount >= 3 ? "Well protected" : readyCount === 2 ? "Partly protected" : "Exposed";

  const medPct = calc.totalImpact > 0 ? (calc.netMedical / calc.totalImpact) * 100 : 0;

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", color: "var(--text-primary)", fontFamily: "var(--font-body)" }}>
      <div style={{ padding: "12px 24px", borderBottom: "1px solid var(--border-subtle)", background: "var(--bg-base)", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "3px" }}>
          <Link href="/planning?tab=events" style={{ display: "flex", alignItems: "center", gap: "5px", fontSize: "12px", color: "var(--text-muted)", textDecoration: "none" }}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M10 3L5 8l5 5" strokeLinecap="round" strokeLinejoin="round" /></svg>
            Planning
          </Link>
          <span style={{ color: "var(--border)" }}>/</span>
          <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)" }}>Major Medical</span>
        </div>
        <div style={{ display: "flex", alignItems: "baseline", gap: "10px" }}>
          <span style={{ fontSize: "16px", fontWeight: 700 }}>Major Medical Planner</span>
          <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>What a serious health event would really cost — and whether you&apos;re ready</span>
        </div>
      </div>

      <div className="bt-page-content" style={{ flex: 1, overflowY: "auto", padding: "20px 24px 80px", display: "flex", flexDirection: "column", gap: "16px", maxWidth: "1000px", width: "100%", margin: "0 auto" }}>

        {/* Verdict hero */}
        <div style={{ ...cardStyle, background: `linear-gradient(135deg, color-mix(in srgb, ${readyColor} 8%, var(--bg-card)), var(--bg-card))`, border: `1px solid color-mix(in srgb, ${readyColor} 28%, transparent)` }}>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
            <div>
              <div style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: readyColor }}>{readyLabel} · {readyCount}/3 safeguards</div>
              <div style={{ fontSize: "28px", fontWeight: 800, fontFamily: "var(--font-display)", letterSpacing: "-1px", color: "var(--text-primary)", lineHeight: 1.1, marginTop: "2px" }}>
                {fmt(Math.round(calc.totalImpact))}<span style={{ fontSize: "14px", color: "var(--text-tertiary)", fontWeight: 600 }}> total hit</span>
              </div>
              <div style={{ fontSize: "11px", color: "var(--text-tertiary)", marginTop: "2px" }}>{calc.cushionMonths.toFixed(1)} months of income</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: "10px", color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Not covered by savings</div>
              <div style={{ fontSize: "22px", fontWeight: 800, fontFamily: "var(--font-mono)", color: calc.uncovered > 0 ? "var(--red)" : "var(--green)" }}>{fmt(Math.round(calc.uncovered))}</div>
              <div style={{ fontSize: "10px", color: "var(--text-tertiary)" }}>emergency fund covers {Math.round(calc.coveredPct)}%</div>
            </div>
          </div>
        </div>

        {/* Inputs */}
        <div style={cardStyle}>
          <span style={sectionTitle}>The scenario</span>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "14px" }}>
            <div><label style={labelStyle}>Plan out-of-pocket max<HintDot text="For in-network care, this caps what you pay in a year no matter how large the bills. On your insurance card / summary of benefits." /></label><input style={inputStyle} type="number" min="0" value={oopMax || ""} onChange={(e) => setOopMax(Number(e.target.value) || 0)} /></div>
            <div><label style={labelStyle}>Estimated total bills</label><input style={inputStyle} type="number" min="0" value={estimatedBills || ""} onChange={(e) => setEstimatedBills(Number(e.target.value) || 0)} /></div>
            <div><label style={labelStyle}>HSA / FSA balance<HintDot text="Triple tax-advantaged and built for exactly this — pays medical costs with pre-tax dollars." /></label><input style={inputStyle} type="number" min="0" value={hsa || ""} onChange={(e) => setHsa(Number(e.target.value) || 0)} /></div>
            <div><label style={labelStyle}>Emergency fund<HintDot text="Liquid cash you could tap for this. Ideally it covers at least your out-of-pocket max." /></label><input style={inputStyle} type="number" min="0" value={emergencyFund || ""} onChange={(e) => setEmergencyFund(Number(e.target.value) || 0)} /></div>
            <div><label style={labelStyle}>Weeks unable to work</label><input style={inputStyle} type="number" min="0" value={weeksOff || ""} onChange={(e) => setWeeksOff(Number(e.target.value) || 0)} /></div>
            <div><label style={labelStyle}>Income covered in leave (%)<HintDot text="Short-term disability + PTO. Employer group STD often replaces ~60% and is taxable — check your benefits." /></label><input style={inputStyle} type="number" min="0" max="100" value={coveragePct || ""} onChange={(e) => setCoveragePct(Number(e.target.value) || 0)} placeholder="STD / PTO" /></div>
            <div><label style={labelStyle}>Monthly income</label><input style={inputStyle} type="number" min="0" value={income || ""} onChange={(e) => setIncome(Number(e.target.value) || 0)} /></div>
          </div>
          <p style={{ fontSize: "11px", color: "var(--text-tertiary)", marginTop: "10px", lineHeight: 1.5 }}>For in-network care your out-of-pocket max caps the bill — the bigger risk for most people is the income lost while recovering, not the medical bill itself.</p>
        </div>

        {/* Exposure breakdown */}
        <div style={cardStyle}>
          <span style={sectionTitle}>Where the hit comes from</span>
          <div style={{ display: "flex", height: "16px", borderRadius: "8px", overflow: "hidden", background: "rgba(148,163,184,0.12)", marginBottom: "12px" }}>
            {calc.netMedical > 0 && <div style={{ width: `${medPct}%`, background: "oklch(0.65 0.18 25)" }} title={`Medical ${fmt(calc.netMedical)}`} />}
            {calc.incomeLost > 0 && <div style={{ width: `${100 - medPct}%`, background: "oklch(0.72 0.18 55)" }} title={`Lost income ${fmt(calc.incomeLost)}`} />}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "12px" }}>
            {([
              ["Medical (capped at OOP max)", calc.yourMedical, "oklch(0.65 0.18 25)", ""],
              ["Less HSA / FSA", -calc.hsaOffset, "var(--green)", ""],
              ["Lost income while recovering", calc.incomeLost, "oklch(0.72 0.18 55)", `${weeksOff} wks${coveragePct > 0 ? `, ${coveragePct}% covered` : ""}`],
            ] as [string, number, string, string][]).filter(([, v]) => v !== 0).map(([label, v, c, sub]) => (
              <div key={label} style={{ display: "flex", justifyContent: "space-between", gap: "10px", color: "var(--text-secondary)" }}>
                <span style={{ display: "flex", alignItems: "center", gap: "7px" }}><span style={{ width: "8px", height: "8px", borderRadius: "2px", background: v < 0 ? "var(--green)" : c, flexShrink: 0 }} />{label}{sub && <span style={{ color: "var(--text-muted)" }}> · {sub}</span>}</span>
                <span style={{ fontFamily: "var(--font-mono)", color: v < 0 ? "var(--green)" : "var(--text-primary)" }}>{v < 0 ? "−" : ""}{fmt(Math.abs(Math.round(v)))}</span>
              </div>
            ))}
            <div style={{ display: "flex", justifyContent: "space-between", gap: "10px", borderTop: "1px solid var(--border-subtle)", paddingTop: "6px", marginTop: "2px", fontWeight: 700 }}>
              <span>Total exposure</span>
              <span style={{ fontFamily: "var(--font-mono)" }}>{fmt(Math.round(calc.totalImpact))}</span>
            </div>
          </div>
        </div>

        {/* Readiness scorecard */}
        <div style={cardStyle}>
          <span style={sectionTitle}>Your safeguards<HintDot text="Three levers shrink a medical shock: cash to cover the out-of-pocket max, an HSA to pay it pre-tax, and income protection for a long recovery." /></span>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <ReadyRow ok={efCoversOop} title="Emergency fund covers your OOP max" detail={efCoversOop ? `${fmt(emergencyFund)} on hand vs ${fmt(oopMax)} max` : `${fmt(Math.max(0, oopMax - emergencyFund))} short of your ${fmt(oopMax)} out-of-pocket max`} />
            <ReadyRow ok={hsaFunded} title="HSA / FSA meaningfully funded" detail={hsaFunded ? `${fmt(hsa)} set aside pre-tax` : "Building an HSA lets you pay these costs with pre-tax dollars"} />
            <ReadyRow ok={incomeProtected} title="Income protected during recovery" detail={incomeProtected ? (weeksOff === 0 ? "No time off modeled" : `${coveragePct}% of income covered while out`) : `Only ${coveragePct}% covered — a long leave would cost ${fmt(Math.round(calc.incomeLost))}. Check disability coverage.`} />
          </div>
          <div style={{ marginTop: "12px", padding: "10px 12px", borderRadius: "10px", background: calc.uncovered > 0 ? "rgba(245,158,11,0.08)" : "rgba(34,197,94,0.08)", border: `1px solid ${calc.uncovered > 0 ? "rgba(245,158,11,0.18)" : "rgba(34,197,94,0.18)"}`, fontSize: "12px", color: "var(--text-secondary)", lineHeight: 1.55 }}>
            {calc.uncovered > 0
              ? `A shock like this would leave ${fmt(Math.round(calc.uncovered))} you can't cover from savings today. ${calc.incomeLost > calc.netMedical ? "The lost income is the bigger threat here — disability insurance is the fix." : "Growing your emergency fund to cover the OOP max closes most of the gap."}`
              : `Your savings could absorb a shock like this without derailing the plan. The remaining lever is income protection for a long recovery.`}
          </div>
        </div>

        {/* Add to plan */}
        {calc.totalImpact > 0 && (
          <div style={cardStyle}>
            <span style={sectionTitle}>Stress-test your plan</span>
            <AddToPlanButton
              label="Major medical event"
              category="other"
              amountImpact={-Math.round(calc.totalImpact)}
              note={`Drops a ${fmt(Math.round(calc.totalImpact))} shock into a future year to see whether your plan absorbs it. A planning stress test, not a prediction.`}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function ReadyRow({ ok, title, detail }: { ok: boolean; title: string; detail: string }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: "10px", padding: "9px 11px", borderRadius: "8px", background: ok ? "rgba(34,197,94,0.05)" : "rgba(239,68,68,0.05)", border: `1px solid ${ok ? "rgba(34,197,94,0.16)" : "rgba(239,68,68,0.16)"}` }}>
      <span style={{ flexShrink: 0, marginTop: "1px", color: ok ? "var(--green)" : "var(--red)" }}>
        {ok
          ? <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
          : <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>}
      </span>
      <div>
        <div style={{ fontSize: "12.5px", fontWeight: 600, color: "var(--text-primary)" }}>{title}</div>
        <div style={{ fontSize: "11.5px", color: "var(--text-tertiary)", lineHeight: 1.45, marginTop: "1px" }}>{detail}</div>
      </div>
    </div>
  );
}
