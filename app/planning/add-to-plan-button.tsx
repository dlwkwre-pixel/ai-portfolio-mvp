"use client";

import { useState, useTransition } from "react";
import { addFutureEvent } from "@/app/planning/planning-actions";

// Commits a planner scenario to the master plan as a future event (with a
// user-chosen year), so it flows into the forecast + Monte Carlo. Used by the
// year-less planners (car, wedding, windfall, relocation, sabbatical, …).
export default function AddToPlanButton({
  label,
  category,
  amountImpact,
  defaultYear,
  note,
  recurringAnnual,
  endYear,
}: {
  label: string;
  category: string;
  amountImpact: number;        // signed one-time: negative = cost, positive = inflow
  defaultYear?: number;
  note?: string;               // optional one-liner shown under the control
  recurringAnnual?: number;    // signed $/yr from the chosen year onward (requires migration)
  endYear?: number | null;     // last year the stream applies (omit = forecast horizon)
}) {
  const cy = new Date().getFullYear();
  const [year, setYear] = useState(defaultYear ?? cy + 1);
  const [pending, start] = useTransition();
  const [done, setDone] = useState<null | "committed" | "preview">(null);
  const [error, setError] = useState("");

  function add(mode: "committed" | "preview") {
    if (!amountImpact && !recurringAnnual) return;
    setError("");
    start(async () => {
      try {
        const fd = new FormData();
        fd.set("label", label.slice(0, 80));
        fd.set("event_year", String(year));
        fd.set("amount_impact", String(Math.round(amountImpact)));
        fd.set("category", category);
        if (recurringAnnual) {
          fd.set("recurring_annual", String(Math.round(recurringAnnual)));
          if (endYear != null) fd.set("end_year", String(endYear));
        }
        if (mode === "preview") fd.set("included", "false");
        const r = await addFutureEvent(fd);
        if (r?.error) throw new Error(r.error);
        setDone(mode);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not add to plan.");
      }
    });
  }

  if (done) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "10px 14px", borderRadius: "var(--radius-md)", background: "var(--green-bg)", border: "1px solid var(--green-border)" }}>
        <svg width="15" height="15" viewBox="0 0 20 20" fill="var(--green)" style={{ flexShrink: 0 }}><path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" /></svg>
        <span style={{ fontSize: "12px", color: "var(--text-secondary)", flex: 1 }}>
          {done === "preview"
            ? `Saved as Considering for ${year} — toggle its pin on the trajectory to see how it changes your retirement odds, then commit it.`
            : `Added to your plan for ${year} — it now feeds your forecast and Life Plan timeline.`}
        </span>
        <a href="/planning?tab=events" style={{ fontSize: "12px", fontWeight: 600, color: "var(--brand-blue)", textDecoration: "none", whiteSpace: "nowrap" }}>See your Life Plan →</a>
      </div>
    );
  }

  const disabled = pending || (!amountImpact && !recurringAnnual);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
        <span style={{ fontSize: "12px", color: "var(--text-tertiary)" }}>Add this to my plan in</span>
        <input
          type="number" min={cy} max={cy + 50} value={year} aria-label="Plan year"
          onChange={(e) => setYear(Number(e.target.value) || cy + 1)}
          style={{ width: "84px", background: "var(--bg-base)", border: "1px solid var(--card-border)", borderRadius: "8px", padding: "6px 10px", fontSize: "13px", color: "var(--text-primary)", fontFamily: "var(--font-mono)", outline: "none" }}
        />
        <button
          type="button" onClick={() => add("committed")} disabled={disabled}
          style={{ padding: "7px 15px", borderRadius: "var(--radius-md)", border: "none", background: "var(--brand-gradient)", color: "#fff", fontSize: "12px", fontWeight: 600, cursor: "pointer", opacity: disabled ? 0.6 : 1, whiteSpace: "nowrap" }}
        >
          {pending ? "Adding…" : "Add to plan"}
        </button>
        <button
          type="button" onClick={() => add("preview")} disabled={disabled}
          title="Save as Considering — see its impact on the trajectory before it counts in your forecast"
          style={{ padding: "7px 13px", borderRadius: "var(--radius-md)", border: "1px solid var(--card-border)", background: "var(--bg-elevated)", color: "var(--text-secondary)", fontSize: "12px", fontWeight: 600, cursor: "pointer", opacity: disabled ? 0.6 : 1, whiteSpace: "nowrap" }}
        >
          Preview first
        </button>
      </div>
      {note && <p style={{ fontSize: "11px", color: "var(--text-muted)", margin: 0 }}>{note}</p>}
      {error && <p style={{ fontSize: "11px", color: "var(--red)", margin: 0 }}>{error}</p>}
    </div>
  );
}
