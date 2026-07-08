"use client";

// ─────────────────────────────────────────────────────────────────────────────
// TrajectoryChart — the interactive wealth-trajectory fan, wired to REAL data.
// Lifted from the /planning/concept "Trajectory Room" and made reusable:
//  • bands come from the live deterministic forecast (optimistic/baseline/pessimistic)
//  • the retirement handle drives the existing what-if state (scenarioRetirementAge)
//  • life-event pins are real planning_future_events: drag moves the year (server
//    write on release), the popover toggles Committed/Considering
//  • the odds number rolls; a delta chip appears when a change moves it
// Additive component: renders alongside every existing planning feature.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useMemo, useRef, useEffect, useCallback, useTransition } from "react";
import type { FutureEvent } from "./planning-actions";

type BandPoint = { year: number; baseline: number; optimistic: number; pessimistic: number };

export type TrajectoryChartProps = {
  currentAge: number | null;
  currentYear: number;
  retirementAge: number | null;          // active target (what-if ?? profile)
  baselineRetirementAge: number | null;  // profile target, for what-if detection
  onRetirementAgeChange?: (age: number) => void;
  onResetRetirementAge?: () => void;
  bands: BandPoint[];                    // year = offset from now, ends at retirement
  retirementProb: number | null;
  atRetirement: number | null;           // baseline net worth at the retirement point
  lastsToAge?: number | null;            // drawdown: last age fully funded
  depletedAge?: number | null;           // drawdown: first age with a shortfall
  drawdownEndAge?: number;               // drawdown horizon (default 95)
  events: FutureEvent[];                 // committed + considering
  onToggleEvent?: (id: string, included: boolean) => Promise<unknown> | void;
  onMoveEvent?: (id: string, year: number) => Promise<unknown> | void;
  isPrivate?: boolean;
};

// ── Formatting ───────────────────────────────────────────────────────────────
function fmtMoney(n: number): string {
  const a = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (a >= 1_000_000) return `${sign}$${(a / 1_000_000).toFixed(a >= 10_000_000 ? 1 : 2)}M`;
  if (a >= 1_000) return `${sign}$${Math.round(a / 1_000)}k`;
  return `${sign}$${Math.round(a)}`;
}
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

// Life-stage hues (same mapping as the Life Plan tab)
const CATEGORY_HUE: Record<string, number> = {
  home_purchase: 250, home: 250, real_estate: 250, apartment: 250, relocation: 250, rental: 250,
  family: 350, wedding: 350, education: 350, elder_care: 350,
  career: 285, business: 285, sabbatical: 285,
  car: 65, vehicle: 65, savings_goal: 65, windfall: 65, other: 65,
  emergency_fund: 190, insurance: 190, medical: 190, debt: 190,
  retirement: 155,
};
const EMOJI: Record<string, string> = {
  home_purchase: "🏠", home: "🏠", real_estate: "🏠", apartment: "🏢", relocation: "📦", rental: "🔑",
  family: "👶", wedding: "💍", education: "🎓", elder_care: "🧑‍🦳",
  career: "💼", business: "💡", sabbatical: "🌴",
  car: "🚗", vehicle: "🚗", savings_goal: "🎯", windfall: "🎁", other: "📌",
  emergency_fund: "🛟", insurance: "🛡️", medical: "🏥", debt: "💳",
  retirement: "🏛️",
};
const hueFor = (c: string | null | undefined) => CATEGORY_HUE[c ?? ""] ?? 230;
const emojiFor = (c: string | null | undefined) => EMOJI[c ?? ""] ?? "📌";

// ── Rolling number ───────────────────────────────────────────────────────────
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
      const e = 1 - Math.pow(1 - p, 4);
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

const VBW = 1000, VBH = 320;
const TOP_PAD = 0.10, BOT_PAD = 0.15;

