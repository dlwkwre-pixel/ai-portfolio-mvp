"use client";

// ─────────────────────────────────────────────────────────────────────────────
// THE TRAJECTORY ROOM — Planning concept preview.
// One instrument, not seven tools: a living wealth trajectory as the page,
// life events pinned on the curve, one north-star number threaded everywhere.
// Sample data only. Nothing here reads or writes real plans.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import Link from "next/link";

// ── Formatting ───────────────────────────────────────────────────────────────
function fmtMoney(n: number): string {
  const a = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (a >= 1_000_000) return `${sign}$${(a / 1_000_000).toFixed(a >= 10_000_000 ? 1 : 2)}M`;
  if (a >= 1_000) return `${sign}$${Math.round(a / 1_000)}k`;
  return `${sign}$${Math.round(a)}`;
}
function fmtFull(n: number): string {
  return `${n < 0 ? "-" : ""}$${Math.abs(Math.round(n)).toLocaleString()}`;
}
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

// ── Math: normal CDF (Abramowitz-Stegun) ─────────────────────────────────────
function normCdf(z: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp((-z * z) / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return z > 0 ? 1 - p : p;
}
const Z90 = 1.2816;
const Z75 = 0.6745;

// ── Life-stage hues (consistent with the shipped Life Plan tab) ──────────────
type LifeEvent = {
  id: string; label: string; emoji: string; hue: number;
  age: number; amount: number; committed: boolean;
};

const SAMPLE_EVENTS: LifeEvent[] = [
  { id: "child",  label: "Second child",       emoji: "👶", hue: 350, age: 36, amount: -18_000,  committed: true },
  { id: "home",   label: "Home down payment",  emoji: "🏠", hue: 250, age: 37, amount: -120_000, committed: true },
  { id: "sabb",   label: "Six-month sabbatical", emoji: "🌴", hue: 285, age: 45, amount: -60_000, committed: false },
  { id: "college", label: "College fund",      emoji: "🎓", hue: 350, age: 52, amount: -140_000, committed: true },
  { id: "cabin",  label: "Lake cabin",         emoji: "🏞️", hue: 65,  age: 58, amount: -90_000,  committed: false },
];

// ── The simulation ───────────────────────────────────────────────────────────
type SimConfig = {
  nowAge: number; planEnd: number; retireAge: number;
  w0: number; monthlySave: number; annualSpend: number;
  mu: number; postMu: number; sigma: number;
  events: LifeEvent[];
};
type SimResult = {
  ages: number[]; median: number[]; p10: number[]; p25: number[]; p75: number[]; p90: number[];
  prob: number; wAtRet: number; required: number; depleteAge: number | null; yMax: number;
};

function simulate(cfg: SimConfig): SimResult {
  const { nowAge, planEnd, retireAge, w0, monthlySave, annualSpend, mu, postMu, sigma, events } = cfg;
  const ages: number[] = [], median: number[] = [];
  let w = w0;
  for (let a = nowAge; a <= planEnd; a++) {
    ages.push(a);
    median.push(Math.max(0, w));
    const r = a < retireAge ? mu : postMu;
    w = w * (1 + r);
    if (a < retireAge) w += monthlySave * 12;
    else w -= annualSpend;
    for (const e of events) if (e.committed && e.age === a) w += e.amount;
    if (w < 0) w = 0;
  }
  const p10: number[] = [], p25: number[] = [], p75: number[] = [], p90: number[] = [];
  for (let i = 0; i < median.length; i++) {
    const sigT = sigma * Math.sqrt(Math.max(0.25, i));
    p90.push(median[i] * Math.exp(Z90 * sigT));
    p75.push(median[i] * Math.exp(Z75 * sigT));
    p25.push(median[i] * Math.exp(-Z75 * sigT));
    p10.push(median[i] * Math.exp(-Z90 * sigT));
  }
  const retIdx = clamp(retireAge - nowAge, 0, median.length - 1);
  const wAtRet = median[retIdx];
  const N = Math.max(1, planEnd - retireAge);
  const annuity = (1 - Math.pow(1 + postMu, -N)) / postMu;
  const required = annualSpend * annuity;
  const sigRet = sigma * Math.sqrt(Math.max(1, retireAge - nowAge));
  const prob = wAtRet <= 0 ? 2 : clamp(Math.round(normCdf(Math.log(wAtRet / required) / sigRet) * 100), 1, 99);
  let depleteAge: number | null = null;
  for (let i = retIdx; i < median.length; i++) {
    if (median[i] <= 0) { depleteAge = ages[i]; break; }
  }
  const yMax = Math.max(...p90, w0 * 2) * 1.06;
  return { ages, median, p10, p25, p75, p90, prob, wAtRet, required, depleteAge, yMax };
}

// ── Rolling number: values resolve, they don't pop ───────────────────────────
function useRolling(value: number, duration = 650): number {
  const [disp, setDisp] = useState(value);
  const current = useRef(value);
  const reduced = useRef(false);
  useEffect(() => {
    try { reduced.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { /* ignore */ }
  }, []);
  useEffect(() => {
    if (reduced.current) { current.current = value; setDisp(value); return; }
    const from = current.current, to = value;
    if (from === to) return;
    const t0 = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / duration);
      const e = 1 - Math.pow(1 - p, 4); // quartic ease-out
      const v = from + (to - from) * e;
      current.current = v;
      setDisp(v);
      if (p < 1) raf = requestAnimationFrame(tick);
      else current.current = to;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);
  return disp;
}

// ── Plot geometry ────────────────────────────────────────────────────────────
const VBW = 1000, VBH = 340;
const TOP_PAD = 0.08, BOT_PAD = 0.14;

// ─────────────────────────────────────────────────────────────────────────────
export default function ConceptClient() {
  // Assumptions (sample plan)
  const nowAge = 34, planEnd = 92;
  const [retireAge, setRetireAge] = useState(65);
  const [monthlySave, setMonthlySave] = useState(2100);
  const [returnPreset, setReturnPreset] = useState<"cautious" | "base" | "bold">("base");
  const [events, setEvents] = useState<LifeEvent[]>(SAMPLE_EVENTS);
  const [lens, setLens] = useState<"overview" | "money" | "life" | "estate" | "atlas">("overview");
  const [firstRun, setFirstRun] = useState(false);
  const [selectedPin, setSelectedPin] = useState<string | null>(null);
  const [drawKey, setDrawKey] = useState(0);

  const mu = returnPreset === "cautious" ? 0.045 : returnPreset === "bold" ? 0.07 : 0.058;
  const cfg: SimConfig = useMemo(() => ({
    nowAge, planEnd, retireAge, w0: 185_000, monthlySave, annualSpend: 88_000,
    mu, postMu: 0.045, sigma: 0.13, events,
  }), [retireAge, monthlySave, mu, events]);

  const sim = useMemo(() => simulate(cfg), [cfg]);
  const rolledProb = useRolling(sim.prob);
  const rolledWealth = useRolling(sim.wAtRet, 800);

  // Delta chip when the odds move from a user action
  const prevProb = useRef(sim.prob);
  const [delta, setDelta] = useState<number | null>(null);
  useEffect(() => {
    const d = sim.prob - prevProb.current;
    prevProb.current = sim.prob;
    if (d !== 0) {
      setDelta(d);
      const t = setTimeout(() => setDelta(null), 2800);
      return () => clearTimeout(t);
    }
  }, [sim.prob]);

  // Scales
  const xFrac = useCallback((age: number) => (age - nowAge) / (planEnd - nowAge), [nowAge, planEnd]);
  const yFrac = useCallback((v: number) => {
    const usable = 1 - TOP_PAD - BOT_PAD;
    return 1 - BOT_PAD - (clamp(v, 0, sim.yMax) / sim.yMax) * usable;
  }, [sim.yMax]);

  // SVG paths
  const paths = useMemo(() => {
    const pt = (i: number, series: number[]) => `${(xFrac(sim.ages[i]) * VBW).toFixed(1)},${(yFrac(series[i]) * VBH).toFixed(1)}`;
    const line = (series: number[]) => sim.ages.map((_, i) => `${i === 0 ? "M" : "L"}${pt(i, series)}`).join(" ");
    const band = (top: number[], bot: number[]) => {
      const fwd = sim.ages.map((_, i) => `${i === 0 ? "M" : "L"}${pt(i, top)}`).join(" ");
      const back = [...sim.ages.keys()].reverse().map((i) => `L${pt(i, bot)}`).join(" ");
      return `${fwd} ${back} Z`;
    };
    return { median: line(sim.median), outer: band(sim.p90, sim.p10), inner: band(sim.p75, sim.p25) };
  }, [sim, xFrac, yFrac]);

  // Crosshair
  const plotRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  const [hoverAge, setHoverAge] = useState<number | null>(null);

  const ageFromClientX = useCallback((clientX: number) => {
    const rect = plotRef.current?.getBoundingClientRect();
    if (!rect) return null;
    const frac = clamp((clientX - rect.left) / rect.width, 0, 1);
    return nowAge + frac * (planEnd - nowAge);
  }, [nowAge, planEnd]);

  // Generic horizontal drag
  const beginDrag = useCallback((onAge: (age: number) => void) => (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    draggingRef.current = true;
    setHoverAge(null);
    const move = (ev: PointerEvent) => {
      const a = ageFromClientX(ev.clientX);
      if (a != null) onAge(a);
    };
    const up = () => {
      draggingRef.current = false;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    move(e.nativeEvent);
  }, [ageFromClientX]);

  const dragRetire = useMemo(() => beginDrag((a) => setRetireAge(clamp(Math.round(a), 50, 78))), [beginDrag]);
  const dragEvent = useCallback((id: string) => beginDrag((a) => {
    const yr = clamp(Math.round(a), nowAge + 1, planEnd - 2);
    setEvents((prev) => prev.map((ev) => ev.id === id ? { ...ev, age: yr } : ev));
  }), [beginDrag, nowAge, planEnd]);

  function toggleCommit(id: string) {
    setEvents((prev) => prev.map((ev) => ev.id === id ? { ...ev, committed: !ev.committed } : ev));
  }

  // Atlas ambient line: find the strongest lever, live
  const atlasLine = useMemo(() => {
    const later = simulate({ ...cfg, retireAge: Math.min(78, retireAge + 2) }).prob;
    const more = simulate({ ...cfg, monthlySave: monthlySave + 500 }).prob;
    const dLater = later - sim.prob, dMore = more - sim.prob;
    if (sim.depleteAge != null) return `At this pace the plan depletes at ${sim.depleteAge}. Retiring at ${retireAge + 2} moves you to ${later}%.`;
    if (dLater >= dMore && dLater > 0) return `Your strongest lever: retiring at ${Math.min(78, retireAge + 2)} lifts your odds from ${sim.prob}% to ${later}%.`;
    if (dMore > 0) return `Your strongest lever: $500 more per month lifts your odds from ${sim.prob}% to ${more}%.`;
    return `You are at ${sim.prob}%. Your plan holds through age ${planEnd} in the median path.`;
  }, [cfg, sim.prob, sim.depleteAge, retireAge, monthlySave, planEnd]);

  const probColor = sim.prob >= 75 ? "oklch(0.75 0.17 162)" : sim.prob >= 55 ? "oklch(0.78 0.16 75)" : "oklch(0.68 0.19 22)";
  const selected = events.find((e) => e.id === selectedPin) ?? null;

  // First-run quick-start fields
  const [qsAge, setQsAge] = useState("34");
  const [qsInvested, setQsInvested] = useState("185000");
  const [qsMonthly, setQsMonthly] = useState("2100");

  return (
    <div className="bt-page-content" style={{ flex: 1, overflowY: "auto" }}>
      <style>{`
        @keyframes trj-up { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: none; } }
        @keyframes trj-fade { from { opacity: 0; } to { opacity: 1; } }
        @keyframes trj-draw { from { stroke-dashoffset: 1; } to { stroke-dashoffset: 0; } }
        @keyframes trj-pop { 0% { opacity: 0; transform: scale(0.85); } 60% { transform: scale(1.05); } 100% { opacity: 1; transform: scale(1); } }
        .trj-sec { animation: trj-up 0.5s cubic-bezier(0.16,1,0.3,1) both; }
        .trj-median { stroke-dasharray: 1; animation: trj-draw 1.15s cubic-bezier(0.22,1,0.36,1) 0.15s both; }
        .trj-band { animation: trj-fade 0.9s ease-out 0.35s both; }
        .trj-pin { touch-action: none; transition: transform 0.15s cubic-bezier(0.16,1,0.3,1); }
        @media (hover: hover) and (pointer: fine) {
          .trj-pin:hover { transform: translate(-50%, -50%) scale(1.12) !important; }
          .trj-lens:hover { color: var(--text-primary) !important; }
          .trj-chip:hover { border-color: rgba(14,165,160,0.5) !important; color: var(--text-primary) !important; }
        }
        @media (prefers-reduced-motion: reduce) {
          .trj-sec, .trj-median, .trj-band { animation: none !important; }
          .trj-median { stroke-dasharray: none; }
        }
        @media (max-width: 640px) {
          .trj-spine { position: static !important; }
        }
      `}</style>

      <div style={{ maxWidth: "1160px", margin: "0 auto", padding: "18px 20px 90px" }}>

        {/* ── Header ── */}
        <div className="trj-sec" style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap", marginBottom: "14px" }}>
          <Link href="/planning" style={{ fontSize: "12px", color: "var(--text-tertiary)", textDecoration: "none", flexShrink: 0 }}>← Planning</Link>
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: "19px", fontWeight: 700, color: "var(--text-primary)", letterSpacing: "-0.3px", margin: 0 }}>
            The Trajectory Room
          </h1>
          <span style={{ fontSize: "10px", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--violet-light, #6fd08a)", border: "1px solid rgba(111,208,138,0.35)", background: "rgba(63,174,74,0.1)", padding: "3px 8px", borderRadius: "999px" }}>Concept · sample data</span>
          <button type="button" onClick={() => { setFirstRun((v) => !v); if (!firstRun) setDrawKey((k) => k + 1); }}
            style={{ marginLeft: "auto", fontSize: "11px", fontWeight: 600, color: "var(--text-secondary)", background: "var(--card-bg)", border: "1px solid var(--card-border)", borderRadius: "999px", padding: "6px 13px", cursor: "pointer", fontFamily: "var(--font-body)" }}>
            {firstRun ? "Back to full view" : "View first-run state"}
          </button>
        </div>

        {firstRun ? (
          /* ══════════ FIRST-RUN: the invitation ══════════ */
          <div className="trj-sec" style={{ position: "relative", borderRadius: "18px", border: "1px solid var(--card-border)", background: "var(--card-bg)", overflow: "hidden", minHeight: "480px" }}>
            {/* Ghost trajectory: the promise of the instrument */}
            <svg viewBox={`0 0 ${VBW} ${VBH}`} preserveAspectRatio="none" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0.5 }}>
              <path d={paths.outer} fill="oklch(0.62 0.19 262 / 0.05)" />
              <path d={paths.median} fill="none" stroke="oklch(0.6 0.12 275 / 0.35)" strokeWidth="2" strokeDasharray="6 7" />
            </svg>
            <div style={{ position: "relative", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "480px", padding: "40px 22px", textAlign: "center" }}>
              <div style={{ fontSize: "10px", fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--violet-light, #6fd08a)", marginBottom: "10px" }}>Your money has a trajectory</div>
              <h2 style={{ fontFamily: "var(--font-display)", fontSize: "26px", fontWeight: 700, color: "var(--text-primary)", letterSpacing: "-0.5px", margin: "0 0 8px", maxWidth: "22ch", lineHeight: 1.15 }}>
                Three numbers. Then you can see the next 50 years.
              </h2>
              <p style={{ fontSize: "13px", color: "var(--text-secondary)", maxWidth: "46ch", lineHeight: 1.6, margin: "0 0 24px" }}>
                We draw your wealth trajectory, pin your life decisions on it, and tell you the exact odds your plan works. Everything updates as your life changes.
              </p>
              <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", justifyContent: "center", marginBottom: "20px" }}>
                {[
                  { label: "Your age", value: qsAge, set: setQsAge, w: "90px" },
                  { label: "Invested today", value: qsInvested, set: setQsInvested, w: "130px" },
                  { label: "Invest monthly", value: qsMonthly, set: setQsMonthly, w: "120px" },
                ].map((f) => (
                  <div key={f.label} style={{ textAlign: "left" }}>
                    <div style={{ fontSize: "10px", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-tertiary)", marginBottom: "5px" }}>{f.label}</div>
                    <input value={f.value} onChange={(e) => f.set(e.target.value)} type="number" inputMode="numeric"
                      style={{ width: f.w, padding: "11px 12px", borderRadius: "10px", border: "1px solid var(--card-border)", background: "var(--bg-elevated, rgba(255,255,255,0.03))", color: "var(--text-primary)", fontSize: "15px", fontFamily: "var(--font-mono)", outline: "none", boxSizing: "border-box" }} />
                  </div>
                ))}
              </div>
              <button type="button"
                onClick={() => { setMonthlySave(Number(qsMonthly) || 2100); setFirstRun(false); setDrawKey((k) => k + 1); }}
                style={{ padding: "13px 26px", borderRadius: "12px", border: "none", cursor: "pointer", fontFamily: "var(--font-body)", fontSize: "14px", fontWeight: 700, color: "#fff", background: "var(--brand-gradient)", boxShadow: "0 4px 20px rgba(14,165,160,0.3)" }}>
                Draw my trajectory
              </button>
              <p style={{ fontSize: "10.5px", color: "var(--text-tertiary)", marginTop: "12px" }}>No forms. No jargon. Refine it whenever you want.</p>
            </div>
          </div>
        ) : (
          <>
            {/* ══════════ THE NORTH-STAR SPINE ══════════ */}
            <div className="trj-sec trj-spine" style={{ position: "sticky", top: 0, zIndex: 30, marginBottom: "14px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "18px", flexWrap: "wrap", padding: "12px 18px", borderRadius: "14px", border: "1px solid var(--card-border)", background: "var(--bg-elevated)" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                  <span style={{ fontSize: "10px", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-tertiary)" }}>Retirement odds</span>
                  <span style={{ width: "34px", height: "3px", borderRadius: "2px", background: "var(--brand-gradient)" }} />
                </div>
                <div style={{ display: "flex", alignItems: "baseline", gap: "8px" }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontWeight: 800, fontSize: "34px", lineHeight: 1, color: probColor, letterSpacing: "-0.03em" }}>
                    {Math.round(rolledProb)}%
                  </span>
                  {delta != null && (
                    <span style={{ animation: "trj-pop 0.35s cubic-bezier(0.16,1,0.3,1) both", fontFamily: "var(--font-mono)", fontSize: "13px", fontWeight: 700, color: delta > 0 ? "#00d395" : "#ff5c5c" }}>
                      {delta > 0 ? `+${delta}` : delta}
                    </span>
                  )}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "1px" }}>
                  <span style={{ fontSize: "10px", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-tertiary)" }}>At retirement ({retireAge})</span>
                  <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: "16px", color: "var(--text-primary)" }}>{fmtMoney(rolledWealth)}</span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "1px" }}>
                  <span style={{ fontSize: "10px", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-tertiary)" }}>Needs</span>
                  <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: "16px", color: "var(--text-secondary)" }}>{fmtMoney(sim.required)}</span>
                </div>
                {sim.depleteAge != null && (
                  <span style={{ marginLeft: "auto", fontSize: "11px", fontWeight: 700, color: "#ff5c5c", fontFamily: "var(--font-mono)" }}>Depletes at {sim.depleteAge}</span>
                )}
              </div>
            </div>

            {/* ══════════ THE TRAJECTORY (hero) ══════════ */}
            <div className="trj-sec" style={{ borderRadius: "18px", border: "1px solid var(--card-border)", background: "var(--card-bg)", padding: "18px 18px 10px", marginBottom: "16px", animationDelay: "0.05s" }}>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", flexWrap: "wrap", gap: "8px", marginBottom: "6px" }}>
                <div style={{ fontFamily: "var(--font-display)", fontSize: "14px", fontWeight: 700, color: "var(--text-primary)" }}>Wealth trajectory, age {nowAge} to {planEnd}</div>
                <div style={{ fontSize: "10.5px", color: "var(--text-tertiary)" }}>Drag the retirement line or any pin. The odds react.</div>
              </div>

              {/* Plot (scrolls horizontally on small screens) */}
              <div style={{ overflowX: "auto" }} className="bt-tabs-scroll">
                <div ref={plotRef} style={{ position: "relative", height: "340px", minWidth: "640px" }}
                  onPointerMove={(e) => { if (!draggingRef.current) { const a = ageFromClientX(e.clientX); if (a != null) setHoverAge(clamp(Math.round(a), nowAge, planEnd)); } }}
                  onPointerLeave={() => setHoverAge(null)}>

                  <svg viewBox={`0 0 ${VBW} ${VBH}`} preserveAspectRatio="none" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", display: "block" }}>
                    <defs>
                      <linearGradient id="trjGrad" x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%" stopColor="#2563eb" />
                        <stop offset="100%" stopColor="#7c3aed" />
                      </linearGradient>
                    </defs>
                    {/* wealth gridlines */}
                    {[0.25, 0.5, 0.75].map((f) => (
                      <line key={f} x1="0" x2={VBW} y1={(1 - BOT_PAD - f * (1 - TOP_PAD - BOT_PAD)) * VBH} y2={(1 - BOT_PAD - f * (1 - TOP_PAD - BOT_PAD)) * VBH} stroke="rgba(148,163,184,0.07)" strokeWidth="1" />
                    ))}
                    {/* probability fan */}
                    <path key={`o-${drawKey}`} className="trj-band" d={paths.outer} fill="oklch(0.62 0.19 262 / 0.09)" />
                    <path key={`i-${drawKey}`} className="trj-band" d={paths.inner} fill="oklch(0.62 0.19 268 / 0.13)" />
                    {/* median line: the spine of the whole page */}
                    <path key={`m-${drawKey}`} className="trj-median" d={paths.median} fill="none" stroke="url(#trjGrad)" strokeWidth="2.5" pathLength={1} strokeLinejoin="round" strokeLinecap="round" />
                    {/* baseline */}
                    <line x1="0" x2={VBW} y1={(1 - BOT_PAD) * VBH} y2={(1 - BOT_PAD) * VBH} stroke="rgba(148,163,184,0.18)" strokeWidth="1" />
                  </svg>

                  {/* Retirement handle */}
                  <div role="slider" aria-label="Retirement age" aria-valuemin={50} aria-valuemax={78} aria-valuenow={retireAge} tabIndex={0}
                    onKeyDown={(e) => { if (e.key === "ArrowLeft") setRetireAge((v) => clamp(v - 1, 50, 78)); if (e.key === "ArrowRight") setRetireAge((v) => clamp(v + 1, 50, 78)); }}
                    onPointerDown={dragRetire}
                    style={{ position: "absolute", top: 0, bottom: `${BOT_PAD * 100 - 4}%`, left: `${xFrac(retireAge) * 100}%`, width: "44px", marginLeft: "-22px", cursor: "ew-resize", touchAction: "none", zIndex: 4, outline: "none" }}>
                    <div style={{ position: "absolute", top: 0, bottom: 0, left: "50%", width: "2px", marginLeft: "-1px", background: "linear-gradient(180deg, rgba(111,208,138,0.9), rgba(111,208,138,0.12))", borderRadius: "2px" }} />
                    <div style={{ position: "absolute", top: "4px", left: "50%", transform: "translateX(-50%)", display: "flex", alignItems: "center", gap: "5px", whiteSpace: "nowrap", background: "var(--bg-elevated)", border: "1px solid rgba(111,208,138,0.4)", borderRadius: "999px", padding: "4px 10px" }}>
                      <span style={{ width: "5px", height: "5px", borderRadius: "50%", background: "var(--violet-light, #6fd08a)" }} />
                      <span style={{ fontSize: "10px", fontWeight: 700, fontFamily: "var(--font-mono)", color: "var(--violet-light, #6fd08a)" }}>Retire {retireAge}</span>
                      <span style={{ fontSize: "10px", color: "var(--text-tertiary)" }}>⇄</span>
                    </div>
                  </div>

                  {/* Life-event pins, ON the curve */}
                  {events.map((ev) => {
                    const i = clamp(ev.age - nowAge, 0, sim.median.length - 1);
                    const isSel = selectedPin === ev.id;
                    return (
                      <div key={ev.id} className="trj-pin"
                        onPointerDown={dragEvent(ev.id)}
                        onClick={() => setSelectedPin(isSel ? null : ev.id)}
                        style={{ position: "absolute", left: `${xFrac(ev.age) * 100}%`, top: `${yFrac(sim.median[i]) * 100}%`, transform: "translate(-50%, -50%)", zIndex: isSel ? 6 : 5, cursor: "grab" }}>
                        <div style={{
                          width: "30px", height: "30px", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "13px",
                          background: "var(--bg-elevated)",
                          border: ev.committed ? `2px solid oklch(0.68 0.15 ${ev.hue})` : `2px dashed oklch(0.6 0.1 ${ev.hue} / 0.8)`,
                          opacity: ev.committed ? 1 : 0.75,
                          boxShadow: isSel ? `0 0 0 5px oklch(0.65 0.15 ${ev.hue} / 0.25)` : "none",
                        }}>{ev.emoji}</div>
                        <div style={{ position: "absolute", top: "34px", left: "50%", transform: "translateX(-50%)", textAlign: "center", whiteSpace: "nowrap", pointerEvents: "none" }}>
                          <div style={{ fontSize: "10px", fontFamily: "var(--font-mono)", fontWeight: 700, color: ev.committed ? `oklch(0.75 0.13 ${ev.hue})` : "var(--text-tertiary)" }}>{fmtMoney(ev.amount)}</div>
                        </div>
                        {/* Popover */}
                        {isSel && (
                          <div onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}
                            style={{ position: "absolute", bottom: "40px", left: "50%", transform: "translateX(-50%)", width: "196px", padding: "12px 13px", borderRadius: "12px", background: "var(--bg-overlay)", border: "1px solid rgba(255,255,255,0.1)", boxShadow: "0 8px 32px rgba(0,0,0,0.6)", zIndex: 10, animation: "trj-pop 0.25s cubic-bezier(0.16,1,0.3,1) both" }}>
                            <div style={{ fontSize: "12.5px", fontWeight: 700, color: "var(--text-primary)", marginBottom: "2px" }}>{ev.emoji} {ev.label}</div>
                            <div style={{ fontSize: "10.5px", fontFamily: "var(--font-mono)", color: "var(--text-tertiary)", marginBottom: "9px" }}>Age {ev.age} · {fmtFull(ev.amount)}</div>
                            <button type="button" onClick={() => toggleCommit(ev.id)}
                              style={{ width: "100%", padding: "7px 0", borderRadius: "8px", cursor: "pointer", fontFamily: "var(--font-body)", fontSize: "11px", fontWeight: 700,
                                border: `1px solid ${ev.committed ? "rgba(0,211,149,0.4)" : "var(--card-border)"}`,
                                background: ev.committed ? "rgba(0,211,149,0.12)" : "rgba(255,255,255,0.04)",
                                color: ev.committed ? "#00d395" : "var(--text-secondary)" }}>
                              {ev.committed ? "Committed · counts" : "Considering · tap to commit"}
                            </button>
                            <div style={{ fontSize: "10px", color: "var(--text-tertiary)", marginTop: "7px", lineHeight: 1.4 }}>Drag the pin to move the year.</div>
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {/* Crosshair */}
                  {hoverAge != null && (() => {
                    const i = clamp(hoverAge - nowAge, 0, sim.median.length - 1);
                    return (
                      <>
                        <div style={{ position: "absolute", top: `${TOP_PAD * 100}%`, bottom: `${BOT_PAD * 100}%`, left: `${xFrac(hoverAge) * 100}%`, width: "1px", background: "rgba(148,163,184,0.28)", pointerEvents: "none", zIndex: 2 }} />
                        <div style={{ position: "absolute", top: "6px", left: `${clamp(xFrac(hoverAge) * 100, 12, 86)}%`, transform: "translateX(-50%)", pointerEvents: "none", zIndex: 2, background: "var(--bg-elevated)", border: "1px solid var(--card-border)", borderRadius: "10px", padding: "7px 11px", whiteSpace: "nowrap" }}>
                          <span style={{ fontSize: "10px", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-tertiary)", marginRight: "8px" }}>Age {hoverAge}</span>
                          <span style={{ fontSize: "12px", fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--text-primary)" }}>{fmtMoney(sim.median[i])}</span>
                          <span style={{ fontSize: "10px", fontFamily: "var(--font-mono)", color: "var(--text-tertiary)", marginLeft: "7px" }}>{fmtMoney(sim.p10[i])} – {fmtMoney(sim.p90[i])}</span>
                        </div>
                      </>
                    );
                  })()}

                  {/* Age axis */}
                  <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, display: "flex", justifyContent: "space-between", padding: "0 2px", pointerEvents: "none" }}>
                    {[nowAge, 45, 55, 65, 75, 85, planEnd].filter((a, idx, arr) => arr.indexOf(a) === idx).map((a) => (
                      <span key={a} style={{ fontSize: "10px", fontFamily: "var(--font-mono)", color: "var(--text-tertiary)" }}>{a === nowAge ? `now · ${a}` : a}</span>
                    ))}
                  </div>
                </div>
              </div>

              {/* Assumption dials */}
              <div style={{ display: "flex", alignItems: "center", gap: "18px", flexWrap: "wrap", padding: "12px 4px 8px", borderTop: "1px solid var(--border-subtle, rgba(255,255,255,0.05))", marginTop: "6px" }}>
                <label style={{ display: "flex", alignItems: "center", gap: "9px" }}>
                  <span style={{ fontSize: "10px", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-tertiary)" }}>Retire at</span>
                  <input type="range" min={50} max={78} value={retireAge} onChange={(e) => setRetireAge(Number(e.target.value))} style={{ width: "120px", accentColor: "#3fae4a" }} />
                  <span style={{ fontSize: "13px", fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--text-primary)", minWidth: "24px" }}>{retireAge}</span>
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: "9px" }}>
                  <span style={{ fontSize: "10px", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-tertiary)" }}>Invest monthly</span>
                  <input type="range" min={500} max={8000} step={100} value={monthlySave} onChange={(e) => setMonthlySave(Number(e.target.value))} style={{ width: "130px", accentColor: "#0ea5a0" }} />
                  <span style={{ fontSize: "13px", fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--text-primary)", minWidth: "52px" }}>{fmtMoney(monthlySave)}</span>
                </label>
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <span style={{ fontSize: "10px", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-tertiary)" }}>Returns</span>
                  {([["cautious", "4.5%"], ["base", "5.8%"], ["bold", "7.0%"]] as const).map(([k, lbl]) => (
                    <button key={k} type="button" onClick={() => setReturnPreset(k)}
                      style={{ padding: "5px 11px", borderRadius: "999px", cursor: "pointer", fontFamily: "var(--font-mono)", fontSize: "10.5px", fontWeight: 700,
                        border: `1px solid ${returnPreset === k ? "rgba(14,165,160,0.55)" : "var(--card-border)"}`,
                        background: returnPreset === k ? "rgba(14,165,160,0.13)" : "transparent",
                        color: returnPreset === k ? "#7fd9d4" : "var(--text-tertiary)" }}>{lbl}</button>
                  ))}
                </div>
                <span style={{ marginLeft: "auto", fontSize: "10px", color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>Spending {fmtMoney(88000)}/yr in retirement</span>
              </div>
            </div>

            {/* ══════════ ATLAS, AMBIENT ══════════ */}
            <div className="trj-sec" style={{ display: "flex", alignItems: "center", gap: "11px", padding: "11px 15px", borderRadius: "12px", border: "1px solid rgba(111,208,138,0.22)", background: "rgba(63,174,74,0.06)", marginBottom: "16px", animationDelay: "0.1s" }}>
          <span style={{ width: "26px", height: "26px", borderRadius: "50%", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(63,174,74,0.18)", border: "1px solid rgba(111,208,138,0.35)", fontSize: "12px" }}>◈</span>
              <p style={{ fontSize: "12.5px", color: "var(--text-secondary)", margin: 0, lineHeight: 1.5 }}>
                <span style={{ fontWeight: 700, color: "var(--violet-light, #6fd08a)" }}>Atlas</span>
                <span style={{ color: "var(--text-tertiary)" }}> · </span>{atlasLine}
              </p>
            </div>

            {/* ══════════ LENSES ══════════ */}
            <div className="trj-sec" style={{ animationDelay: "0.14s" }}>
              <div className="bt-tabs-scroll" style={{ display: "flex", gap: "2px", overflowX: "auto", borderBottom: "1px solid var(--border-subtle, rgba(255,255,255,0.05))", marginBottom: "16px" }}>
                {([["overview", "Overview"], ["money", "Money"], ["life", "Life"], ["estate", "Estate"], ["atlas", "Ask Atlas"]] as const).map(([k, lbl]) => (
                  <button key={k} type="button" onClick={() => setLens(k)} className="trj-lens"
                    style={{ padding: "10px 15px", fontSize: "12.5px", fontWeight: lens === k ? 700 : 500, whiteSpace: "nowrap", cursor: "pointer", fontFamily: "var(--font-body)",
                      color: lens === k ? "var(--text-primary)" : "var(--text-tertiary)", background: "none", border: "none",
                      borderBottom: `2px solid ${lens === k ? "#3fae4a" : "transparent"}`, marginBottom: "-1px", transition: "color 0.15s" }}>
                    {lbl}
                  </button>
                ))}
              </div>

              {/* OVERVIEW LENS */}
              {lens === "overview" && (
                <div key="overview" className="trj-sec" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: "12px" }}>
                  <div style={{ borderRadius: "14px", border: "1px solid var(--card-border)", background: "var(--card-bg)", padding: "16px 18px" }}>
                    <div style={{ fontSize: "10px", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-tertiary)", marginBottom: "6px" }}>Net worth today</div>
                    <div style={{ fontFamily: "var(--font-mono)", fontWeight: 800, fontSize: "24px", color: "var(--text-primary)" }}>{fmtMoney(281_000)}</div>
                    <div style={{ fontSize: "11px", fontFamily: "var(--font-mono)", color: "var(--green)", marginTop: "3px" }}>+$14.2k this quarter</div>
                  </div>
                  <div style={{ borderRadius: "14px", border: "1px solid var(--card-border)", background: "var(--card-bg)", padding: "16px 18px" }}>
                    <div style={{ fontSize: "10px", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-tertiary)", marginBottom: "6px" }}>Savings rate</div>
                    <div style={{ fontFamily: "var(--font-mono)", fontWeight: 800, fontSize: "24px", color: "var(--text-primary)" }}>22%</div>
                    <div style={{ fontSize: "11px", color: "var(--text-tertiary)", marginTop: "3px" }}>{fmtMoney(monthlySave)}/mo into the plan</div>
                  </div>
                  <div style={{ borderRadius: "14px", border: "1px solid var(--card-border)", background: "var(--card-bg)", padding: "16px 18px" }}>
                    <div style={{ fontSize: "10px", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-tertiary)", marginBottom: "10px" }}>Do next</div>
                    {[
                      `Commit or drop the sabbatical: it costs 3 points of odds`,
                      `Raise monthly investing to ${fmtMoney(monthlySave + 500)}`,
                      "Add a will: estate readiness is 42/100",
                    ].map((t, i) => (
                      <div key={i} style={{ display: "flex", gap: "8px", alignItems: "baseline", padding: "4px 0", fontSize: "12px", color: "var(--text-secondary)", lineHeight: 1.45 }}>
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: "10px", color: "var(--violet-light, #6fd08a)", fontWeight: 700 }}>{i + 1}</span>{t}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* MONEY LENS */}
              {lens === "money" && (
                <div key="money" className="trj-sec" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "12px" }}>
                  <div style={{ borderRadius: "14px", border: "1px solid var(--card-border)", background: "var(--card-bg)", padding: "16px 18px" }}>
                    <div style={{ fontSize: "10px", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-tertiary)", marginBottom: "12px" }}>What you own powers the curve</div>
                    {[
                      { label: "Invested", v: 185_000, hue: 262 },
                      { label: "Home equity", v: 96_000, hue: 250 },
                      { label: "Cash", v: 24_000, hue: 190 },
                      { label: "Mortgage", v: -142_000, hue: 22 },
                    ].map((r) => (
                      <div key={r.label} style={{ marginBottom: "9px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                          <span style={{ fontSize: "11.5px", color: "var(--text-secondary)" }}>{r.label}</span>
                          <span style={{ fontSize: "12px", fontFamily: "var(--font-mono)", fontWeight: 700, color: r.v < 0 ? "#ff5c5c" : "var(--text-primary)" }}>{fmtFull(r.v)}</span>
                        </div>
                        <div style={{ height: "5px", borderRadius: "3px", background: "rgba(255,255,255,0.05)", overflow: "hidden" }}>
                          <div style={{ width: `${Math.min(100, Math.abs(r.v) / 1850)}%`, height: "100%", borderRadius: "3px", background: r.v < 0 ? "oklch(0.6 0.16 22 / 0.75)" : `oklch(0.62 0.14 ${r.hue} / 0.85)` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                  <div style={{ borderRadius: "14px", border: "1px solid var(--card-border)", background: "var(--card-bg)", padding: "16px 18px" }}>
                    <div style={{ fontSize: "10px", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-tertiary)", marginBottom: "12px" }}>Where this month went · {fmtMoney(9_400)} in</div>
                    {[
                      { label: "Essentials", v: 3_850, semantic: false },
                      { label: "Lifestyle", v: 1_900, semantic: false },
                      { label: "Invested into the plan", v: monthlySave, semantic: true },
                      { label: "Cash buffer", v: 9_400 - 3_850 - 1_900 - monthlySave, semantic: false },
                    ].map((r) => (
                      <div key={r.label} style={{ marginBottom: "9px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                          <span style={{ fontSize: "11.5px", color: r.semantic ? "#00d395" : "var(--text-secondary)", fontWeight: r.semantic ? 700 : 400 }}>{r.label}</span>
                          <span style={{ fontSize: "12px", fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--text-primary)" }}>{fmtMoney(Math.max(0, r.v))}</span>
                        </div>
                        <div style={{ height: "5px", borderRadius: "3px", background: "rgba(255,255,255,0.05)", overflow: "hidden" }}>
                          <div style={{ width: `${clamp((Math.max(0, r.v) / 9_400) * 100, 0, 100)}%`, height: "100%", borderRadius: "3px", background: r.semantic ? "rgba(0,211,149,0.8)" : "oklch(0.55 0.06 262 / 0.8)" }} />
                        </div>
                      </div>
                    ))}
                    <p style={{ fontSize: "10.5px", color: "var(--text-tertiary)", margin: "10px 0 0", lineHeight: 1.5 }}>Every invested dollar feeds the trajectory above. That green bar is your {sim.prob}%.</p>
                  </div>
                </div>
              )}

              {/* LIFE LENS */}
              {lens === "life" && (
                <div key="life" className="trj-sec" style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  <p style={{ fontSize: "11.5px", color: "var(--text-tertiary)", margin: "0 0 4px" }}>Toggle a decision and watch the curve and the odds respond. Committed counts, Considering does not.</p>
                  {[...events].sort((a, b) => a.age - b.age).map((ev) => (
                    <div key={ev.id} style={{ display: "flex", alignItems: "center", gap: "12px", padding: "12px 14px", borderRadius: "12px",
                      border: `1px solid ${ev.committed ? `oklch(0.6 0.13 ${ev.hue} / 0.3)` : "var(--card-border)"}`,
                      background: ev.committed ? `oklch(0.6 0.13 ${ev.hue} / 0.07)` : "var(--card-bg)", opacity: ev.committed ? 1 : 0.8 }}>
                      <span style={{ fontSize: "18px", flexShrink: 0 }}>{ev.emoji}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)" }}>{ev.label}</div>
                        <div style={{ fontSize: "10.5px", fontFamily: "var(--font-mono)", color: "var(--text-tertiary)" }}>Age {ev.age} · {fmtFull(ev.amount)}</div>
                      </div>
                      <button type="button" onClick={() => toggleCommit(ev.id)}
                        style={{ flexShrink: 0, display: "inline-flex", alignItems: "center", gap: "6px", padding: "6px 12px", borderRadius: "999px", cursor: "pointer", fontFamily: "var(--font-body)", fontSize: "10.5px", fontWeight: 700,
                          border: `1px solid ${ev.committed ? "rgba(0,211,149,0.4)" : "var(--card-border)"}`,
                          background: ev.committed ? "rgba(0,211,149,0.12)" : "rgba(255,255,255,0.03)",
                          color: ev.committed ? "#00d395" : "var(--text-tertiary)" }}>
                        <span style={{ width: "16px", height: "10px", borderRadius: "999px", position: "relative", background: ev.committed ? "#00d395" : "var(--text-muted, #2d3748)", transition: "background 0.2s" }}>
                          <span style={{ position: "absolute", top: "1px", left: ev.committed ? "7px" : "1px", width: "8px", height: "8px", borderRadius: "50%", background: "#f0f4ff", transition: "left 0.2s cubic-bezier(0.16,1,0.3,1)" }} />
                        </span>
                        {ev.committed ? "Committed" : "Considering"}
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* ESTATE LENS */}
              {lens === "estate" && (
                <div key="estate" className="trj-sec" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "12px" }}>
                  <div style={{ borderRadius: "14px", border: "1px solid var(--card-border)", background: "var(--card-bg)", padding: "16px 18px" }}>
                    <div style={{ fontSize: "10px", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-tertiary)", marginBottom: "8px" }}>Estate readiness</div>
                    <div style={{ display: "flex", alignItems: "baseline", gap: "6px", marginBottom: "10px" }}>
                      <span style={{ fontFamily: "var(--font-mono)", fontWeight: 800, fontSize: "24px", color: "#f59e0b" }}>42</span>
                      <span style={{ fontSize: "12px", fontFamily: "var(--font-mono)", color: "var(--text-tertiary)" }}>/100</span>
                    </div>
                    <div style={{ height: "6px", borderRadius: "3px", background: "rgba(255,255,255,0.05)", overflow: "hidden" }}>
                      <div style={{ width: "42%", height: "100%", borderRadius: "3px", background: "#f59e0b" }} />
                    </div>
                    <p style={{ fontSize: "11px", color: "var(--text-secondary)", margin: "10px 0 0", lineHeight: 1.5 }}>The trajectory ends somewhere. Readiness decides how cleanly it transfers.</p>
                  </div>
                  <div style={{ borderRadius: "14px", border: "1px solid var(--card-border)", background: "var(--card-bg)", padding: "16px 18px" }}>
                    {[
                      { label: "Beneficiaries on accounts", done: true },
                      { label: "Will", done: false },
                      { label: "Durable power of attorney", done: false },
                    ].map((r) => (
                      <div key={r.label} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "8px 0", borderBottom: "1px solid var(--border-subtle, rgba(255,255,255,0.04))" }}>
                        <span style={{ width: "16px", height: "16px", borderRadius: "50%", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "10px", fontWeight: 800,
                          background: r.done ? "rgba(0,211,149,0.15)" : "rgba(255,255,255,0.05)", color: r.done ? "var(--green)" : "var(--text-tertiary)", border: `1px solid ${r.done ? "rgba(0,211,149,0.4)" : "var(--card-border)"}` }}>{r.done ? "✓" : "·"}</span>
                        <span style={{ fontSize: "12.5px", color: r.done ? "var(--text-secondary)" : "var(--text-primary)", fontWeight: r.done ? 400 : 600 }}>{r.label}</span>
                        {!r.done && <span style={{ marginLeft: "auto", fontSize: "10px", fontWeight: 700, color: "#f59e0b" }}>Missing</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ATLAS LENS */}
              {lens === "atlas" && (
                <div key="atlas" className="trj-sec" style={{ display: "flex", flexDirection: "column", gap: "12px", maxWidth: "680px" }}>
                  <div style={{ borderRadius: "14px", border: "1px solid rgba(111,208,138,0.25)", background: "rgba(63,174,74,0.06)", padding: "16px 18px" }}>
                    <div style={{ fontSize: "10px", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--violet-light, #6fd08a)", marginBottom: "8px" }}>Atlas reads your whole trajectory</div>
                    <p style={{ fontSize: "13px", color: "var(--text-primary)", margin: "0 0 8px", lineHeight: 1.6, fontWeight: 600 }}>{atlasLine}</p>
                    <p style={{ fontSize: "12px", color: "var(--text-secondary)", margin: 0, lineHeight: 1.6 }}>
                      Your committed plan needs {fmtMoney(sim.required)} at {retireAge}. The median path gets you {fmtMoney(sim.wAtRet)}. Every answer below is computed against that curve, not canned advice.
                    </p>
                  </div>
                  <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                    {["Can I afford the lake cabin?", "What if I retire at 60?", "Where does my plan break?"].map((q) => (
                      <span key={q} className="trj-chip" style={{ fontSize: "11.5px", color: "var(--text-secondary)", border: "1px solid var(--card-border)", background: "var(--card-bg)", borderRadius: "999px", padding: "7px 13px", cursor: "default" }}>{q}</span>
                    ))}
                  </div>
                  <div style={{ display: "flex", gap: "8px" }}>
                    <input aria-label="Ask Atlas about your plan (concept preview)" disabled placeholder="Ask Atlas about your plan (concept preview)" style={{ flex: 1, padding: "12px 14px", borderRadius: "12px", border: "1px solid var(--card-border)", background: "var(--card-bg)", color: "var(--text-primary)", fontSize: "13px", fontFamily: "var(--font-body)", outline: "none" }} />
                    <button type="button" disabled style={{ padding: "0 18px", borderRadius: "12px", border: "1px solid var(--card-border)", background: "var(--card-bg)", color: "var(--text-tertiary)", fontSize: "12.5px", fontWeight: 700, fontFamily: "var(--font-body)" }}>Send</button>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
