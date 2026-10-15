"use client";

import { useState, useTransition } from "react";
import type { UnusualCharge } from "@/lib/planning/unusual-charges";
import { dismissUnusualCharges } from "./planning-actions";
import { MONTH_NAMES } from "./planning-shared";

// "Worth a look": possible double charges, spikes, and big first charges from the last 30
// days. Marking one "Looks fine" hides it for good; nothing is changed or deleted.

const LABEL: Record<UnusualCharge["kind"], string> = {
  duplicate: "Possible double charge",
  spike: "Much bigger than usual",
  new_big: "Big first charge",
};

function shortDate(iso: string): string {
  return `${MONTH_NAMES[Number(iso.slice(5, 7)) - 1].slice(0, 3)} ${Number(iso.slice(8, 10))}`;
}

export default function UnusualChargesCard({ alerts, isPrivate }: { alerts: UnusualCharge[]; isPrivate: boolean }) {
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [, startTransition] = useTransition();
  const shown = alerts.filter((a) => !hidden.has(a.id));
  if (shown.length === 0) return null;

  const money = (n: number) => (isPrivate ? "••••" : `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
  const dismiss = (ids: string[]) => {
    setHidden((prev) => new Set([...prev, ...ids]));
    startTransition(() => { void dismissUnusualCharges(ids); });
  };

  return (
    <div role="region" aria-label="Charges worth a look" style={{ background: "var(--bg-surface)", border: "1px solid var(--amber)", borderRadius: "var(--radius-lg)", padding: "14px 18px", marginBottom: "10px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "8px", flexWrap: "wrap" }}>
        <span style={{ fontSize: "var(--text-sm)", fontWeight: 700, color: "var(--text-primary)", fontFamily: "var(--font-body)" }}>
          {`Worth a look · ${shown.length}`}
        </span>
        {shown.length > 1 && (
          <button type="button" onClick={() => dismiss(shown.map((a) => a.id))}
            style={{ minHeight: "32px", background: "none", border: "none", padding: 0, color: "var(--text-tertiary)", fontSize: "var(--text-xs)", fontFamily: "var(--font-body)", cursor: "pointer", textDecoration: "underline", textUnderlineOffset: "2px" }}>
            All look fine
          </button>
        )}
      </div>
      <p style={{ margin: "2px 0 8px", fontSize: "var(--text-xs)", color: "var(--text-tertiary)", fontFamily: "var(--font-body)", lineHeight: 1.5 }}>
        Unusual charges from the last 30 days. If one is wrong, contact your bank or card to dispute it.
      </p>
      {shown.map((a) => (
        <div key={a.id} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "8px 0", borderTop: "1px solid var(--border-subtle)" }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: "var(--text-2xs)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--amber)", fontFamily: "var(--font-body)" }}>{LABEL[a.kind]}</div>
            <div style={{ fontSize: "var(--text-sm)", color: "var(--text-primary)", fontFamily: "var(--font-body)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {a.txn.merchant}
              <span style={{ color: "var(--text-tertiary)" }}>{` · ${shortDate(a.txn.txn_date)}`}</span>
            </div>
            <div style={{ fontSize: "var(--text-xs)", color: "var(--text-secondary)", fontFamily: "var(--font-body)", lineHeight: 1.4 }}>
              {isPrivate ? LABEL[a.kind] : a.detail}
              {a.kind === "duplicate" && a.otherDate ? ` First one: ${shortDate(a.otherDate)}.` : ""}
            </div>
          </div>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-sm)", fontWeight: 600, color: "var(--text-primary)", flexShrink: 0 }}>{money(a.txn.amount)}</span>
          <button type="button" onClick={() => dismiss([a.id])}
            style={{ minHeight: "44px", padding: "0 12px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-subtle)", background: "transparent", color: "var(--text-secondary)", fontSize: "var(--text-xs)", fontWeight: 600, fontFamily: "var(--font-body)", cursor: "pointer", flexShrink: 0 }}>
            Looks fine
          </button>
        </div>
      ))}
    </div>
  );
}
