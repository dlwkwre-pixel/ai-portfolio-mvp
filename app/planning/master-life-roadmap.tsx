"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

// One visual lifetime timeline of every committed life decision, overlaid on
// the projected net-worth trajectory. The spine that turns separate planners
// into one living plan.

export type RoadmapEvent = {
  id: string;
  year: number;
  label: string;
  amount: number;        // signed; negative = cost, positive = inflow
  category: string;      // home* | family | education | vehicle | wedding | windfall | other
  href?: string;         // planner route to open
};
export type RoadmapMilestone = { year: number; label: string; kind: "retirement" | "wealth" };
export type TrajectoryPoint = { year: number; nw: number };
export type ConflictZone = { startYear: number; endYear: number; severity: "critical" | "warning" | "info"; label?: string };

const CAT = (c: string): { color: string; label: string } => {
  if (c.startsWith("home")) return { color: "#3b82f6", label: "Home" };
  if (c === "family") return { color: "#ec4899", label: "Family" };
  if (c === "education") return { color: "#a78bfa", label: "Education" };
  if (c === "vehicle") return { color: "#f59e0b", label: "Vehicle" };
  if (c === "wedding") return { color: "#f472b6", label: "Wedding" };
  if (c === "windfall") return { color: "#00d395", label: "Windfall" };
  return { color: "#64748b", label: "Other" };
};

function fmtK(n: number): string {
  const a = Math.abs(n);
  if (a >= 1_000_000) return `$${(n / 1_000_000).toFixed(a >= 10_000_000 ? 0 : 1)}M`;
  if (a >= 1_000) return `$${Math.round(n / 1000)}k`;
  return `$${Math.round(n)}`;
}

