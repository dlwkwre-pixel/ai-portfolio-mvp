"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import AddToPlanButton from "@/app/planning/add-to-plan-button";

function fmt(n: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

const inputStyle: React.CSSProperties = { width: "100%", padding: "9px 11px", borderRadius: "8px", border: "1px solid var(--border-subtle)", background: "var(--bg-base)", color: "var(--text-primary)", fontSize: "14px", fontFamily: "var(--font-body)", outline: "none", boxSizing: "border-box" };
const labelStyle: React.CSSProperties = { display: "block", fontSize: "10px", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--text-tertiary)", marginBottom: "6px" };
const cardStyle: React.CSSProperties = { background: "var(--bg-card)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-lg, 14px)", padding: "16px 18px" };

const PRESETS = ["Vacation", "New car (down payment)", "Home renovation", "New roof / big repair", "Holidays / gifts", "Wedding", "Down payment"];

function monthsUntil(dateStr: string): number | null {
  if (!dateStr) return null;
  const target = new Date(dateStr + "T00:00:00");
  const now = new Date();
  return Math.max(0, (target.getFullYear() - now.getFullYear()) * 12 + (target.getMonth() - now.getMonth()));
}

export default function SavingsGoalClient({ liquidAssets }: { liquidAssets: number }) {
  const [name, setName] = useState<string>("Vacation");
  const [target, setTarget] = useState<number>(8000);
  const [date, setDate] = useState<string>("");
  const [saved, setSaved] = useState<number>(0);
  const [monthly, setMonthly] = useState<number>(0);
  const [apr, setApr] = useState<number>(0); // % return on the savings (0 for short-term cash)

  const months = monthsUntil(date);

  const calc = useMemo(() => {
    const remaining = Math.max(0, target - saved);
    const r = apr / 100 / 12;
    // Required monthly to hit target by the date (future value of a savings stream + current saved).
    let requiredMonthly: number | null = null;
    if (months && months > 0) {
      const grownSaved = r > 0 ? saved * Math.pow(1 + r, months) : saved;
      const need = Math.max(0, target - grownSaved);
      requiredMonthly = r > 0 ? need * r / (Math.pow(1 + r, months) - 1) : need / months;
    }
    // Projected with the current monthly contribution.
    let projected = saved;
    if (months != null) {
      projected = r > 0 ? saved * Math.pow(1 + r, months) + monthly * ((Math.pow(1 + r, months) - 1) / r) : saved + monthly * months;
    }
    // If no date: how long at the current monthly to reach target.
    let monthsToReach: number | null = null;
    if (!months && monthly > 0 && remaining > 0) {
      if (r > 0) {
        monthsToReach = Math.ceil(Math.log((target * r / monthly) + (1 + (saved * r / monthly))) / Math.log(1 + r));
      } else {
        monthsToReach = Math.ceil(remaining / monthly);
      }
      if (!isFinite(monthsToReach) || monthsToReach < 0) monthsToReach = null;
    }
    const onTrack = requiredMonthly != null ? monthly >= requiredMonthly - 0.5 : null;
    return { remaining, requiredMonthly, projected, monthsToReach, onTrack };
  }, [target, saved, date, monthly, apr, months]);

  const targetYear = date ? new Date(date + "T00:00:00").getFullYear() : undefined;

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", color: "var(--text-primary)", fontFamily: "var(--font-body)" }}>
      <div style={{ padding: "12px 24px", borderBottom: "1px solid var(--border-subtle)", background: "var(--bg-base)", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "3px" }}>
          <Link href="/planning?tab=events" style={{ display: "flex", alignItems: "center", gap: "5px", fontSize: "12px", color: "var(--text-muted)", textDecoration: "none" }}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M10 3L5 8l5 5" strokeLinecap="round" strokeLinejoin="round" /></svg>
            Planning
          </Link>
          <span style={{ color: "var(--border)" }}>/</span>
          <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)" }}>Savings Goal</span>
        </div>
        <div style={{ display: "flex", alignItems: "baseline", gap: "10px" }}>
          <span style={{ fontSize: "16px", fontWeight: 700 }}>Savings Goal Planner</span>
          <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>A sinking fund for any big purchase — hit the number by the date</span>
        </div>
      </div>

      <div className="bt-page-content" style={{ flex: 1, overflowY: "auto", padding: "20px 24px 80px", display: "flex", flexDirection: "column", gap: "16px", maxWidth: "1000px", width: "100%", margin: "0 auto" }}>

        {/* Verdict hero */}
        {(() => {
          const pctFunded = target > 0 ? Math.min(100, (saved / target) * 100) : 0;
          const heroColor = calc.onTrack == null ? "var(--brand-blue, #2563eb)" : calc.onTrack ? "var(--green)" : "var(--amber, #f59e0b)";
          const heroLabel = calc.onTrack == null ? (calc.monthsToReach != null ? `Ready in ${calc.monthsToReach} months` : "Set a date or monthly amount") : calc.onTrack ? "On track" : "Behind pace";
          return (
            <div style={{ ...cardStyle, background: `linear-gradient(135deg, color-mix(in srgb, ${heroColor} 8%, var(--bg-card)), var(--bg-card))`, border: `1px solid color-mix(in srgb, ${heroColor} 28%, transparent)` }}>
              <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
                <div>
                  <div style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: heroColor }}>{heroLabel}</div>
                  <div style={{ fontSize: "26px", fontWeight: 800, fontFamily: "var(--font-display)", letterSpacing: "-1px", color: "var(--text-primary)", lineHeight: 1.1, marginTop: "2px" }}>
                    {fmt(saved)}<span style={{ fontSize: "14px", color: "var(--text-tertiary)", fontWeight: 600 }}> of {fmt(target)}</span>
                  </div>
                  <div style={{ fontSize: "11px", color: "var(--text-tertiary)", marginTop: "2px" }}>{name || "Goal"}{months != null ? ` · ${months} mo to go` : ""}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: "10px", color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Funded</div>
                  <div style={{ fontSize: "22px", fontWeight: 800, fontFamily: "var(--font-mono)", color: "var(--text-primary)" }}>{Math.round(pctFunded)}%</div>
                  <div style={{ fontSize: "10px", color: "var(--text-tertiary)" }}>{fmt(Math.round(calc.remaining))} to go</div>
                </div>
              </div>
              <div style={{ position: "relative", height: "7px", borderRadius: "3.5px", background: "var(--surface-006)", marginTop: "14px", overflow: "hidden" }}>
                <div style={{ position: "absolute", inset: 0, width: `${pctFunded}%`, background: heroColor, borderRadius: "3.5px", transition: "width 0.6s cubic-bezier(0.16,1,0.3,1)" }} />
              </div>
            </div>
          );
        })()}

        {/* Inputs */}
        <div style={cardStyle}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "14px" }}>
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={labelStyle}>What are you saving for?</label>
              <input style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Italy trip" />
              <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginTop: "8px" }}>
                {PRESETS.map((p) => (
                  <button key={p} type="button" onClick={() => setName(p)} style={{ fontSize: "10px", padding: "4px 9px", borderRadius: "20px", border: "1px solid var(--border-subtle)", background: name === p ? "rgba(37,99,235,0.12)" : "var(--bg-base)", color: name === p ? "var(--brand-blue, #2563eb)" : "var(--text-tertiary)", cursor: "pointer", fontFamily: "var(--font-body)" }}>{p}</button>
                ))}
              </div>
            </div>
            <div><label style={labelStyle}>Target amount</label><input style={inputStyle} type="number" min="0" value={target || ""} onChange={(e) => setTarget(Number(e.target.value) || 0)} /></div>
            <div><label style={labelStyle}>Target date</label><input style={inputStyle} type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
            <div><label style={labelStyle}>Saved so far</label><input style={inputStyle} type="number" min="0" value={saved || ""} onChange={(e) => setSaved(Number(e.target.value) || 0)} /></div>
            <div><label style={labelStyle}>Saving / month</label><input style={inputStyle} type="number" min="0" value={monthly || ""} onChange={(e) => setMonthly(Number(e.target.value) || 0)} /></div>
            <div><label style={labelStyle}>Return on savings (%)</label><input style={inputStyle} type="number" min="0" max="12" step="0.5" value={apr || ""} onChange={(e) => setApr(Number(e.target.value) || 0)} placeholder="0" /></div>
          </div>
          {liquidAssets > 0 && saved === 0 && (
            <button type="button" onClick={() => setSaved(liquidAssets)} style={{ marginTop: "12px", fontSize: "11px", padding: "5px 10px", borderRadius: "7px", border: "1px solid var(--border-subtle)", background: "var(--bg-base)", color: "var(--text-secondary)", cursor: "pointer", fontFamily: "var(--font-body)" }}>Use my cash ({fmt(liquidAssets)})</button>
          )}
          <p style={{ fontSize: "11px", color: "var(--text-tertiary)", marginTop: "10px", lineHeight: 1.5 }}>For anything under ~3 years, keep it in cash or a high-yield savings account and leave the return at 0–4%. Don&apos;t invest money you&apos;ll need soon.</p>
        </div>

        {/* Verdict */}
        <div style={cardStyle}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "14px 10px" }}>
            <Metric label="Still to save" value={fmt(Math.round(calc.remaining))} sub={`of ${fmt(target)}`} />
            <Metric label="Need / month" value={calc.requiredMonthly != null ? fmt(Math.ceil(calc.requiredMonthly)) : "—"} sub={months != null ? `over ${months} mo` : "set a date"} accent={calc.onTrack == null ? undefined : calc.onTrack ? "var(--green)" : "var(--red)"} />
            <Metric label={months != null ? "Projected by date" : "Ready in"} value={months != null ? fmt(Math.round(calc.projected)) : calc.monthsToReach != null ? `${calc.monthsToReach} mo` : "—"} sub={months != null ? (calc.projected >= target ? "on target" : "short") : "at current pace"} accent={months != null ? (calc.projected >= target ? "var(--green)" : "var(--amber)") : undefined} />
          </div>
          {months != null && (
            <div style={{ marginTop: "14px", padding: "10px 12px", borderRadius: "10px", background: calc.onTrack ? "rgba(34,197,94,0.08)" : "rgba(245,158,11,0.08)", border: `1px solid ${calc.onTrack ? "rgba(34,197,94,0.18)" : "rgba(245,158,11,0.18)"}`, fontSize: "12px", color: "var(--text-secondary)", lineHeight: 1.55 }}>
              {calc.onTrack
                ? `On track — ${fmt(monthly)}/mo reaches ${fmt(target)} by your date${calc.projected > target ? ` with ${fmt(Math.round(calc.projected - target))} to spare` : ""}.`
                : `To hit ${fmt(target)} by the date, save ${fmt(Math.ceil(calc.requiredMonthly ?? 0))}/mo${monthly > 0 ? ` (you're at ${fmt(monthly)})` : ""} — or push the date out.`}
            </div>
          )}

          {/* Savings timeline */}
          {months != null && months > 0 && target > 0 && (() => {
            const W = 320, H = 90, pad = 6;
            const end = calc.projected;
            const yMax = Math.max(target, end, saved) * 1.05 || 1;
            const x = (m: number) => (m / months) * W;
            const y = (v: number) => H - pad - (v / yMax) * (H - 2 * pad);
            const path = `M${x(0).toFixed(1)},${y(saved).toFixed(1)} L${x(months).toFixed(1)},${y(end).toFixed(1)}`;
            const targetY = y(target);
            const crossM = monthly > 0 && saved < target ? (target - saved) / monthly : null;
            const reaches = crossM != null && crossM <= months;
            return (
              <div style={{ marginTop: "14px" }}>
                <div style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-tertiary)", marginBottom: "8px" }}>Savings timeline</div>
                <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: "100%", height: "90px", display: "block" }}>
                  <line x1="0" y1={targetY} x2={W} y2={targetY} stroke="rgba(148,163,184,0.5)" strokeWidth="1" strokeDasharray="4 3" />
                  <path d={path} fill="none" stroke={end >= target ? "var(--green, #22c55e)" : "var(--amber, #f59e0b)"} strokeWidth="2" strokeLinecap="round" />
                  {crossM != null && reaches && <circle cx={x(crossM)} cy={targetY} r="3.5" fill="var(--green, #22c55e)" />}
                </svg>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "9.5px", color: "var(--text-muted)", marginTop: "4px" }}>
                  <span>today · {fmt(saved)}</span>
                  <span style={{ color: "var(--text-tertiary)" }}>— — target {fmt(target)}</span>
                  <span>by date · {fmt(Math.round(end))}</span>
                </div>
              </div>
            );
          })()}
        </div>

        {/* Add to plan */}
        {target > 0 && (
          <div style={cardStyle}>
            <span style={{ fontFamily: "var(--font-display)", fontSize: "13px", fontWeight: 700, display: "block", marginBottom: "10px" }}>Add to your plan</span>
            <AddToPlanButton
              label={name.trim() || "Savings goal"}
              category="other"
              amountImpact={-target}
              defaultYear={targetYear}
              note={`Models the ${fmt(target)} purchase as a one-time cost that year, so it flows into your forecast.`}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function Metric({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: string }) {
  return (
    <div>
      <div style={{ fontSize: "9px", color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "5px" }}>{label}</div>
      <div style={{ fontSize: "20px", fontWeight: 700, fontFamily: "var(--font-display)", letterSpacing: "-0.5px", color: accent ?? "var(--text-primary)", lineHeight: 1.1 }}>{value}</div>
      {sub && <div style={{ fontSize: "10px", color: "var(--text-tertiary)", marginTop: "5px" }}>{sub}</div>}
    </div>
  );
}
