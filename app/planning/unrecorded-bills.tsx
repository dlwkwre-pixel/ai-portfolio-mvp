"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { recordBillPaid } from "./planning-actions";
import { MONTH_NAMES } from "./planning-shared";

// Planned budget lines with nothing recorded for the month. Until something is recorded,
// the page assumes the full budget was spent — this list makes that assumption visible and
// lets fixed bills (rent, phone, insurance) become real numbers with one tap.

export type UnrecordedLine = { id: string; label: string; planned: number; dueDay: number | null };

const PAGE = 6;

export default function UnrecordedBills({
  lines, selYear, selMonth, isPrivate,
}: {
  lines: UnrecordedLine[];
  selYear: number;
  selMonth: number;
  isPrivate: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [showAll, setShowAll] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  if (lines.length === 0) return null;
  const total = lines.reduce((s, l) => s + l.planned, 0);
  const shown = showAll ? lines : lines.slice(0, PAGE);
  const money = (n: number) => (isPrivate ? "••••" : `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`);

  function record(line: UnrecordedLine) {
    const raw = amounts[line.id];
    const amount = raw !== undefined && raw !== "" ? Number(raw) : line.planned;
    setError(null);
    setBusyId(line.id);
    startTransition(async () => {
      const res = await recordBillPaid(line.id, selYear, selMonth, amount);
      setBusyId(null);
      if (res.error) { setError(res.error); return; }
      router.refresh();
    });
  }

  return (
    <div style={{ border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-md)", padding: "10px 12px", marginBottom: "14px", display: "flex", flexDirection: "column", gap: "8px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "8px", flexWrap: "wrap" }}>
        <span style={{ fontSize: "var(--text-sm)", fontWeight: 600, color: "var(--text-primary)", fontFamily: "var(--font-body)" }}>
          Planned, not recorded yet
        </span>
        <span style={{ fontSize: "var(--text-xs)", color: "var(--text-tertiary)", fontFamily: "var(--font-body)" }}>
          <span style={{ fontFamily: "var(--font-mono)", color: "var(--text-secondary)" }}>{money(total)}</span> assumed for {MONTH_NAMES[selMonth - 1]}
        </span>
      </div>
      <p style={{ margin: 0, fontSize: "var(--text-xs)", color: "var(--text-tertiary)", fontFamily: "var(--font-body)", lineHeight: 1.5 }}>
        Until you record these, the page assumes you spent the full plan. Tap Paid for fixed bills, or change the amount first.
      </p>
      {shown.map((l) => (
        <div key={l.id} style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 92px auto", gap: "8px", alignItems: "center" }}>
          <span style={{ fontSize: "var(--text-sm)", color: "var(--text-primary)", fontFamily: "var(--font-body)", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {l.label}
            {l.dueDay != null && <span style={{ color: "var(--text-tertiary)", fontSize: "var(--text-xs)" }}> · due the {l.dueDay}{ordinal(l.dueDay)}</span>}
          </span>
          <input
            type="number" min="0.01" step="0.01" inputMode="decimal"
            aria-label={`Amount paid for ${l.label}`}
            value={amounts[l.id] ?? String(Math.round(l.planned * 100) / 100)}
            onChange={(e) => setAmounts((a) => ({ ...a, [l.id]: e.target.value }))}
            style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-sm)", color: "var(--text-primary)", fontFamily: "var(--font-mono)", fontSize: "var(--text-xs)", padding: "6px 8px", minHeight: "36px", width: "100%", boxSizing: "border-box", textAlign: "right" }}
          />
          <button type="button" onClick={() => record(l)} disabled={pending}
            style={{ minHeight: "36px", padding: "0 12px", borderRadius: "var(--radius-sm)", border: "1px solid var(--green-border)", background: "var(--green-bg)", color: "var(--green)", fontFamily: "var(--font-body)", fontSize: "var(--text-xs)", fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}>
            {busyId === l.id ? "Saving…" : "Paid ✓"}
          </button>
        </div>
      ))}
      {lines.length > PAGE && (
        <button type="button" onClick={() => setShowAll((v) => !v)}
          style={{ alignSelf: "flex-start", background: "none", border: "none", color: "var(--brand-blue)", fontSize: "var(--text-xs)", fontFamily: "var(--font-body)", cursor: "pointer", padding: "4px 0", minHeight: "32px" }}>
          {showAll ? "Show fewer" : `Show all ${lines.length}`}
        </button>
      )}
      {error && <div role="alert" style={{ fontSize: "var(--text-xs)", color: "var(--red)", fontFamily: "var(--font-body)" }}>{error}</div>}
    </div>
  );
}

function ordinal(n: number): string {
  if (n % 100 >= 11 && n % 100 <= 13) return "th";
  return n % 10 === 1 ? "st" : n % 10 === 2 ? "nd" : n % 10 === 3 ? "rd" : "th";
}
