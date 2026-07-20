"use client";

import { useState, useMemo, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { WeddingScenario } from "./wedding-actions";
import { saveWeddingScenario, deleteWeddingScenario } from "./wedding-actions";
import AddToPlanButton from "@/app/planning/add-to-plan-button";

function fmt(n: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

const COST_PER_GUEST = 275; // US all-in average for estimate helper

const BREAKDOWN: { label: string; pct: number; color: string }[] = [
  { label: "Catering & Bar", pct: 0.28, color: "oklch(0.72 0.15 200)" },
  { label: "Venue & Rentals", pct: 0.22, color: "oklch(0.68 0.16 280)" },
  { label: "Photo & Video", pct: 0.12, color: "oklch(0.72 0.19 145)" },
  { label: "Flowers & Decor", pct: 0.10, color: "oklch(0.72 0.15 340)" },
  { label: "Music & Entertainment", pct: 0.08, color: "oklch(0.78 0.16 70)" },
  { label: "Attire & Beauty", pct: 0.08, color: "oklch(0.70 0.19 25)" },
  { label: "Rings", pct: 0.04, color: "oklch(0.75 0.13 90)" },
  { label: "Invitations", pct: 0.03, color: "oklch(0.65 0.12 250)" },
  { label: "Other & Buffer", pct: 0.05, color: "var(--text-muted)" },
];

const inputStyle: React.CSSProperties = { width: "100%", padding: "9px 11px", borderRadius: "8px", border: "1px solid var(--border-subtle)", background: "var(--bg-base)", color: "var(--text-primary)", fontSize: "14px", fontFamily: "var(--font-body)", outline: "none", boxSizing: "border-box" };
const labelStyle: React.CSSProperties = { display: "block", fontSize: "10px", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--text-tertiary)", marginBottom: "6px" };
const cardStyle: React.CSSProperties = { background: "var(--bg-card)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-lg, 14px)", padding: "16px 18px" };

function monthsUntil(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const target = new Date(dateStr + "T00:00:00");
  const now = new Date();
  const m = (target.getFullYear() - now.getFullYear()) * 12 + (target.getMonth() - now.getMonth());
  return Math.max(0, m);
}

export default function WeddingClient({ scenarios, liquidAssets }: { scenarios: WeddingScenario[]; liquidAssets: number }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const active = scenarios[0] ?? null;

  const [name, setName] = useState(active?.name ?? "Our wedding");
  const [weddingDate, setWeddingDate] = useState<string>(active?.wedding_date ?? "");
  const [guestCount, setGuestCount] = useState<number>(active?.guest_count ?? 100);
  const [totalBudget, setTotalBudget] = useState<number>(active?.total_budget ?? 30000);
  const [amountSaved, setAmountSaved] = useState<number>(active?.amount_saved ?? 0);
  const [monthly, setMonthly] = useState<number>(active?.monthly_contribution ?? 0);
  const [contributions, setContributions] = useState<number>(0); // family / gifts toward the wedding
  const [saved, setSaved] = useState(false);

  const months = monthsUntil(weddingDate);
  const costPerGuest = guestCount > 0 ? totalBudget / guestCount : 0;
  const funded = amountSaved + contributions; // money already in hand toward the budget
  const remaining = Math.max(0, totalBudget - funded);
  const requiredMonthly = months && months > 0 ? remaining / months : null;
  const projectedSaved = months != null ? funded + monthly * months : funded;
  const projectedGap = totalBudget - projectedSaved; // >0 = short
  const onTrack = requiredMonthly != null ? monthly >= requiredMonthly - 1 : null;
  // Reverse-solve: what you can actually afford by the date at the current pace.
  const affordable = funded + monthly * (months ?? 0);
  const affordableGuests = costPerGuest > 0 ? Math.floor(affordable / (totalBudget / guestCount)) : null;

  function handleSave() {
    startTransition(async () => {
      const res = await saveWeddingScenario(
        { name: name.trim() || "Our wedding", wedding_date: weddingDate || null, guest_count: guestCount, total_budget: totalBudget, amount_saved: amountSaved, monthly_contribution: monthly, notes: null },
        active?.id
      );
      if (!res.error) { setSaved(true); router.refresh(); }
    });
  }
  function handleDelete() {
    if (!active || !confirm("Delete this wedding plan?")) return;
    startTransition(async () => { await deleteWeddingScenario(active.id); router.refresh(); });
  }

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
          <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)" }}>Wedding</span>
        </div>
        <div style={{ display: "flex", alignItems: "baseline", gap: "10px" }}>
          <span style={{ fontSize: "16px", fontWeight: 700 }}>Wedding Planner</span>
          <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>Budget, savings timeline, and where it goes</span>
        </div>
      </div>

      {/* Body */}
      <div className="bt-page-content" style={{ flex: 1, overflowY: "auto", padding: "20px 24px 80px", display: "flex", flexDirection: "column", gap: "16px", maxWidth: "1000px", width: "100%", margin: "0 auto" }}>

        {/* Verdict hero */}
        {(() => {
          const heroColor = onTrack == null ? "var(--brand-blue, #0ea5a0)" : onTrack ? "var(--green)" : "var(--red)";
          const heroLabel = onTrack == null ? "Set a date to see your timeline" : onTrack ? "On track" : "Behind pace";
          return (
            <div style={{ ...cardStyle, background: `linear-gradient(135deg, color-mix(in srgb, ${heroColor} 8%, var(--bg-card)), var(--bg-card))`, border: `1px solid color-mix(in srgb, ${heroColor} 28%, transparent)` }}>
              <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
                <div>
                  <div style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: heroColor }}>{heroLabel}</div>
                  <div style={{ fontSize: "26px", fontWeight: 800, fontFamily: "var(--font-display)", letterSpacing: "-1px", color: "var(--text-primary)", lineHeight: 1.1, marginTop: "2px" }}>
                    {fmt(totalBudget)}<span style={{ fontSize: "14px", color: "var(--text-tertiary)", fontWeight: 600 }}> budget</span>
                  </div>
                  <div style={{ fontSize: "11px", color: "var(--text-tertiary)", marginTop: "2px" }}>{guestCount} guests · {fmt(Math.round(costPerGuest))}/guest{months != null ? ` · ${months} mo out` : ""}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: "10px", color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Funded so far</div>
                  <div style={{ fontSize: "22px", fontWeight: 800, fontFamily: "var(--font-mono)", color: "var(--text-primary)" }}>{fmt(funded)}</div>
                  <div style={{ fontSize: "10px", color: remaining > 0 ? "var(--amber, #f59e0b)" : "var(--green)" }}>{remaining > 0 ? `${fmt(remaining)} to go` : "fully funded"}</div>
                </div>
              </div>
              {/* funded progress */}
              <div style={{ position: "relative", height: "7px", borderRadius: "3.5px", background: "var(--surface-006)", marginTop: "14px", overflow: "hidden" }}>
                <div style={{ position: "absolute", inset: 0, width: `${totalBudget > 0 ? Math.min(100, (funded / totalBudget) * 100) : 0}%`, background: heroColor, borderRadius: "3.5px", transition: "width 0.6s cubic-bezier(0.16,1,0.3,1)" }} />
              </div>
            </div>
          );
        })()}

        {/* Inputs */}
        <div style={cardStyle}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "14px" }}>
            <div>
              <label style={labelStyle}>Wedding date</label>
              <input style={inputStyle} type="date" value={weddingDate} onChange={(e) => { setWeddingDate(e.target.value); setSaved(false); }} />
            </div>
            <div>
              <label style={labelStyle}>Guest count</label>
              <input style={inputStyle} type="number" min="0" value={guestCount || ""} onChange={(e) => { setGuestCount(Number(e.target.value)); setSaved(false); }} />
            </div>
            <div>
              <label style={labelStyle}>Total budget</label>
              <input style={inputStyle} type="number" min="0" value={totalBudget || ""} onChange={(e) => { setTotalBudget(Number(e.target.value)); setSaved(false); }} />
            </div>
            <div>
              <label style={labelStyle}>Saved so far</label>
              <input style={inputStyle} type="number" min="0" value={amountSaved || ""} onChange={(e) => { setAmountSaved(Number(e.target.value)); setSaved(false); }} />
            </div>
            <div>
              <label style={labelStyle}>Saving / month</label>
              <input style={inputStyle} type="number" min="0" value={monthly || ""} onChange={(e) => { setMonthly(Number(e.target.value)); setSaved(false); }} />
            </div>
            <div>
              <label style={labelStyle}>Family / gifts</label>
              <input style={inputStyle} type="number" min="0" value={contributions || ""} onChange={(e) => { setContributions(Number(e.target.value)); setSaved(false); }} placeholder="0" />
            </div>
          </div>
          <div style={{ display: "flex", gap: "10px", marginTop: "12px", flexWrap: "wrap" }}>
            <button type="button" onClick={() => { setTotalBudget(guestCount * COST_PER_GUEST); setSaved(false); }}
              style={{ fontSize: "11px", padding: "5px 10px", borderRadius: "7px", border: "1px solid var(--border-subtle)", background: "var(--bg-base)", color: "var(--text-secondary)", cursor: "pointer", fontFamily: "var(--font-body)" }}>
              Estimate from guests (~{fmt(COST_PER_GUEST)}/guest)
            </button>
            {liquidAssets > 0 && (
              <button type="button" onClick={() => { setAmountSaved(liquidAssets); setSaved(false); }}
                style={{ fontSize: "11px", padding: "5px 10px", borderRadius: "7px", border: "1px solid var(--border-subtle)", background: "var(--bg-base)", color: "var(--text-secondary)", cursor: "pointer", fontFamily: "var(--font-body)" }}>
                Use my cash ({fmt(liquidAssets)})
              </button>
            )}
          </div>
        </div>

        {/* Savings status */}
        <div style={cardStyle}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "14px 10px" }}>
            <Metric label="Cost / guest" value={fmt(Math.round(costPerGuest))} sub={`${guestCount} guests`} />
            <Metric label="Still to save" value={fmt(remaining)} sub={`of ${fmt(totalBudget)}`} />
            <Metric
              label="Need / month"
              value={requiredMonthly != null ? fmt(Math.ceil(requiredMonthly)) : "—"}
              sub={months != null ? `over ${months} mo` : "set a date"}
              accent={onTrack == null ? undefined : onTrack ? "var(--green)" : "var(--red)"}
            />
          </div>

          {months != null && (
            <div style={{ marginTop: "14px", padding: "10px 12px", borderRadius: "10px",
              background: onTrack ? "rgba(34,197,94,0.08)" : "rgba(239,68,68,0.08)",
              border: `1px solid ${onTrack ? "rgba(34,197,94,0.18)" : "rgba(239,68,68,0.18)"}`,
              fontSize: "12px", color: "var(--text-secondary)", lineHeight: 1.5 }}>
              {onTrack
                ? `On track — saving ${fmt(monthly)}/mo${contributions > 0 ? ` plus ${fmt(contributions)} from family` : ""} covers the ${fmt(remaining)} gap with ${projectedGap < 0 ? `${fmt(Math.abs(Math.round(projectedGap)))} to spare` : "time to spare"}.`
                : monthly > 0
                ? `Short by ${fmt(Math.abs(Math.round(projectedGap)))}. Bump savings to ${fmt(Math.ceil(requiredMonthly ?? 0))}/mo, trim the budget, or push the date.`
                : `Set a monthly savings amount to see if you'll hit ${fmt(totalBudget)} by the date.`}
            </div>
          )}

          {/* Reverse-solve: what's actually affordable by the date */}
          {months != null && guestCount > 0 && affordableGuests != null && (
            <p style={{ fontSize: "11px", color: "var(--text-tertiary)", marginTop: "10px", lineHeight: 1.55 }}>
              On this pace you{"'"}ll have <strong style={{ color: "var(--text-secondary)", fontFamily: "var(--font-mono)" }}>{fmt(Math.round(affordable))}</strong> by the date
              {affordableGuests < guestCount
                ? <> — about <strong style={{ color: "var(--text-secondary)" }}>{affordableGuests} guests</strong> at today{"'"}s per-guest cost. Trimming the list is often the fastest way to close the gap.</>
                : <>, comfortably covering your {guestCount}-guest plan.</>}
            </p>
          )}

          {/* Savings timeline — cumulative savings vs the budget line */}
          {months != null && months > 0 && totalBudget > 0 && (() => {
            const W = 320, H = 90, pad = 6;
            const end = funded + monthly * months;
            const yMax = Math.max(totalBudget, end, funded) * 1.05 || 1;
            const x = (m: number) => (m / months) * W;
            const y = (v: number) => H - pad - (v / yMax) * (H - 2 * pad);
            const savePath = `M${x(0).toFixed(1)},${y(funded).toFixed(1)} L${x(months).toFixed(1)},${y(end).toFixed(1)}`;
            const targetY = y(totalBudget);
            // crossover month where savings meets the budget
            const crossM = monthly > 0 && funded < totalBudget ? (totalBudget - funded) / monthly : null;
            const reachesInTime = crossM != null && crossM <= months;
            return (
              <div style={{ marginTop: "14px" }}>
                <div style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-tertiary)", marginBottom: "8px" }}>Savings timeline</div>
                <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: "100%", height: "90px", display: "block" }}>
                  <line x1="0" y1={targetY} x2={W} y2={targetY} stroke="rgba(148,163,184,0.5)" strokeWidth="1" strokeDasharray="4 3" />
                  <path d={savePath} fill="none" stroke={reachesInTime || end >= totalBudget ? "var(--green, #22c55e)" : "var(--red, #ef4444)"} strokeWidth="2" strokeLinecap="round" />
                  {crossM != null && reachesInTime && <circle cx={x(crossM)} cy={targetY} r="3.5" fill="var(--green, #22c55e)" />}
                </svg>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "10px", color: "var(--text-muted)", marginTop: "4px" }}>
                  <span>today · {fmt(funded)}</span>
                  <span style={{ color: "var(--text-tertiary)" }}>— — budget {fmt(totalBudget)}</span>
                  <span>wedding · {fmt(Math.round(end))}</span>
                </div>
                {crossM != null && reachesInTime && (
                  <p style={{ fontSize: "10.5px", color: "var(--green)", marginTop: "6px" }}>You hit the budget about {Math.ceil(crossM)} month{Math.ceil(crossM) === 1 ? "" : "s"} in — {months - Math.ceil(crossM)} to spare.</p>
                )}
              </div>
            );
          })()}
        </div>

        {/* Budget breakdown */}
        {totalBudget > 0 && (
          <div style={cardStyle}>
            <span style={{ fontFamily: "var(--font-display)", fontSize: "13px", fontWeight: 700, display: "block", marginBottom: "12px" }}>Where It Typically Goes</span>
            <div style={{ display: "flex", height: "12px", borderRadius: "6px", overflow: "hidden", marginBottom: "14px" }}>
              {BREAKDOWN.map((b) => <div key={b.label} style={{ width: `${b.pct * 100}%`, background: b.color }} title={`${b.label}: ${fmt(totalBudget * b.pct)}`} />)}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "8px 16px" }}>
              {BREAKDOWN.map((b) => (
                <div key={b.label} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <span style={{ width: "9px", height: "9px", borderRadius: "2px", background: b.color, flexShrink: 0 }} />
                  <span style={{ flex: 1, fontSize: "12px", color: "var(--text-secondary)" }}>{b.label}</span>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: "12px", fontWeight: 600 }}>{fmt(Math.round(totalBudget * b.pct))}</span>
                </div>
              ))}
            </div>
            <p style={{ fontSize: "10px", color: "var(--text-tertiary)", marginTop: "12px", lineHeight: 1.5 }}>Industry-average splits — adjust your real allocations as you book vendors.</p>
          </div>
        )}

        {/* Add to plan */}
        {totalBudget > 0 && (
          <div style={cardStyle}>
            <span style={{ fontFamily: "var(--font-display)", fontSize: "13px", fontWeight: 700, display: "block", marginBottom: "10px" }}>Add to your plan</span>
            <AddToPlanButton
              label={`${name.trim() || "Wedding"}`}
              category="wedding"
              amountImpact={-totalBudget}
              defaultYear={weddingDate ? new Date(weddingDate).getFullYear() : undefined}
              note={`Models the full ${fmt(totalBudget)} budget as a one-time cost that year, so it flows into your retirement forecast.`}
            />
          </div>
        )}

        {/* Save row */}
        <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
          <input style={{ ...inputStyle, width: "200px" }} value={name} onChange={(e) => { setName(e.target.value); setSaved(false); }} placeholder="Plan name" />
          <button type="button" onClick={handleSave} disabled={pending} style={{ padding: "9px 18px", borderRadius: "8px", border: "none", background: pending ? "rgba(14,165,160,0.5)" : "var(--brand-blue, #0ea5a0)", color: "#fff", fontSize: "13px", fontWeight: 600, cursor: pending ? "not-allowed" : "pointer", fontFamily: "var(--font-body)" }}>
            {pending ? "Saving…" : active ? "Update plan" : "Save plan"}
          </button>
          {active && (
            <button type="button" onClick={handleDelete} disabled={pending} style={{ padding: "9px 14px", borderRadius: "8px", border: "1px solid var(--border-subtle)", background: "var(--bg-card)", color: "var(--text-secondary)", fontSize: "13px", fontWeight: 500, cursor: "pointer", fontFamily: "var(--font-body)" }}>
              Delete
            </button>
          )}
          {saved && <span style={{ fontSize: "12px", color: "var(--green)" }}>Saved</span>}
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: string }) {
  return (
    <div>
      <div style={{ fontSize: "10px", color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "5px" }}>{label}</div>
      <div style={{ fontSize: "22px", fontWeight: 700, fontFamily: "var(--font-display)", letterSpacing: "-0.5px", color: accent ?? "var(--text-primary)", lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: "10px", color: "var(--text-tertiary)", marginTop: "5px" }}>{sub}</div>}
    </div>
  );
}
