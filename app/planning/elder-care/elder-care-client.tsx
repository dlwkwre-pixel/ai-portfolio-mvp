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

// US national median annual costs (2024–25, Genworth-style ranges).
const CARE_TYPES: { key: string; label: string; annual: number; note: string }[] = [
  { key: "inhome_pt", label: "In-home care (part-time)", annual: 33000, note: "~20 hrs/week of a home health aide." },
  { key: "inhome_ft", label: "In-home care (full-time)", annual: 68000, note: "44 hrs/week of a home health aide." },
  { key: "assisted", label: "Assisted living", annual: 64000, note: "Private one-bedroom in an assisted-living community." },
  { key: "memory", label: "Memory care", annual: 80000, note: "Specialized dementia/Alzheimer's care." },
  { key: "nursing", label: "Nursing home (private)", annual: 116000, note: "Private room in a skilled-nursing facility." },
];

export default function ElderCareClient() {
  const nowYear = new Date().getFullYear();
  const [careKey, setCareKey] = useState<string>("assisted");
  const [annualCost, setAnnualCost] = useState<number>(64000);
  const [parentResources, setParentResources] = useState<number>(0); // their income/SS/LTC insurance toward care, annual
  const [sharePct, setSharePct] = useState<number>(100); // your share of the remaining cost
  const [durationYears, setDurationYears] = useState<number>(3);
  const [startYear, setStartYear] = useState<number>(nowYear + 1);
  const [costInflation, setCostInflation] = useState<number>(4); // care inflation runs hot

  const care = CARE_TYPES.find((c) => c.key === careKey) ?? CARE_TYPES[2];

  const calc = useMemo(() => {
    const gap = Math.max(0, annualCost - parentResources);
    const yourAnnual = gap * (sharePct / 100);
    // Total over the duration, growing with care inflation.
    let total = 0;
    for (let y = 0; y < durationYears; y++) total += yourAnnual * Math.pow(1 + costInflation / 100, y);
    return { gap, yourAnnual, total };
  }, [annualCost, parentResources, sharePct, durationYears, costInflation]);

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", color: "var(--text-primary)", fontFamily: "var(--font-body)" }}>
      <div style={{ padding: "12px 24px", borderBottom: "1px solid var(--border-subtle)", background: "var(--bg-base)", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "3px" }}>
          <Link href="/planning?tab=events" style={{ display: "flex", alignItems: "center", gap: "5px", fontSize: "12px", color: "var(--text-muted)", textDecoration: "none" }}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M10 3L5 8l5 5" strokeLinecap="round" strokeLinejoin="round" /></svg>
            Planning
          </Link>
          <span style={{ color: "var(--border)" }}>/</span>
          <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)" }}>Elder Care</span>
        </div>
        <div style={{ display: "flex", alignItems: "baseline", gap: "10px" }}>
          <span style={{ fontSize: "16px", fontWeight: 700 }}>Aging Parent Care Planner</span>
          <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>Plan for the cost of caring for a parent — before it&apos;s urgent</span>
        </div>
      </div>

      <div className="bt-page-content" style={{ flex: 1, overflowY: "auto", padding: "20px 24px 80px", display: "flex", flexDirection: "column", gap: "16px", maxWidth: "760px" }}>

        {/* Care type */}
        <div style={cardStyle}>
          <label style={labelStyle}>Type of care</label>
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            {CARE_TYPES.map((c) => (
              <button key={c.key} type="button" onClick={() => { setCareKey(c.key); setAnnualCost(c.annual); }}
                style={{ textAlign: "left", padding: "9px 12px", borderRadius: "8px", cursor: "pointer", fontSize: "12px", fontFamily: "var(--font-body)", display: "flex", justifyContent: "space-between", gap: "10px",
                  border: `1px solid ${careKey === c.key ? "var(--brand-blue, #2563eb)" : "var(--border-subtle)"}`,
                  background: careKey === c.key ? "rgba(37,99,235,0.1)" : "var(--bg-base)",
                  color: careKey === c.key ? "var(--text-primary)" : "var(--text-secondary)" }}>
                <span>{c.label}<span style={{ color: "var(--text-muted)", display: "block", fontSize: "10px", marginTop: "2px" }}>{c.note}</span></span>
                <span style={{ fontFamily: "var(--font-mono)", whiteSpace: "nowrap" }}>{fmt(c.annual)}/yr</span>
              </button>
            ))}
          </div>
        </div>

        {/* Numbers */}
        <div style={cardStyle}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "14px" }}>
            <div><label style={labelStyle}>Annual care cost</label><input style={inputStyle} type="number" min="0" value={annualCost || ""} onChange={(e) => setAnnualCost(Number(e.target.value) || 0)} /></div>
            <div><label style={labelStyle}>Parent covers / yr</label><input style={inputStyle} type="number" min="0" value={parentResources || ""} onChange={(e) => setParentResources(Number(e.target.value) || 0)} placeholder="SS, pension, LTC ins." /></div>
            <div><label style={labelStyle}>Your share (%)</label><input style={inputStyle} type="number" min="0" max="100" value={sharePct || ""} onChange={(e) => setSharePct(Number(e.target.value) || 0)} /></div>
            <div><label style={labelStyle}>Duration (years)</label><input style={inputStyle} type="number" min="1" value={durationYears || ""} onChange={(e) => setDurationYears(Number(e.target.value) || 0)} /></div>
            <div><label style={labelStyle}>Starting year</label><input style={inputStyle} type="number" min={nowYear} value={startYear || ""} onChange={(e) => setStartYear(Number(e.target.value) || nowYear)} /></div>
            <div><label style={labelStyle}>Care inflation (%)</label><input style={inputStyle} type="number" min="0" max="10" step="0.5" value={costInflation || ""} onChange={(e) => setCostInflation(Number(e.target.value) || 0)} /></div>
          </div>
          <p style={{ fontSize: "11px", color: "var(--text-tertiary)", marginTop: "10px", lineHeight: 1.5 }}>If you have siblings sharing the cost, set your share below 100%. Enter what the parent can cover from Social Security, a pension, or long-term-care insurance — you only plan for the gap.</p>
        </div>

        {/* Verdict */}
        <div style={cardStyle}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "14px 10px" }}>
            <Metric label="Your cost / year" value={fmt(Math.round(calc.yourAnnual))} sub={`${sharePct}% of the ${fmt(Math.round(calc.gap))} gap`} accent="var(--brand-blue, #2563eb)" />
            <Metric label={`Total over ${durationYears} yr`} value={fmt(Math.round(calc.total))} sub="with care inflation" accent={calc.total > 150000 ? "var(--amber)" : undefined} />
            <Metric label="Begins" value={String(startYear)} sub={`through ${startYear + durationYears - 1}`} />
          </div>
          <p style={{ fontSize: "11px", color: "var(--text-tertiary)", marginTop: "12px", lineHeight: 1.55 }}>
            Care costs are one of the largest unplanned expenses families face, and they collide with your own peak earning and saving years. Modeling it now lets you see the impact on your retirement and explore options early: long-term-care insurance, a parent&apos;s home equity, Medicaid planning, or splitting cost with siblings.
          </p>
        </div>

        {/* Add to plan */}
        {calc.yourAnnual > 0 && (
          <div style={cardStyle}>
            <span style={{ fontFamily: "var(--font-display)", fontSize: "13px", fontWeight: 700, display: "block", marginBottom: "10px" }}>Add to your plan</span>
            <AddToPlanButton
              label="Parent care"
              category="other"
              amountImpact={0}
              recurringAnnual={-Math.round(calc.yourAnnual)}
              defaultYear={startYear}
              endYear={startYear + durationYears - 1}
              note={`Models your ${fmt(Math.round(calc.yourAnnual))}/yr share from ${startYear} through ${startYear + durationYears - 1}, so your forecast reflects the years you're supporting a parent.`}
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
      <div style={{ fontSize: "10px", color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "5px" }}>{label}</div>
      <div style={{ fontSize: "20px", fontWeight: 700, fontFamily: "var(--font-display)", letterSpacing: "-0.5px", color: accent ?? "var(--text-primary)", lineHeight: 1.1 }}>{value}</div>
      {sub && <div style={{ fontSize: "10px", color: "var(--text-tertiary)", marginTop: "5px" }}>{sub}</div>}
    </div>
  );
}
