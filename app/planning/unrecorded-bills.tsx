"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { recordBillPaid } from "./planning-actions";
import { MONTH_NAMES } from "./planning-shared";

// Planned budget lines with nothing recorded for the month. Until something is recorded
// the page assumes the full plan was spent, so this makes that visible:
// - FIXED bills (rent, insurance, utilities, subscriptions, anything with a due day) get a
//   one-tap "Paid" at the planned amount — they're the same every month.
// - VARIABLE categories (food, gas, shopping) aren't "paid" once; they fill in from bank
//   transactions or imports, so they're one summary line, with an opt-in to log a total.

export type UnrecordedLine = { id: string; label: string; planned: number; dueDay: number | null; fixed: boolean };

function ordinal(n: number): string {
  if (n % 100 >= 11 && n % 100 <= 13) return "th";
  return n % 10 === 1 ? "st" : n % 10 === 2 ? "nd" : n % 10 === 3 ? "rd" : "th";
}

export default function UnrecordedBills({
  lines, selYear, selMonth, isPrivate, bankLinked = false,
}: {
  lines: UnrecordedLine[];
  selYear: number;
  selMonth: number;
  isPrivate: boolean;
  bankLinked?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [showVariable, setShowVariable] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  if (lines.length === 0) return null;
  const fixed = lines.filter((l) => l.fixed);
  const variable = lines.filter((l) => !l.fixed);
  const total = lines.reduce((s, l) => s + l.planned, 0);
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

  const tile = (l: UnrecordedLine, verb: string) => (
    <div key={l.id} style={{ display: "flex", alignItems: "center", gap: "8px", padding: "8px 10px", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-sm)", background: "var(--bg-surface)", minWidth: 0 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: "var(--text-sm)", color: "var(--text-primary)", fontFamily: "var(--font-body)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.label}</div>
        {l.dueDay != null && <div style={{ fontSize: "var(--text-2xs)", color: "var(--text-tertiary)", fontFamily: "var(--font-body)" }}>{`due the ${l.dueDay}${ordinal(l.dueDay)}`}</div>}
      </div>
      <input
        type="number" min="0.01" step="0.01" inputMode="decimal"
        aria-label={`Amount for ${l.label}`}
        value={amounts[l.id] ?? String(Math.round(l.planned * 100) / 100)}
        onChange={(e) => setAmounts((a) => ({ ...a, [l.id]: e.target.value }))}
        style={{ width: "78px", flexShrink: 0, background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-sm)", color: "var(--text-primary)", fontFamily: "var(--font-mono)", fontSize: "var(--text-xs)", padding: "6px 7px", minHeight: "34px", boxSizing: "border-box", textAlign: "right" }}
      />
      <button type="button" onClick={() => record(l)} disabled={pending}
        style={{ flexShrink: 0, minHeight: "34px", padding: "0 10px", borderRadius: "var(--radius-sm)", border: "1px solid var(--green-border)", background: "var(--green-bg)", color: "var(--green)", fontFamily: "var(--font-body)", fontSize: "var(--text-xs)", fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}>
        {busyId === l.id ? "…" : verb}
      </button>
    </div>
  );

  return (
    <div style={{ border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-md)", padding: "10px 12px", marginBottom: "14px", display: "flex", flexDirection: "column", gap: "8px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "8px", flexWrap: "wrap" }}>
        <span style={{ fontSize: "var(--text-sm)", fontWeight: 600, color: "var(--text-primary)", fontFamily: "var(--font-body)" }}>Planned, not recorded yet</span>
        <span style={{ fontSize: "var(--text-xs)", color: "var(--text-tertiary)", fontFamily: "var(--font-body)" }}>
          <span style={{ fontFamily: "var(--font-mono)", color: "var(--text-secondary)" }}>{money(total)}</span>{` assumed for ${MONTH_NAMES[selMonth - 1]}`}
        </span>
      </div>

      {fixed.length > 0 && (
        <>
          <p style={{ margin: 0, fontSize: "var(--text-xs)", color: "var(--text-tertiary)", fontFamily: "var(--font-body)", lineHeight: 1.5 }}>
            Fixed bills: tap Paid once they&apos;re paid (change the amount first if it was different).
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: "6px" }}>
            {fixed.map((l) => tile(l, "Paid ✓"))}
          </div>
        </>
      )}

      {variable.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          <p style={{ margin: 0, fontSize: "var(--text-xs)", color: "var(--text-tertiary)", fontFamily: "var(--font-body)", lineHeight: 1.6 }}>
            {`${bankLinked ? "Filled in from your bank as transactions sync" : "Filled in when you import or add transactions"}; counted at plan until then: `}
            {variable.map((l, i) => (
              <span key={l.id}>
                {i > 0 ? " · " : ""}
                <span style={{ color: "var(--text-secondary)" }}>{l.label}</span>{" "}
                <span style={{ fontFamily: "var(--font-mono)" }}>{money(l.planned)}</span>
              </span>
            ))}
            {" "}
            <button type="button" onClick={() => setShowVariable((v) => !v)}
              style={{ background: "none", border: "none", padding: 0, color: "var(--brand-blue)", fontSize: "var(--text-xs)", fontFamily: "var(--font-body)", cursor: "pointer", fontWeight: 600 }}>
              {showVariable ? "Hide" : "Record a total instead"}
            </button>
          </p>
          {showVariable && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: "6px" }}>
              {variable.map((l) => tile(l, "Record"))}
            </div>
          )}
        </div>
      )}

      {error && <div role="alert" style={{ fontSize: "var(--text-xs)", color: "var(--red)", fontFamily: "var(--font-body)" }}>{error}</div>}
    </div>
  );
}
