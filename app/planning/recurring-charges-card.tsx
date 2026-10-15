"use client";

import { useState } from "react";
import type { RecurringCharge } from "@/lib/planning/transactions";
import { MONTH_NAMES } from "./planning-shared";

// Bills and subscriptions found in imported/bank transactions — a watchdog, not just a
// list: what they cost per year, which ones changed price, and which may have stopped.

function monthYear(iso: string): string {
  return `${MONTH_NAMES[Number(iso.slice(5, 7)) - 1].slice(0, 3)} ${iso.slice(0, 4)}`;
}

export default function RecurringChargesCard({
  charges, bucketLabel, isPrivate,
}: {
  charges: RecurringCharge[];
  bucketLabel: (id: string | null) => string | null;
  isPrivate: boolean;
}) {
  const [showAll, setShowAll] = useState(false);
  if (charges.length === 0) return null;
  const money = (n: number, cents = true) => (isPrivate ? "••••" : `$${n.toLocaleString(undefined, { minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: cents ? 2 : 0 })}`);
  const active = charges.filter((c) => !c.stale);
  const stopped = charges.filter((c) => c.stale);
  const monthly = active.reduce((s, c) => s + c.latest, 0);
  const increased = active.filter((c) => c.increase > 0);
  const extraPerYear = increased.reduce((s, c) => s + c.increase * 12, 0);
  const visible = showAll ? charges : [...active.slice(0, 10), ...(active.length < 10 ? stopped.slice(0, 10 - active.length) : [])];

  return (
    <div className="cfo-zone" style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-lg)", padding: "16px 20px", marginBottom: "10px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "8px", flexWrap: "wrap", marginBottom: "4px" }}>
        <span style={{ fontSize: "var(--text-sm)", fontWeight: 700, color: "var(--text-primary)", fontFamily: "var(--font-body)" }}>Bills &amp; subscriptions</span>
        <span style={{ fontSize: "var(--text-xs)", color: "var(--text-tertiary)", fontFamily: "var(--font-body)" }}>
          <span style={{ fontFamily: "var(--font-mono)", color: "var(--text-secondary)" }}>{money(monthly)}</span>{" a month · "}
          <span style={{ fontFamily: "var(--font-mono)", color: "var(--text-primary)", fontWeight: 600 }}>{money(monthly * 12, false)}</span>{" a year"}
        </span>
      </div>
      <p style={{ margin: "0 0 10px", fontSize: "var(--text-xs)", color: "var(--text-tertiary)", fontFamily: "var(--font-body)", lineHeight: 1.5 }}>
        {"Charged about once a month at nearly the same price, 3 months or more."}
        {increased.length > 0 && (
          <span style={{ color: "var(--amber)", fontWeight: 600 }}>
            {` ${increased.length} went up recently, costing you ${money(extraPerYear, false)} more a year.`}
          </span>
        )}
        {stopped.length > 0 && ` ${stopped.length} haven't charged in 45+ days and may have ended, so they're left out of the total.`}
      </p>
      <div style={{ display: "flex", flexDirection: "column" }}>
        {visible.map((c) => {
          const bucket = bucketLabel(c.bucketId);
          return (
            <div key={c.key} style={{ display: "flex", justifyContent: "space-between", gap: "10px", alignItems: "center", padding: "7px 0", borderTop: "1px solid var(--border-subtle)", opacity: c.stale ? 0.6 : 1 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: "var(--text-sm)", color: "var(--text-primary)", fontFamily: "var(--font-body)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.merchant}</div>
                <div style={{ fontSize: "var(--text-2xs)", color: "var(--text-tertiary)", fontFamily: "var(--font-body)" }}>
                  {c.stale
                    ? `may have stopped · last ${monthYear(c.lastDate)}`
                    : `since ${monthYear(c.since)} · last ${MONTH_NAMES[Number(c.lastDate.slice(5, 7)) - 1].slice(0, 3)} ${Number(c.lastDate.slice(8, 10))}${bucket ? ` · ${bucket}` : " · not sorted"}`}
                </div>
              </div>
              <div style={{ textAlign: "right", flexShrink: 0 }}>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-sm)", color: "var(--text-primary)" }}>{money(c.latest)}</div>
                {!c.stale && c.increase > 0 && c.previous !== null ? (
                  <div style={{ fontSize: "var(--text-2xs)", fontFamily: "var(--font-mono)", color: "var(--amber)" }}>
                    {`up from ${money(c.previous)}${c.previousDate ? ` (${MONTH_NAMES[Number(c.previousDate.slice(5, 7)) - 1].slice(0, 3)})` : ""}`}
                  </div>
                ) : !c.stale && c.decrease > 0 && c.previous !== null ? (
                  <div style={{ fontSize: "var(--text-2xs)", fontFamily: "var(--font-mono)", color: "var(--green)" }}>{`down from ${money(c.previous)}`}</div>
                ) : (
                  <div style={{ fontSize: "var(--text-2xs)", fontFamily: "var(--font-mono)", color: "var(--text-tertiary)" }}>{`${money(c.yearly, false)}/yr`}</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {charges.length > visible.length && (
        <button type="button" onClick={() => setShowAll(true)}
          style={{ marginTop: "6px", minHeight: "36px", background: "none", border: "none", padding: 0, color: "var(--brand-blue)", fontSize: "var(--text-xs)", fontWeight: 600, fontFamily: "var(--font-body)", cursor: "pointer" }}>
          {`Show all ${charges.length}`}
        </button>
      )}
    </div>
  );
}