export default function TrajectoryChart({
  currentAge, currentYear, retirementAge, baselineRetirementAge,
  onRetirementAgeChange, onResetRetirementAge,
  bands, retirementProb, atRetirement, lastsToAge, depletedAge, drawdownEndAge = 95,
  events, onToggleEvent, onMoveEvent, isPrivate = false,
}: TrajectoryChartProps) {
  const [, startTransition] = useTransition();
  const hasAges = currentAge != null;
  // X units: ages when known, otherwise years-from-now offsets.
  // The domain is FIXED to the full band series (now → plan end ~95), the way the
  // /planning/concept chart pins its axis to nowAge → planEnd. Because the bands
  // already span the whole horizon (accumulation + drawdown), the retirement
  // handle lands mid-chart and dragging it never shifts or shrinks the domain.
  const startX = hasAges ? currentAge! : 0;
  const endX = startX + Math.max(1, bands.length - 1);
  const span = Math.max(1, endX - startX);
  const xOfYearAbs = useCallback((yearAbs: number) => startX + (yearAbs - currentYear), [startX, currentYear]);

  const yMax = useMemo(() => Math.max(1, ...bands.map((b) => b.optimistic)) * 1.06, [bands]);
  const xFrac = useCallback((x: number) => clamp((x - startX) / span, 0, 1), [startX, span]);
  const yFrac = useCallback((v: number) => {
    const usable = 1 - TOP_PAD - BOT_PAD;
    return 1 - BOT_PAD - (clamp(v, 0, yMax) / yMax) * usable;
  }, [yMax]);

  // SVG paths from the real bands
  const paths = useMemo(() => {
    if (bands.length < 2) return null;
    const pt = (i: number, v: number) => `${(xFrac(startX + i) * VBW).toFixed(1)},${(yFrac(v) * VBH).toFixed(1)}`;
    const median = bands.map((b, i) => `${i === 0 ? "M" : "L"}${pt(i, b.baseline)}`).join(" ");
    const fwd = bands.map((b, i) => `${i === 0 ? "M" : "L"}${pt(i, b.optimistic)}`).join(" ");
    const back = [...bands.keys()].reverse().map((i) => `L${pt(i, bands[i].pessimistic)}`).join(" ");
    return { median, fan: `${fwd} ${back} Z` };
  }, [bands, xFrac, yFrac, startX]);

  // Rolling readouts
  const rolledProb = useRolling(retirementProb ?? 0);
  const rolledWealth = useRolling(atRetirement ?? 0, 800);
  const prevProb = useRef(retirementProb ?? 0);
  const [delta, setDelta] = useState<number | null>(null);
  useEffect(() => {
    const p = retirementProb ?? 0;
    const d = p - prevProb.current;
    prevProb.current = p;
    if (d !== 0 && Math.abs(d) < 60) {
      setDelta(Math.round(d));
      const t = setTimeout(() => setDelta(null), 2800);
      return () => clearTimeout(t);
    }
  }, [retirementProb]);

  // Interaction
  const plotRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  const [hoverX, setHoverX] = useState<number | null>(null);
  const [selectedPin, setSelectedPin] = useState<string | null>(null);
  const [pinOverride, setPinOverride] = useState<Record<string, number>>({}); // id → year while a move is in flight
  const [busyPin, setBusyPin] = useState<string | null>(null);

  // Clear an override once the server round-trip catches up.
  useEffect(() => {
    setPinOverride((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const e of events) {
        if (next[e.id] != null && e.event_year === next[e.id]) { delete next[e.id]; changed = true; }
      }
      return changed ? next : prev;
    });
  }, [events]);

  const xFromClientX = useCallback((clientX: number) => {
    const rect = plotRef.current?.getBoundingClientRect();
    if (!rect) return null;
    return startX + clamp((clientX - rect.left) / rect.width, 0, 1) * span;
  }, [startX, span]);

  const beginDrag = useCallback((onX: (x: number) => void, onDone?: () => void) => (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    draggingRef.current = true;
    setHoverX(null);
    const move = (ev: PointerEvent) => {
      const x = xFromClientX(ev.clientX);
      if (x != null) onX(x);
    };
    const up = () => {
      draggingRef.current = false;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      onDone?.();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    move(e.nativeEvent);
  }, [xFromClientX]);

  const dragRetire = useMemo(() => {
    if (!hasAges || !onRetirementAgeChange) return undefined;
    const maxRet = Math.min(85, endX - 2);
    return beginDrag((x) => onRetirementAgeChange(clamp(Math.round(x), currentAge! + 1, maxRet)));
  }, [beginDrag, hasAges, onRetirementAgeChange, currentAge, endX]);

  const pinYearRef = useRef<number | null>(null);
  const dragPin = useCallback((ev: FutureEvent) => beginDrag(
    (x) => {
      const yr = clamp(Math.round(currentYear + (x - startX)), currentYear, currentYear + span + 20);
      pinYearRef.current = yr;
      setPinOverride((p) => ({ ...p, [ev.id]: yr }));
    },
    () => {
      const yr = pinYearRef.current;
      pinYearRef.current = null;
      if (yr != null && yr !== ev.event_year && onMoveEvent) {
        setBusyPin(ev.id);
        startTransition(async () => {
          await onMoveEvent(ev.id, yr);
          setBusyPin(null);
        });
      }
    },
  ), [beginDrag, currentYear, startX, span, onMoveEvent, startTransition]);

  function togglePin(ev: FutureEvent) {
    if (!onToggleEvent || busyPin) return;
    setBusyPin(ev.id);
    startTransition(async () => {
      await onToggleEvent(ev.id, ev.included === false); // flip
      setBusyPin(null);
    });
  }

  const whatIf = retirementAge != null && baselineRetirementAge != null && retirementAge !== baselineRetirementAge;
  const probColor = retirementProb == null ? "var(--text-tertiary)"
    : retirementProb >= 75 ? "oklch(0.75 0.17 162)" : retirementProb >= 55 ? "oklch(0.78 0.16 75)" : "oklch(0.68 0.19 22)";
  const ph = (s: string) => (isPrivate ? "••••" : s);

  if (!paths || bands.length < 2) return null;

  const retX = hasAges ? retirementAge : null;
  const axisTicks = (() => {
    const ticks: number[] = [];
    const step = span <= 12 ? 2 : span <= 25 ? 5 : 10;
    for (let x = Math.ceil(startX / step) * step; x <= endX; x += step) ticks.push(x);
    if (!ticks.includes(startX)) ticks.unshift(startX);
    return ticks;
  })();

  return (
    <div style={{ borderRadius: "18px", border: "1px solid var(--card-border)", background: "var(--card-bg)", padding: "16px 16px 8px" }}>
      <style>{`
        @keyframes trjc-draw { from { stroke-dashoffset: 1; } to { stroke-dashoffset: 0; } }
        @keyframes trjc-fade { from { opacity: 0; } to { opacity: 1; } }
        @keyframes trjc-pop { 0% { opacity: 0; transform: scale(0.85); } 60% { transform: scale(1.05); } 100% { opacity: 1; transform: scale(1); } }
        .trjc-median { stroke-dasharray: 1; animation: trjc-draw 1.1s cubic-bezier(0.22,1,0.36,1) 0.1s both; }
        .trjc-fan { animation: trjc-fade 0.8s ease-out 0.3s both; }
        .trjc-pin { touch-action: none; transition: transform 0.15s cubic-bezier(0.16,1,0.3,1); }
        @media (hover: hover) and (pointer: fine) { .trjc-pin:hover { transform: translate(-50%, -50%) scale(1.12) !important; } }
        @media (prefers-reduced-motion: reduce) { .trjc-median, .trjc-fan { animation: none !important; } .trjc-median { stroke-dasharray: none; } }
      `}</style>

      {/* Header: the north-star readout */}
      <div style={{ display: "flex", alignItems: "center", gap: "16px", flexWrap: "wrap", marginBottom: "10px", padding: "0 4px" }}>
        <div>
          <div style={{ fontSize: "9px", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-tertiary)", marginBottom: "2px" }}>Retirement odds</div>
          <div style={{ display: "flex", alignItems: "baseline", gap: "7px" }}>
            <span style={{ fontFamily: "var(--font-mono)", fontWeight: 800, fontSize: "27px", lineHeight: 1, color: probColor, letterSpacing: "-0.03em" }}>
              {retirementProb == null ? "—" : ph(`${Math.round(rolledProb)}%`)}
            </span>
            {delta != null && delta !== 0 && (
              <span style={{ animation: "trjc-pop 0.35s cubic-bezier(0.16,1,0.3,1) both", fontFamily: "var(--font-mono)", fontSize: "12px", fontWeight: 700, color: delta > 0 ? "#00d395" : "#ff5c5c" }}>
                {delta > 0 ? `+${delta}` : delta}
              </span>
            )}
          </div>
        </div>
        {atRetirement != null && (
          <div>
            <div style={{ fontSize: "9px", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-tertiary)", marginBottom: "2px" }}>At retirement{retirementAge != null ? ` (${retirementAge})` : ""}</div>
            <div style={{ fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: "16px", color: "var(--text-primary)" }}>{ph(fmtMoney(rolledWealth))}</div>
          </div>
        )}
        {(depletedAge != null || (lastsToAge != null && lastsToAge > 0)) && (
          <div>
            <div style={{ fontSize: "9px", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-tertiary)", marginBottom: "2px" }}>Drawdown to {drawdownEndAge}</div>
            <div style={{ fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: "16px", color: depletedAge != null ? "#ff5c5c" : "#00d395" }}>
              {depletedAge != null ? `Depletes at ${depletedAge}` : `Lasts to ${lastsToAge}`}
            </div>
          </div>
        )}
        {whatIf && (
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ fontSize: "10px", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--violet-light, #a78bfa)", background: "rgba(124,58,237,0.12)", border: "1px solid rgba(167,139,250,0.35)", borderRadius: "999px", padding: "3px 9px" }}>
              What-if: retire at {retirementAge}
            </span>
            {onResetRetirementAge && (
              <button type="button" onClick={onResetRetirementAge} style={{ fontSize: "11px", fontWeight: 600, color: "var(--text-tertiary)", background: "none", border: "none", cursor: "pointer", fontFamily: "var(--font-body)", padding: 0 }}>Reset</button>
            )}
          </div>
        )}
      </div>

      {/* Plot */}
      <div style={{ overflowX: "auto" }} className="bt-tabs-scroll">
        <div ref={plotRef} style={{ position: "relative", height: "300px", minWidth: "560px" }}
          onPointerMove={(e) => { if (!draggingRef.current) { const x = xFromClientX(e.clientX); if (x != null) setHoverX(clamp(Math.round(x), startX, endX)); } }}
          onPointerLeave={() => setHoverX(null)}>

          <svg viewBox={`0 0 ${VBW} ${VBH}`} preserveAspectRatio="none" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", display: "block" }}>
            <defs>
              <linearGradient id="trjcGrad" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#2563eb" />
                <stop offset="100%" stopColor="#7c3aed" />
              </linearGradient>
            </defs>
            {[0.25, 0.5, 0.75].map((f) => (
              <line key={f} x1="0" x2={VBW} y1={(1 - BOT_PAD - f * (1 - TOP_PAD - BOT_PAD)) * VBH} y2={(1 - BOT_PAD - f * (1 - TOP_PAD - BOT_PAD)) * VBH} stroke="rgba(148,163,184,0.07)" strokeWidth="1" />
            ))}
            <path className="trjc-fan" d={paths.fan} fill="oklch(0.62 0.19 262 / 0.11)" />
            <path className="trjc-median" d={paths.median} fill="none" stroke="url(#trjcGrad)" strokeWidth="2.5" pathLength={1} strokeLinejoin="round" strokeLinecap="round" />
            <line x1="0" x2={VBW} y1={(1 - BOT_PAD) * VBH} y2={(1 - BOT_PAD) * VBH} stroke="rgba(148,163,184,0.16)" strokeWidth="1" />
          </svg>

          {/* Retirement handle (real what-if state) */}
          {retX != null && (
            <div role="slider" aria-label="What-if retirement age" aria-valuemin={currentAge! + 1} aria-valuemax={85} aria-valuenow={retX} tabIndex={0}
              onKeyDown={(e) => { if (!onRetirementAgeChange) return; if (e.key === "ArrowLeft") onRetirementAgeChange(clamp(retX - 1, currentAge! + 1, 85)); if (e.key === "ArrowRight") onRetirementAgeChange(clamp(retX + 1, currentAge! + 1, 85)); }}
              onPointerDown={dragRetire}
              style={{ position: "absolute", top: 0, bottom: `${BOT_PAD * 100 - 4}%`, left: `${xFrac(retX) * 100}%`, width: "44px", marginLeft: "-22px", cursor: dragRetire ? "ew-resize" : "default", touchAction: "none", zIndex: 4, outline: "none" }}>
              <div style={{ position: "absolute", top: 0, bottom: 0, left: "50%", width: "2px", marginLeft: "-1px", background: "linear-gradient(180deg, rgba(167,139,250,0.9), rgba(167,139,250,0.1))", borderRadius: "2px" }} />
              <div style={{ position: "absolute", top: "2px", left: "50%", transform: "translateX(-50%)", display: "flex", alignItems: "center", gap: "5px", whiteSpace: "nowrap", background: "var(--bg-elevated, #0d1120)", border: "1px solid rgba(167,139,250,0.4)", borderRadius: "999px", padding: "4px 10px" }}>
                <span style={{ width: "5px", height: "5px", borderRadius: "50%", background: "var(--violet-light, #a78bfa)" }} />
                <span style={{ fontSize: "10px", fontWeight: 700, fontFamily: "var(--font-mono)", color: "var(--violet-light, #a78bfa)" }}>Retire {retX}</span>
                {dragRetire && <span style={{ fontSize: "9px", color: "var(--text-tertiary)" }}>⇄</span>}
              </div>
            </div>
          )}

          {/* Life-event pins on the curve */}
          {events.map((ev) => {
            const yr = pinOverride[ev.id] ?? ev.event_year;
            const x = clamp(xOfYearAbs(yr), startX, endX);
            const i = clamp(Math.round(x - startX), 0, bands.length - 1);
            const committed = ev.included !== false;
            const hue = hueFor(ev.category);
            const isSel = selectedPin === ev.id;
            return (
              <div key={ev.id} className="trjc-pin"
                onPointerDown={onMoveEvent ? dragPin(ev) : undefined}
                onClick={() => setSelectedPin(isSel ? null : ev.id)}
                style={{ position: "absolute", left: `${xFrac(x) * 100}%`, top: `${yFrac(bands[i].baseline) * 100}%`, transform: "translate(-50%, -50%)", zIndex: isSel ? 6 : 5, cursor: onMoveEvent ? "grab" : "pointer", opacity: busyPin === ev.id ? 0.6 : 1 }}>
                <div style={{
                  width: "28px", height: "28px", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "12px",
                  background: "var(--bg-elevated, #0d1120)",
                  border: committed ? `2px solid oklch(0.68 0.15 ${hue})` : `2px dashed oklch(0.6 0.1 ${hue} / 0.8)`,
                  opacity: committed ? 1 : 0.75,
                  boxShadow: isSel ? `0 0 0 5px oklch(0.65 0.15 ${hue} / 0.25)` : "none",
                }}>{emojiFor(ev.category)}</div>
                <div style={{ position: "absolute", top: "32px", left: "50%", transform: "translateX(-50%)", textAlign: "center", whiteSpace: "nowrap", pointerEvents: "none" }}>
                  <div style={{ fontSize: "9px", fontFamily: "var(--font-mono)", fontWeight: 700, color: committed ? `oklch(0.75 0.13 ${hue})` : "var(--text-tertiary)" }}>{ph(fmtMoney(ev.amount_impact))}</div>
                </div>
                {isSel && (
                  <div onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}
                    style={{ position: "absolute", bottom: "38px", left: "50%", transform: "translateX(-50%)", width: "196px", padding: "12px 13px", borderRadius: "12px", background: "var(--bg-overlay, #111827)", border: "1px solid rgba(255,255,255,0.1)", boxShadow: "0 8px 32px rgba(0,0,0,0.6)", zIndex: 10, animation: "trjc-pop 0.25s cubic-bezier(0.16,1,0.3,1) both" }}>
                    <div style={{ fontSize: "12.5px", fontWeight: 700, color: "var(--text-primary)", marginBottom: "2px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{emojiFor(ev.category)} {ev.label}</div>
                    <div style={{ fontSize: "10.5px", fontFamily: "var(--font-mono)", color: "var(--text-tertiary)", marginBottom: "9px" }}>{yr} · {ph(fmtMoney(ev.amount_impact))}{ev.recurring_annual ? "/yr" : ""}</div>
                    {onToggleEvent && (
                      <button type="button" onClick={() => togglePin(ev)} disabled={busyPin === ev.id}
                        style={{ width: "100%", padding: "7px 0", borderRadius: "8px", cursor: "pointer", fontFamily: "var(--font-body)", fontSize: "11px", fontWeight: 700,
                          border: `1px solid ${committed ? "rgba(0,211,149,0.4)" : "var(--card-border)"}`,
                          background: committed ? "rgba(0,211,149,0.12)" : "rgba(255,255,255,0.04)",
                          color: committed ? "#00d395" : "var(--text-secondary)" }}>
                        {busyPin === ev.id ? "…" : committed ? "Committed · counts" : "Considering · tap to commit"}
                      </button>
                    )}
                    {onMoveEvent && <div style={{ fontSize: "9.5px", color: "var(--text-tertiary)", marginTop: "7px", lineHeight: 1.4 }}>Drag the pin to move the year.</div>}
                  </div>
                )}
              </div>
            );
          })}

          {/* Crosshair */}
          {hoverX != null && (() => {
            const i = clamp(Math.round(hoverX - startX), 0, bands.length - 1);
            const b = bands[i];
            return (
              <>
                <div style={{ position: "absolute", top: `${TOP_PAD * 100}%`, bottom: `${BOT_PAD * 100}%`, left: `${xFrac(hoverX) * 100}%`, width: "1px", background: "rgba(148,163,184,0.28)", pointerEvents: "none", zIndex: 2 }} />
                <div style={{ position: "absolute", top: "4px", left: `${clamp(xFrac(hoverX) * 100, 14, 84)}%`, transform: "translateX(-50%)", pointerEvents: "none", zIndex: 2, background: "var(--bg-elevated, #0d1120)", border: "1px solid var(--card-border)", borderRadius: "10px", padding: "6px 10px", whiteSpace: "nowrap" }}>
                  <span style={{ fontSize: "9px", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-tertiary)", marginRight: "8px" }}>{hasAges ? `Age ${hoverX}` : `+${hoverX}yr`}</span>
                  <span style={{ fontSize: "12px", fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--text-primary)" }}>{ph(fmtMoney(b.baseline))}</span>
                  <span style={{ fontSize: "10px", fontFamily: "var(--font-mono)", color: "var(--text-tertiary)", marginLeft: "7px" }}>{ph(`${fmtMoney(b.pessimistic)} – ${fmtMoney(b.optimistic)}`)}</span>
                </div>
              </>
            );
          })()}

          {/* Axis */}
          <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, display: "flex", justifyContent: "space-between", padding: "0 2px", pointerEvents: "none" }}>
            {axisTicks.map((x) => (
              <span key={x} style={{ fontSize: "9px", fontFamily: "var(--font-mono)", color: "var(--text-tertiary)" }}>
                {x === startX ? (hasAges ? `now · ${x}` : "now") : hasAges ? x : `+${x}yr`}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px", flexWrap: "wrap", padding: "8px 4px 6px" }}>
        <span style={{ fontSize: "10px", color: "var(--text-tertiary)" }}>
          {dragRetire ? "Drag the retirement line or any pin. Everything recomputes." : "Live from your plan: bands, events, and odds."}
        </span>
        <span style={{ fontSize: "10px", color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>optimistic / baseline / pessimistic</span>
      </div>
    </div>
  );
}