export default function MasterLifeRoadmap({
  startYear, endYear, events, milestones, trajectory, conflictZones = [],
}: {
  startYear: number;
  endYear: number;
  events: RoadmapEvent[];
  milestones: RoadmapMilestone[];
  trajectory: TrajectoryPoint[];
  conflictZones?: ConflictZone[];
}) {
  const [hover, setHover] = useState<string | null>(null);
  const span = Math.max(1, endYear - startYear);
  const xPct = (year: number) => Math.max(0, Math.min(100, ((year - startYear) / span) * 100));

  // Trajectory area path (normalized to a 0..1000 x, 0..100 y inverted viewBox).
  const areaPath = useMemo(() => {
    if (trajectory.length < 2) return null;
    const maxNw = Math.max(...trajectory.map((t) => t.nw), 1);
    const pts = trajectory.map((t) => {
      const x = (xPct(t.year) / 100) * 1000;
      const y = 100 - (t.nw / maxNw) * 92 - 4;
      return [x, y] as const;
    });
    const line = pts.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
    const area = `${line} L1000,100 L0,100 Z`;
    return { line, area };
  }, [trajectory, startYear, endYear]); // eslint-disable-line react-hooks/exhaustive-deps

  const sortedEvents = [...events].sort((a, b) => a.year - b.year);
  const cats = [...new Set(sortedEvents.map((e) => CAT(e.category).label))];

  const yearTicks = useMemo(() => {
    const ticks: number[] = [startYear];
    const step = span <= 10 ? 2 : span <= 25 ? 5 : 10;
    for (let y = startYear + step; y < endYear; y += step) ticks.push(y);
    ticks.push(endYear);
    return [...new Set(ticks)];
  }, [startYear, endYear, span]);

  if (sortedEvents.length === 0) {
    return (
      <div style={{ borderRadius: "var(--radius-xl)", border: "1px dashed var(--card-border)", background: "var(--card-bg)", padding: "28px 24px", textAlign: "center" }}>
        <div style={{ fontFamily: "var(--font-display)", fontSize: "16px", fontWeight: 700, color: "var(--text-primary)", marginBottom: "6px" }}>Your life roadmap is empty</div>
        <p style={{ fontSize: "13px", color: "var(--text-tertiary)", maxWidth: "440px", margin: "0 auto", lineHeight: 1.6 }}>
          Model a decision below — a home, a child, a car, a sabbatical — and add it to your plan. Each one lands here on your timeline and re-draws your forecast.
        </p>
      </div>
    );
  }

  const retirementYear = milestones.find((m) => m.kind === "retirement")?.year ?? null;

  return (
    <div style={{ borderRadius: "var(--radius-xl)", border: "1px solid var(--card-border)", background: "var(--card-bg)", padding: "18px 20px 14px" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "10px", flexWrap: "wrap", marginBottom: "4px" }}>
        <div style={{ fontFamily: "var(--font-display)", fontSize: "16px", fontWeight: 700, color: "var(--text-primary)" }}>Your Life Roadmap</div>
        <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
          {cats.map((c) => {
            const color = sortedEvents.map((e) => CAT(e.category)).find((x) => x.label === c)!.color;
            return (
              <span key={c} style={{ display: "inline-flex", alignItems: "center", gap: "5px", fontSize: "10px", color: "var(--text-tertiary)" }}>
                <span style={{ width: "7px", height: "7px", borderRadius: "50%", background: color }} />{c}
              </span>
            );
          })}
        </div>
      </div>
      <p style={{ fontSize: "12px", color: "var(--text-tertiary)", margin: "0 0 16px" }}>
        Every committed decision, on one timeline, with your projected net worth behind it.
        {conflictZones.length > 0 && (
          <span style={{ color: "var(--amber)" }}> Shaded bands flag years where major costs cluster.</span>
        )}
      </p>

      {/* Marker labels rail (above the track) */}
      <div style={{ position: "relative", height: "44px", marginBottom: "2px" }}>
        {sortedEvents.map((e, i) => {
          const left = xPct(e.year);
          const c = CAT(e.category);
          const up = i % 2 === 0; // alternate to reduce overlap
          return (
            <div key={e.id}
              onMouseEnter={() => setHover(e.id)} onMouseLeave={() => setHover(null)}
              style={{ position: "absolute", left: `${left}%`, transform: "translateX(-50%)", bottom: up ? "0" : "22px", zIndex: hover === e.id ? 5 : 1 }}>
              <div style={{
                whiteSpace: "nowrap", fontSize: "10px", fontWeight: 600, color: "var(--text-secondary)",
                background: "var(--bg-elevated)", border: `1px solid ${c.color}55`, borderRadius: "6px",
                padding: "2px 7px", display: "flex", alignItems: "center", gap: "5px",
              }} title={`${e.label} · ${e.year} · ${fmtK(e.amount)}`}>
                <span style={{ color: c.color, fontFamily: "var(--font-mono)" }}>{fmtK(e.amount)}</span>
                <span style={{ maxWidth: "90px", overflow: "hidden", textOverflow: "ellipsis" }}>{e.label}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Track */}
      <div style={{ position: "relative", height: "84px" }}>
        {/* Conflict zones — translucent bands where major costs cluster / cash gets tight */}
        {conflictZones.map((z, i) => {
          const left = xPct(z.startYear);
          const right = xPct(z.endYear);
          const width = Math.max(2, right - left);
          const color = z.severity === "critical" ? "var(--red)" : z.severity === "warning" ? "var(--amber)" : "var(--text-muted)";
          return (
            <div key={i} title={z.label}
              style={{ position: "absolute", left: `${left}%`, width: `${width}%`, top: 0, bottom: "18px",
                background: `color-mix(in oklch, ${color} 12%, transparent)`,
                borderLeft: `1px dashed color-mix(in oklch, ${color} 55%, transparent)`,
                borderRight: `1px dashed color-mix(in oklch, ${color} 55%, transparent)` }} />
          );
        })}
        {/* Trajectory area */}
        {areaPath && (
          <svg width="100%" height="84" viewBox="0 0 1000 100" preserveAspectRatio="none" style={{ position: "absolute", inset: 0 }}>
            <defs>
              <linearGradient id="roadmap-grad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#2563eb" stopOpacity="0.18" />
                <stop offset="100%" stopColor="#2563eb" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path d={areaPath.area} fill="url(#roadmap-grad)" />
            <path d={areaPath.line} fill="none" stroke="#3b82f6" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
          </svg>
        )}
        {/* Baseline axis line */}
        <div style={{ position: "absolute", left: 0, right: 0, bottom: "18px", height: "1px", background: "var(--border)" }} />

        {/* Retirement marker */}
        {retirementYear != null && retirementYear <= endYear && (
          <div style={{ position: "absolute", left: `${xPct(retirementYear)}%`, top: 0, bottom: "18px", width: "1px", background: "color-mix(in oklch, var(--green) 60%, transparent)", transform: "translateX(-0.5px)" }}>
            <span style={{ position: "absolute", top: "-2px", left: "4px", whiteSpace: "nowrap", fontSize: "9px", fontWeight: 700, color: "var(--green)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Retire {retirementYear}</span>
          </div>
        )}

        {/* Event dots on the axis */}
        {sortedEvents.map((e) => {
          const c = CAT(e.category);
          const dot = (
            <div style={{
              width: hover === e.id ? "13px" : "10px", height: hover === e.id ? "13px" : "10px",
              borderRadius: "50%", background: c.color, border: "2px solid var(--bg-card)",
              boxShadow: `0 0 0 1px ${c.color}`, transition: "all 0.12s", cursor: e.href ? "pointer" : "default",
            }} />
          );
          return (
            <div key={e.id}
              onMouseEnter={() => setHover(e.id)} onMouseLeave={() => setHover(null)}
              style={{ position: "absolute", left: `${xPct(e.year)}%`, bottom: "13px", transform: "translateX(-50%)", zIndex: hover === e.id ? 5 : 2 }}>
              {e.href ? <Link href={e.href} title={`Open ${c.label} planner`}>{dot}</Link> : dot}
            </div>
          );
        })}

        {/* Wealth milestone ticks */}
        {milestones.filter((m) => m.kind === "wealth").map((m) => (
          <div key={`${m.year}-${m.label}`} style={{ position: "absolute", left: `${xPct(m.year)}%`, bottom: "18px", transform: "translateX(-50%)" }}>
            <div style={{ width: "1px", height: "8px", background: "var(--text-muted)" }} />
            <span style={{ position: "absolute", top: "-14px", left: "50%", transform: "translateX(-50%)", whiteSpace: "nowrap", fontSize: "8px", color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>{m.label}</span>
          </div>
        ))}
      </div>

      {/* Year axis */}
      <div style={{ position: "relative", height: "16px", marginTop: "2px" }}>
        {yearTicks.map((y) => (
          <span key={y} style={{ position: "absolute", left: `${xPct(y)}%`, transform: "translateX(-50%)", fontSize: "10px", color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>
            {y === startYear ? "Now" : y}
          </span>
        ))}
      </div>
    </div>
  );
}
