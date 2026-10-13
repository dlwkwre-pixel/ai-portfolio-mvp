"use client";

import type { RecurringCharge } from "@/lib/planning/transactions";
import { MONTH_NAMES } from "./planning-shared";

// Charges that hit every month at a steady amount, found in imported transactions. The
// point is awareness: what you're committed to each month, and which ones crept up.

export default function RecurringChargesCard({
  charges, bucketLabel, isPrivate,
}: {
  charges: RecurringCharge[];
  bucketLabel: (id: string | null) => string | null;
  isPrivate: boolean;
}) {
  if (charges.length === 0) return null;
  const money = (n: number) => (isPrivate ? "••••" : `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
  const total = charges.reduce((s, c) => s + c.latest, 0);
  const increased = charges.filter((c) => c.increase > 0);

  return (
    <div className="cfo-zone" style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-lg)", padding: "16px 20px", marginBottom: "10px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "8px", flexWrap: "wrap", marginBottom: "4px" }}>
        <span style={{ fontSize: "var(--text-sm)", fontWeight: 700, color: "var(--text-primary)", fontFamily: "var(--font-body)" }}>Bills &amp; subscriptions</span>
        <span style={{ fontSize: "var(--text-xs)", color: "var(--text-tertiary)", fontFamily: "var(--font-body)" }}>
          about <span style={{ fontFamily: "var(--font-mono)", color: "var(--text-secondary)" }}>{money(total)}</span> a month
        </span>
      </div>
      <p style={{ margin: "0 0 10px", fontSize: "var(--text-xs)", color: "var(--text-tertiary)", fontFamily: "var(--font-body)", lineHeight: 1.5 }}>
        Charged about once a month at nearly the same price, 3 months or more.
        {increased.length > 0 && ` ${increased.length} went up recently.`}
      </p>
      <div style={{ display: "flex", flexDirection: "column" }}>
        {charges.slice(0, 12).map((c) => {
          const bucket = bucketLabel(c.bucketId);
          return (
            <div key={c.key} style={{ display: "flex", justifyContent: "space-between", gap: "10px", alignItems: "center", padding: "7px 0", borderTop: "1px solid var(--border-subtle)" }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: "var(--text-sm)", color: "var(--text-primary)", fontFamily: "var(--font-body)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.merchant}</div>
                <div style={{ fontSize: "var(--text-2xs)", color: "var(--text-tertiary)", fontFamily: "var(--font-body)" }}>
                  {`${c.months} months · last ${MONTH_NAMES[Number(c.lastDate.slice(5, 7)) - 1]} ${Number(c.lastDate.slice(8, 10))}${bucket ? ` · ${bucket}` : " · not sorted"}`}
                </div>
              </div>
              <div style={{ textAlign: "right", flexShrink: 0 }}>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-sm)", color: "var(--text-primary)" }}>{money(c.latest)}</div>
                {c.increase > 0 && c.previous !== null && (
                  <div style={{ fontSize: "var(--text-2xs)", fontFamily: "var(--font-mono)", color: "var(--amber)" }}>
                    {`up ${money(c.increase)} from ${money(c.previous)}${c.previousDate ? ` in ${MONTH_NAMES[Number(c.previousDate.slice(5, 7)) - 1]}` : ""}`}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
