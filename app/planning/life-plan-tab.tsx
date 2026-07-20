"use client";

import { useState, useRef, useEffect, useTransition, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import InfoTooltip from "@/app/components/info-tooltip";
import { setFutureEventIncluded, deleteFutureEvent, addFutureEvent, type FutureEvent } from "./planning-actions";

function fmt(n: number): string {
  const a = Math.abs(n);
  if (a >= 1_000_000) return `$${(n / 1_000_000).toFixed(a >= 10_000_000 ? 0 : 1)}M`;
  if (a >= 1_000) return `$${(n / 1_000).toFixed(a >= 100_000 ? 0 : 0)}k`;
  return `$${Math.round(n)}`;
}
function fmtFull(n: number): string {
  return `${n < 0 ? "-" : ""}$${Math.abs(Math.round(n)).toLocaleString()}`;
}

const fieldStyle: React.CSSProperties = { padding: "8px 10px", borderRadius: "8px", border: "1px solid var(--card-border)", background: "var(--bg-elevated, rgba(255,255,255,0.03))", color: "var(--text-primary)", fontSize: "13px", fontFamily: "var(--font-body)", outline: "none", boxSizing: "border-box" };

// ── Life-stage catalog. Full-palette: each stage carries its own hue so the
// Explore grid reads as a vibrant map of a life, not 20 identical cards. ──
type Planner = { label: string; href: string; emoji: string };
type Stage = { key: string; title: string; hue: string; planners: Planner[] };

const STAGES: Stage[] = [
  { key: "home", title: "Home & Property", hue: "250", planners: [
    { label: "Buy a home", href: "/planning/home", emoji: "🏠" },
    { label: "Rent an apartment", href: "/planning/apartment", emoji: "🏢" },
    { label: "Rental property", href: "/planning/rental", emoji: "🔑" },
    { label: "Relocate", href: "/planning/relocation", emoji: "📦" },
  ]},
  { key: "family", title: "Family & Milestones", hue: "350", planners: [
    { label: "Start a family", href: "/planning/family", emoji: "👶" },
    { label: "Wedding", href: "/planning/wedding", emoji: "💍" },
    { label: "College fund", href: "/planning/education", emoji: "🎓" },
    { label: "Elder care", href: "/planning/elder-care", emoji: "🧑‍🦳" },
  ]},
  { key: "career", title: "Career & Income", hue: "285", planners: [
    { label: "Career move", href: "/planning/career", emoji: "💼" },
    { label: "Equity comp", href: "/planning/equity", emoji: "📈" },
    { label: "Start a business", href: "/planning/business", emoji: "💡" },
    { label: "Take a sabbatical", href: "/planning/sabbatical", emoji: "🌴" },
  ]},
  { key: "goals", title: "Big Purchases & Goals", hue: "65", planners: [
    { label: "Buy a car", href: "/planning/car", emoji: "🚗" },
    { label: "Savings goal", href: "/planning/savings-goal", emoji: "🎯" },
    { label: "Goal buckets", href: "/planning/goals", emoji: "🧭" },
    { label: "Plan a windfall", href: "/planning/windfall", emoji: "🎁" },
  ]},
  { key: "safety", title: "Safety & Protection", hue: "190", planners: [
    { label: "Emergency fund", href: "/planning/emergency-fund", emoji: "🛟" },
    { label: "Insurance needs", href: "/planning/insurance", emoji: "🛡️" },
    { label: "Major medical", href: "/planning/medical", emoji: "🏥" },
    { label: "Pay off debt", href: "/planning/debt", emoji: "💳" },
  ]},
  { key: "retire", title: "Retirement & Investing", hue: "155", planners: [
    { label: "Retirement income", href: "/planning/retirement", emoji: "🏛️" },
    { label: "Auto-invest", href: "/planning/contributions", emoji: "🔁" },
  ]},
];

// Category → stage hue, for coloring timeline markers + My Plan rows by life stage.
const CATEGORY_HUE: Record<string, string> = {
  home_purchase: "250", home: "250", real_estate: "250", apartment: "250", relocation: "250", rental: "250",
  family: "350", wedding: "350", education: "350", elder_care: "350",
  career: "285", business: "285", sabbatical: "285",
  car: "65", vehicle: "65", savings_goal: "65", windfall: "65", other: "65",
  emergency_fund: "190", insurance: "190", medical: "190", debt: "190",
  retirement: "155",
};
function hueFor(category: string | null | undefined): string {
  return CATEGORY_HUE[category ?? ""] ?? "230";
}

export default function LifePlanTab({
  readinessScore, projectedNWAtRetirement, retirementProb, biggestDecision,
  conflictAlerts, events, currentYear, retirementYear, trajectory,
}: {
  readinessScore: number;
  projectedNWAtRetirement: number | null;
  retirementProb: number | null;
  biggestDecision: { label: string; impact: number; positive: boolean } | null;
  conflictAlerts: { severity: string; years: number[]; title: string; description: string; recommendation: string }[];
  events: FutureEvent[];
  currentYear: number;
  retirementYear: number | null;
  trajectory?: React.ReactNode; // the interactive wealth-trajectory chart (preferred over the flat timeline)
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [aLabel, setALabel] = useState("");
  const [aYear, setAYear] = useState(String(currentYear + 1));
  const [aAmount, setAAmount] = useState("");
  const [aInflow, setAInflow] = useState(false);

  function submitAdd() {
    const amt = Math.abs(Number(aAmount)) * (aInflow ? 1 : -1);
    if (!aLabel.trim() || !Number(aAmount)) return;
    const fd = new FormData();
    fd.set("label", aLabel.trim());
    fd.set("event_year", aYear);
    fd.set("amount_impact", String(amt));
    fd.set("category", "other");
    // omit included → defaults to Considering (draft)
    startTransition(async () => {
      await addFutureEvent(fd);
      setALabel(""); setAAmount(""); setAInflow(false); setAdding(false);
      router.refresh();
    });
  }

  // Probability before/after a toggle, so we can flash the impact.
  const [probBefore, setProbBefore] = useState<number | null>(null);
  const [delta, setDelta] = useState<number | null>(null);
  useEffect(() => {
    if (probBefore != null && retirementProb != null && retirementProb !== probBefore) {
      setDelta(Math.round(retirementProb - probBefore));
      setProbBefore(null);
      const t = setTimeout(() => setDelta(null), 3200);
      return () => clearTimeout(t);
    }
  }, [retirementProb, probBefore]);

  const committed = useMemo(() => events.filter((e) => e.included !== false).sort((a, b) => a.event_year - b.event_year), [events]);
  const considering = useMemo(() => events.filter((e) => e.included === false).sort((a, b) => a.event_year - b.event_year), [events]);

  function toggle(ev: FutureEvent) {
    if (pending) return;
    setBusyId(ev.id);
    setProbBefore(retirementProb);
    startTransition(async () => {
      await setFutureEventIncluded(ev.id, ev.included === false); // considering → committed and vice-versa
      router.refresh();
      setBusyId(null);
    });
  }
  function remove(ev: FutureEvent) {
    if (pending) return;
    setBusyId(ev.id);
    startTransition(async () => {
      await deleteFutureEvent(ev.id);
      router.refresh();
      setBusyId(null);
    });
  }

  // Recommend stages the user hasn't touched yet (light personalization).
  const usedHues = new Set(events.map((e) => hueFor(e.category)));
  const recommended = STAGES
    .filter((s) => !usedHues.has(s.hue))
    .slice(0, 3)
    .map((s) => ({ stage: s, planner: s.planners[0] }));

  const probColor = retirementProb == null ? "var(--text-tertiary)"
    : retirementProb >= 80 ? "oklch(0.72 0.19 145)" : retirementProb >= 60 ? "oklch(0.78 0.17 70)" : "oklch(0.68 0.2 25)";
  const scoreColor = readinessScore >= 75 ? "oklch(0.72 0.19 145)" : readinessScore >= 50 ? "oklch(0.78 0.17 70)" : "oklch(0.68 0.2 25)";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "22px" }}>
      <style>{`
        @keyframes lp-in { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
        @keyframes lp-pop { 0% { opacity: 0; transform: scale(0.8); } 60% { transform: scale(1.06); } 100% { opacity: 1; transform: scale(1); } }
        .lp-sec { animation: lp-in 0.45s cubic-bezier(0.16,1,0.3,1) both; }
        .lp-mk { transition: transform .15s cubic-bezier(0.16,1,0.3,1); }
        @media (hover: hover) { .lp-mk:hover { transform: translateY(-2px) scale(1.12); } .lp-planner:hover { border-color: var(--_hue-border) !important; background: var(--_hue-bg) !important; } }
        .lp-hl { box-shadow: 0 0 0 2px var(--_hue-ring); }
      `}</style>

      {/* ── READOUT ── */}
      <div className="lp-sec" style={{ position: "relative", overflow: "hidden", borderRadius: "18px", border: "1px solid rgba(255,255,255,0.08)", background: "linear-gradient(135deg, rgba(14,165,160,0.14), rgba(63,174,74,0.10) 45%, rgba(0,211,149,0.06))", padding: "22px 24px" }}>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "26px" }}>
          {/* score ring */}
          <div style={{ position: "relative", width: "104px", height: "104px", flexShrink: 0 }}>
            <svg width="104" height="104" viewBox="0 0 104 104" style={{ transform: "rotate(-90deg)" }}>
              <circle cx="52" cy="52" r="45" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="7" />
              <defs><linearGradient id="lp-ring" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#2563eb" /><stop offset="55%" stopColor="#7c3aed" /><stop offset="100%" stopColor="#00d395" /></linearGradient></defs>
              <circle cx="52" cy="52" r="45" fill="none" stroke="url(#lp-ring)" strokeWidth="7" strokeLinecap="round" strokeDasharray={2 * Math.PI * 45} strokeDashoffset={2 * Math.PI * 45 * (1 - readinessScore / 100)} style={{ transition: "stroke-dashoffset .8s cubic-bezier(0.16,1,0.3,1)" }} />
            </svg>
            <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
              <span style={{ fontSize: "10px", fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--text-tertiary)" }}>Ready</span>
              <span style={{ fontFamily: "var(--font-mono)", fontWeight: 800, fontSize: "30px", color: "var(--text-primary)", lineHeight: 1 }}>{readinessScore}</span>
            </div>
          </div>
          {/* stats */}
          <div style={{ flex: 1, minWidth: "220px", display: "flex", flexWrap: "wrap", gap: "22px" }}>
            <div>
              <div style={{ fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-tertiary)" }}>Retirement odds</div>
              <div style={{ display: "flex", alignItems: "baseline", gap: "8px" }}>
                <span style={{ fontFamily: "var(--font-mono)", fontWeight: 800, fontSize: "26px", color: probColor, lineHeight: 1.1, transition: "color .4s" }}>{retirementProb != null ? `${Math.round(retirementProb)}%` : "—"}</span>
                {delta != null && delta !== 0 && (
                  <span style={{ animation: "lp-pop .4s ease both", fontFamily: "var(--font-mono)", fontSize: "12px", fontWeight: 700, color: delta > 0 ? "oklch(0.72 0.19 145)" : "oklch(0.68 0.2 25)" }}>
                    {delta > 0 ? "▲ +" : "▼ "}{delta}
                  </span>
                )}
              </div>
            </div>
            {projectedNWAtRetirement != null && (
              <div>
                <div style={{ fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-tertiary)" }}>At retirement</div>
                <div style={{ fontFamily: "var(--font-mono)", fontWeight: 800, fontSize: "26px", color: "var(--text-primary)", lineHeight: 1.1 }}>{fmt(projectedNWAtRetirement)}</div>
              </div>
            )}
            {biggestDecision && (
              <div style={{ minWidth: "150px" }}>
                <div style={{ fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-tertiary)" }}>Biggest decision</div>
                <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)", lineHeight: 1.25 }}>{biggestDecision.label}</div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: "12px", color: biggestDecision.positive ? "oklch(0.72 0.19 145)" : "oklch(0.68 0.2 25)" }}>{biggestDecision.positive ? "+" : ""}{fmt(biggestDecision.impact)} lifetime</div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── CONFLICTS ── */}
      {conflictAlerts.length > 0 && (
        <div className="lp-sec" style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          <SectionLabel color="oklch(0.68 0.2 25)">Conflicts detected</SectionLabel>
          {conflictAlerts.map((a, i) => {
            const color = a.severity === "critical" ? "oklch(0.68 0.2 25)" : a.severity === "warning" ? "oklch(0.78 0.17 70)" : "var(--accent)";
            return (
              <div key={i} style={{ borderRadius: "12px", border: `1px solid color-mix(in oklch, ${color} 26%, transparent)`, background: `color-mix(in oklch, ${color} 6%, var(--bg-card))`, padding: "13px 16px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "5px" }}>
                  <span style={{ fontSize: "10px", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color, background: `color-mix(in oklch, ${color} 14%, transparent)`, padding: "2px 7px", borderRadius: "20px" }}>{a.severity}</span>
                  {a.years[0] != null && <span style={{ marginLeft: "auto", fontFamily: "var(--font-mono)", fontSize: "10px", color: "var(--text-tertiary)" }}>{a.years[0]}{a.years.length > 1 ? `–${a.years[a.years.length - 1]}` : ""}</span>}
                </div>
                <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)", marginBottom: "4px" }}>{a.title}</div>
                <p style={{ fontSize: "12px", color: "var(--text-secondary)", margin: "0 0 6px", lineHeight: 1.5 }}>{a.description}</p>
                <div style={{ fontSize: "11.5px", color: "var(--text-secondary)", lineHeight: 1.5 }}><span style={{ fontWeight: 600, color }}>Fix: </span>{a.recommendation}</div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── TIMELINE / TRAJECTORY ── */}
      <div className="lp-sec">
        <SectionLabel color="var(--accent)">Your life timeline</SectionLabel>
        {trajectory ?? (
          <Timeline events={events} currentYear={currentYear} retirementYear={retirementYear} highlightId={highlightId} onPick={(id) => setHighlightId(id)} />
        )}
      </div>

      {/* ── MY PLAN ── */}
      <div className="lp-sec" style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px", flexWrap: "wrap" }}>
          <SectionLabel color="oklch(0.72 0.19 145)">My plan</SectionLabel>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <span style={{ fontSize: "11px", color: "var(--text-tertiary)" }}>
              <InfoTooltip align="end" width={250} text="Committed items count toward your retirement forecast. Considering items are saved drafts that don't affect your numbers — flip one on to see its impact, off to set it aside.">
                <span style={{ borderBottom: "1px dashed var(--text-muted)", cursor: "help" }}>Committed counts · Considering doesn&apos;t</span>
              </InfoTooltip>
            </span>
            <button type="button" onClick={() => setAdding((v) => !v)} style={{ fontSize: "11px", fontWeight: 600, color: "var(--accent, #5fbf9a)", background: "none", border: "none", cursor: "pointer", fontFamily: "var(--font-body)", padding: 0 }}>
              {adding ? "Cancel" : "+ Add event"}
            </button>
          </div>
        </div>

        {adding && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", alignItems: "center", padding: "12px 13px", borderRadius: "12px", background: "var(--bg-card)", border: "1px solid var(--card-border)" }}>
            <input value={aLabel} onChange={(e) => setALabel(e.target.value)} placeholder="What is it? (e.g. New roof)" maxLength={60} style={{ flex: "1 1 180px", ...fieldStyle }} />
            <input value={aYear} onChange={(e) => setAYear(e.target.value)} type="number" min={currentYear} placeholder="Year" style={{ width: "80px", ...fieldStyle }} />
            <input value={aAmount} onChange={(e) => setAAmount(e.target.value)} type="number" min="0" placeholder="Amount" style={{ width: "110px", ...fieldStyle }} />
            <div style={{ display: "flex", borderRadius: "8px", overflow: "hidden", border: "1px solid var(--card-border)" }}>
              <button type="button" onClick={() => setAInflow(false)} style={{ padding: "7px 11px", fontSize: "11px", fontWeight: 600, cursor: "pointer", fontFamily: "var(--font-body)", border: "none", background: !aInflow ? "oklch(0.68 0.16 40 / 0.18)" : "transparent", color: !aInflow ? "oklch(0.72 0.16 40)" : "var(--text-tertiary)" }}>Cost</button>
              <button type="button" onClick={() => setAInflow(true)} style={{ padding: "7px 11px", fontSize: "11px", fontWeight: 600, cursor: "pointer", fontFamily: "var(--font-body)", border: "none", background: aInflow ? "oklch(0.72 0.19 145 / 0.16)" : "transparent", color: aInflow ? "oklch(0.74 0.18 150)" : "var(--text-tertiary)" }}>Gain</button>
            </div>
            <button type="button" onClick={submitAdd} disabled={pending || !aLabel.trim() || !Number(aAmount)} style={{ padding: "8px 16px", borderRadius: "8px", border: "none", fontSize: "12px", fontWeight: 700, cursor: pending ? "wait" : "pointer", fontFamily: "var(--font-body)", background: "var(--brand-gradient)", color: "#fff", opacity: !aLabel.trim() || !Number(aAmount) ? 0.5 : 1 }}>Add draft</button>
          </div>
        )}

        {committed.length === 0 && considering.length === 0 ? (
          <div style={{ borderRadius: "14px", border: "1px dashed var(--card-border)", background: "var(--bg-card)", padding: "26px 20px", textAlign: "center" }}>
            <div style={{ fontSize: "26px", marginBottom: "8px" }}>🧭</div>
            <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-primary)", marginBottom: "4px" }}>Nothing on your timeline yet</div>
            <p style={{ fontSize: "12px", color: "var(--text-tertiary)", margin: 0, lineHeight: 1.5 }}>Model a decision below. It starts as a draft, so it won&apos;t touch your retirement odds until you commit it.</p>
          </div>
        ) : (
          <>
            {committed.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: "7px" }}>
                {committed.map((e) => <PlanRow key={e.id} e={e} committed busy={busyId === e.id} highlight={highlightId === e.id} onToggle={() => toggle(e)} onDelete={() => remove(e)} onHover={() => setHighlightId(e.id)} />)}
              </div>
            )}
            {considering.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: "7px", marginTop: committed.length > 0 ? "6px" : 0 }}>
                <div style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-tertiary)", padding: "2px 2px" }}>Considering ({considering.length})</div>
                {considering.map((e) => <PlanRow key={e.id} e={e} committed={false} busy={busyId === e.id} highlight={highlightId === e.id} onToggle={() => toggle(e)} onDelete={() => remove(e)} onHover={() => setHighlightId(e.id)} />)}
              </div>
            )}
          </>
        )}
      </div>

      {/* ── EXPLORE ── */}
      <div className="lp-sec" style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
        <SectionLabel color="oklch(0.7 0.15 285)">Explore a decision</SectionLabel>

        {recommended.length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: "10px" }}>
            {recommended.map(({ stage, planner }) => (
              <Link key={planner.href} href={planner.href} className="lp-planner"
                style={{ ["--_hue-bg" as string]: `oklch(0.6 0.15 ${stage.hue} / 0.12)`, ["--_hue-border" as string]: `oklch(0.6 0.15 ${stage.hue} / 0.5)`,
                  display: "flex", alignItems: "center", gap: "12px", padding: "14px 15px", borderRadius: "14px", textDecoration: "none",
                  background: `oklch(0.6 0.15 ${stage.hue} / 0.09)`, border: `1px solid oklch(0.6 0.15 ${stage.hue} / 0.28)` }}>
                <span style={{ fontSize: "22px", flexShrink: 0 }}>{planner.emoji}</span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: `oklch(0.75 0.14 ${stage.hue})` }}>Suggested</div>
                  <div style={{ fontSize: "13.5px", fontWeight: 600, color: "var(--text-primary)" }}>{planner.label}</div>
                </div>
                <span style={{ marginLeft: "auto", color: `oklch(0.75 0.14 ${stage.hue})`, flexShrink: 0 }}>→</span>
              </Link>
            ))}
          </div>
        )}

        {STAGES.map((stage) => (
          <div key={stage.key}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
              <span style={{ width: "8px", height: "8px", borderRadius: "3px", background: `oklch(0.68 0.16 ${stage.hue})`, flexShrink: 0 }} />
              <span style={{ fontSize: "11px", fontWeight: 700, color: "var(--text-secondary)", letterSpacing: "0.02em" }}>{stage.title}</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: "8px" }}>
              {stage.planners.map((p) => (
                <Link key={p.href} href={p.href} className="lp-planner"
                  style={{ ["--_hue-bg" as string]: `oklch(0.6 0.14 ${stage.hue} / 0.1)`, ["--_hue-border" as string]: `oklch(0.6 0.14 ${stage.hue} / 0.45)`,
                    display: "flex", alignItems: "center", gap: "9px", padding: "10px 12px", borderRadius: "11px", textDecoration: "none",
                    background: "var(--bg-card)", border: "1px solid var(--card-border)", transition: "background .15s, border-color .15s" }}>
                  <span style={{ fontSize: "16px", flexShrink: 0 }}>{p.emoji}</span>
                  <span style={{ fontSize: "12.5px", fontWeight: 500, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.label}</span>
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SectionLabel({ children, color }: { children: React.ReactNode; color: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
      <span style={{ width: "5px", height: "16px", borderRadius: "3px", background: color, flexShrink: 0 }} />
      <span style={{ fontSize: "12px", fontWeight: 700, color: "var(--text-primary)", letterSpacing: "-0.1px", fontFamily: "var(--font-display)" }}>{children}</span>
    </div>
  );
}

function PlanRow({ e, committed, busy, highlight, onToggle, onDelete, onHover }: {
  e: FutureEvent; committed: boolean; busy: boolean; highlight: boolean; onToggle: () => void; onDelete: () => void; onHover: () => void;
}) {
  const hue = hueFor(e.category);
  const inflow = e.amount_impact >= 0;
  return (
    <div onMouseEnter={onHover} className={highlight ? "lp-hl" : undefined}
      style={{ ["--_hue-ring" as string]: `oklch(0.65 0.15 ${hue} / 0.6)`,
        display: "flex", alignItems: "center", gap: "12px", padding: "11px 13px", borderRadius: "12px",
        background: committed ? `oklch(0.6 0.13 ${hue} / 0.07)` : "var(--bg-card)",
        border: `1px solid ${committed ? `oklch(0.6 0.13 ${hue} / 0.28)` : "var(--card-border)"}`,
        opacity: committed ? 1 : 0.82, transition: "opacity .2s, box-shadow .2s" }}>
      <span style={{ width: "10px", height: "10px", borderRadius: "50%", flexShrink: 0,
        background: committed ? `oklch(0.68 0.16 ${hue})` : "transparent",
        border: committed ? "none" : `1.5px dashed oklch(0.6 0.1 ${hue})` }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.label}</div>
        <div style={{ fontSize: "11px", color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>
          {e.event_year} · <span style={{ color: inflow ? "oklch(0.72 0.19 145)" : "oklch(0.7 0.16 40)" }}>{inflow ? "+" : ""}{fmtFull(e.amount_impact)}</span>{e.recurring_annual ? "/yr" : ""}
        </div>
      </div>
      {/* toggle */}
      <button type="button" onClick={onToggle} disabled={busy} title={committed ? "Set aside (won't affect retirement)" : "Commit to forecast"}
        style={{ display: "inline-flex", alignItems: "center", gap: "6px", flexShrink: 0, cursor: busy ? "wait" : "pointer", fontFamily: "var(--font-body)",
          padding: "5px 11px", borderRadius: "999px", fontSize: "10.5px", fontWeight: 700, letterSpacing: "0.02em",
          border: `1px solid ${committed ? "oklch(0.72 0.19 145 / 0.4)" : "var(--card-border)"}`,
          background: committed ? "oklch(0.72 0.19 145 / 0.14)" : "var(--bg-elevated, rgba(255,255,255,0.04))",
          color: committed ? "oklch(0.78 0.18 150)" : "var(--text-tertiary)" }}>
        <span style={{ width: "16px", height: "10px", borderRadius: "999px", background: committed ? "oklch(0.72 0.19 145)" : "var(--text-muted)", position: "relative", transition: "background .2s" }}>
          <span style={{ position: "absolute", top: "1px", left: committed ? "7px" : "1px", width: "8px", height: "8px", borderRadius: "50%", background: "#fff", transition: "left .2s cubic-bezier(0.16,1,0.3,1)" }} />
        </span>
        {committed ? "Committed" : "Considering"}
      </button>
      <button type="button" onClick={onDelete} disabled={busy} title="Remove" style={{ flexShrink: 0, background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: "15px", lineHeight: 1, padding: "0 2px" }}><span aria-hidden="true">×</span><span className="bt-sr-only">Remove</span></button>
    </div>
  );
}

// ── Horizontal life timeline: inflows above the axis, costs below, sized by
// magnitude. Committed = filled, Considering = hollow/dashed. ──
function Timeline({ events, currentYear, retirementYear, highlightId, onPick }: {
  events: FutureEvent[]; currentYear: number; retirementYear: number | null; highlightId: string | null; onPick: (id: string) => void;
}) {
  const years = events.map((e) => e.event_year);
  const minY = currentYear;
  const maxY = Math.max(retirementYear ?? currentYear + 10, years.length ? Math.max(...years) : currentYear + 10, currentYear + 8) + 1;
  const span = Math.max(1, maxY - minY);
  const maxMag = Math.max(1, ...events.map((e) => Math.abs(e.amount_impact)));
  const xOf = (y: number) => `${((y - minY) / span) * 100}%`;
  const hgt = (v: number) => 14 + Math.min(46, (Math.abs(v) / maxMag) * 46);

  // width grows with span so markers don't overlap; horizontal scroll on mobile.
  const pxWidth = Math.max(560, span * 46);

  return (
    <div style={{ overflowX: "auto", paddingBottom: "4px" }} className="bt-tabs-scroll">
      <div style={{ position: "relative", height: "180px", minWidth: `${pxWidth}px`, padding: "0 10px" }}>
        {/* axis */}
        <div style={{ position: "absolute", left: 0, right: 0, top: "88px", height: "2px", background: "linear-gradient(90deg, rgba(148,163,184,0.35), rgba(148,163,184,0.12))" }} />
        {/* retirement marker */}
        {retirementYear != null && retirementYear <= maxY && (
          <div style={{ position: "absolute", top: "8px", bottom: "8px", left: xOf(retirementYear) }}>
            <div style={{ position: "absolute", top: 0, bottom: 0, width: "2px", background: "linear-gradient(180deg, #3fae4a, rgba(63,174,74,0.15))", borderRadius: "2px" }} />
            <div style={{ position: "absolute", top: "-2px", left: "6px", whiteSpace: "nowrap", fontSize: "10px", fontWeight: 700, color: "var(--violet-light, #6fd08a)", fontFamily: "var(--font-mono)" }}>Retire {retirementYear}</div>
          </div>
        )}
        {/* now marker */}
        <div style={{ position: "absolute", top: "78px", left: xOf(currentYear), width: "8px", height: "8px", marginLeft: "-4px", borderRadius: "50%", background: "var(--text-secondary)", border: "2px solid var(--bg-base)" }} />
        <div style={{ position: "absolute", top: "94px", left: xOf(currentYear), fontSize: "10px", color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>now</div>

        {/* event markers */}
        {events.map((e) => {
          const hue = hueFor(e.category);
          const inflow = e.amount_impact >= 0;
          const committed = e.included !== false;
          const h = hgt(e.amount_impact);
          const hi = highlightId === e.id;
          return (
            <div key={e.id} className="lp-mk" onClick={() => onPick(e.id)}
              style={{ position: "absolute", left: xOf(e.event_year), top: inflow ? `${88 - h}px` : "88px", height: `${h}px`, cursor: "pointer", transform: "translateX(-50%)" }}>
              {/* stem */}
              <div style={{ position: "absolute", left: "50%", top: 0, bottom: 0, width: "2px", marginLeft: "-1px",
                background: committed ? `oklch(0.66 0.16 ${hue})` : `oklch(0.6 0.08 ${hue} / 0.6)`,
                borderRadius: "2px", ...(committed ? {} : { backgroundImage: `repeating-linear-gradient(180deg, oklch(0.6 0.1 ${hue}) 0 3px, transparent 3px 6px)`, background: "transparent" }) }} />
              {/* dot at the far end */}
              <div style={{ position: "absolute", left: "50%", [inflow ? "top" : "bottom"]: "-5px", marginLeft: "-5px", width: "10px", height: "10px", borderRadius: "50%",
                background: committed ? `oklch(0.68 0.16 ${hue})` : "var(--bg-base)",
                border: committed ? "2px solid var(--bg-base)" : `2px solid oklch(0.62 0.12 ${hue})`,
                boxShadow: hi ? `0 0 0 4px oklch(0.65 0.15 ${hue} / 0.3)` : "none" }} />
              {/* label */}
              <div style={{ position: "absolute", left: "50%", transform: "translateX(-50%)", [inflow ? "top" : "bottom"]: "-30px", whiteSpace: "nowrap", textAlign: "center" }}>
                <div style={{ fontSize: "10px", fontFamily: "var(--font-mono)", fontWeight: 700, color: committed ? (inflow ? "oklch(0.74 0.18 150)" : `oklch(0.72 0.14 ${hue})`) : "var(--text-tertiary)" }}>{inflow ? "+" : ""}{fmt(e.amount_impact)}</div>
                <div style={{ fontSize: "10px", color: "var(--text-muted)", maxWidth: "70px", overflow: "hidden", textOverflow: "ellipsis" }}>{e.label}</div>
              </div>
            </div>
          );
        })}
        {events.length === 0 && (
          <div style={{ position: "absolute", top: "104px", left: 0, right: 0, textAlign: "center", fontSize: "11px", color: "var(--text-tertiary)" }}>Model a decision below to see it land on your timeline.</div>
        )}
      </div>
    </div>
  );
}
