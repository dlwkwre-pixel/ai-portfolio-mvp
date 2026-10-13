"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { CashFlowItem } from "./planning-actions";
import { setBillSchedule } from "./planning-actions";
import { intervalMonths, monthsSinceDue, nextDueMonth, type BillMode } from "@/lib/planning/frequency";
import { MONTH_NAMES } from "./planning-shared";

// "How often does this bill repeat?" for a budget line in Edit my plan. Monthly lines show
// a quiet link; bills that repeat every N months show their schedule and how much has been
// set aside toward the next payment.

const PRESETS = [1, 2, 3, 4, 6, 12];

const field: React.CSSProperties = {
  background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-sm)",
  color: "var(--text-primary)", fontFamily: "var(--font-body)", fontSize: "var(--text-xs)", padding: "6px 8px",
  minHeight: "34px", boxSizing: "border-box", minWidth: 0,
};
const label: React.CSSProperties = {
  display: "flex", flexDirection: "column", gap: "4px", fontSize: "var(--text-2xs)", fontWeight: 700, textTransform: "uppercase",
  letterSpacing: "0.06em", color: "var(--text-tertiary)", fontFamily: "var(--font-body)", minWidth: 0,
};

function monthLabel(y: number, m: number): string {
  return `${MONTH_NAMES[m - 1]} ${y}`;
}

export default function BillScheduleEditor({ item, isPrivate }: { item: CashFlowItem; isPrivate: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const currentN = intervalMonths(item.frequency) ?? 1;
  const [n, setN] = useState<number>(currentN);
  const [custom, setCustom] = useState<boolean>(!PRESETS.includes(currentN));
  const [amount, setAmount] = useState<string>(String(item.amount));
  const [nextDue, setNextDue] = useState<string>(item.due_anchor ?? "");
  const [mode, setMode] = useState<BillMode>(item.bill_mode === "when_paid" ? "when_paid" : "spread");
  const [error, setError] = useState<string | null>(null);
  const money = (v: number) => (isPrivate ? "••••" : `$${Math.round(v).toLocaleString()}`);

  const now = new Date();
  const y = now.getFullYear(), m = now.getMonth() + 1;
  const periodic = currentN > 1;

  // Changing a monthly line to "every N months": suggest the per-payment amount (monthly × N).
  function pickInterval(next: number) {
    if (currentN === 1 && next > 1 && Number(amount) === item.amount) setAmount(String(Math.round(item.amount * next * 100) / 100));
    if (next === 1 && currentN > 1 && Number(amount) === item.amount) setAmount(String(Math.round((item.amount / currentN) * 100) / 100));
    setN(next);
  }

  function save() {
    setError(null);
    startTransition(async () => {
      const res = await setBillSchedule({ id: item.id, intervalMonths: n, amountPerPayment: Number(amount), nextDue: n > 1 ? nextDue || null : null, mode });
      if (res.error) { setError(res.error); return; }
      setOpen(false);
      router.refresh();
    });
  }

  if (!open) {
    if (!periodic) {
      return (
        <button type="button" onClick={() => setOpen(true)}
          style={{ background: "none", border: "none", padding: "2px 0", minHeight: "28px", color: "var(--text-tertiary)", fontSize: "10.5px", fontFamily: "var(--font-body)", cursor: "pointer", textDecoration: "underline", textUnderlineOffset: "2px" }}>
          Repeats monthly · change
        </button>
      );
    }
    const since = monthsSinceDue(item, y, m);
    const next = nextDueMonth(item, y, m);
    const perMonth = item.amount / currentN;
    const setAside = since === null ? null : since === 0 ? item.amount : since * perMonth;
    return (
      <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", fontSize: "10.5px", color: "var(--text-tertiary)", fontFamily: "var(--font-body)", padding: "2px 0" }}>
        <span>
          {`Every ${currentN} months · ${money(item.amount)} per payment`}
          {next ? ` · next due ${since === 0 ? "this month" : monthLabel(next.year, next.month)}` : " · add a due date"}
          {item.bill_mode !== "when_paid" && setAside !== null ? ` · ${money(setAside)} of ${money(item.amount)} set aside` : ""}
          {item.bill_mode === "when_paid" ? " · counted when paid" : ` · ${money(perMonth)}/mo set aside`}
        </span>
        <button type="button" onClick={() => setOpen(true)}
          style={{ background: "none", border: "none", padding: 0, minHeight: "28px", color: "var(--brand-blue)", fontSize: "10.5px", fontFamily: "var(--font-body)", fontWeight: 600, cursor: "pointer" }}>
          Edit schedule
        </button>
      </div>
    );
  }

  const amt = Number(amount) || 0;
  return (
    <div style={{ border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-sm)", padding: "10px", margin: "4px 0", display: "flex", flexDirection: "column", gap: "8px", background: "var(--card-bg)" }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "8px" }}>
        <label style={label}>
          How often
          <select value={custom ? "custom" : String(n)} style={field}
            onChange={(e) => {
              if (e.target.value === "custom") { setCustom(true); if (n === 1) pickInterval(5); return; }
              setCustom(false); pickInterval(Number(e.target.value));
            }}>
            <option value="1">Every month</option>
            <option value="2">Every 2 months</option>
            <option value="3">Every 3 months</option>
            <option value="4">Every 4 months</option>
            <option value="6">Every 6 months</option>
            <option value="12">Once a year</option>
            <option value="custom">Custom…</option>
          </select>
        </label>
        {custom && (
          <label style={label}>
            Every how many months
            <input type="number" min={2} max={24} value={n} style={{ ...field, fontFamily: "var(--font-mono)" }}
              onChange={(e) => pickInterval(Math.max(2, Math.min(24, Number(e.target.value) || 2)))} />
          </label>
        )}
        <label style={label}>
          {n > 1 ? "Amount per payment" : "Amount per month"}
          <input type="number" min={0} step="0.01" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)}
            style={{ ...field, fontFamily: "var(--font-mono)" }} />
        </label>
        {n > 1 && (
          <label style={label}>
            Next due
            <input type="date" value={nextDue} onChange={(e) => setNextDue(e.target.value)} style={field} />
          </label>
        )}
      </div>

      {n > 1 && (
        <fieldset style={{ border: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "4px" }}>
          <legend style={{ ...label, marginBottom: "4px" }}>How should it count in your budget?</legend>
          {([
            ["spread", `Set aside ${money(amt / n)} every month`, "Recommended. Left over keeps money back for it, and the month you pay doesn't look like a blowout."],
            ["when_paid", "Count it in the month it's paid", `Nothing in other months, the full ${money(amt)} in the month it's due.`],
          ] as [BillMode, string, string][]).map(([value, title, hint]) => (
            <label key={value} style={{ display: "flex", gap: "8px", alignItems: "flex-start", cursor: "pointer", fontSize: "var(--text-xs)", color: "var(--text-secondary)", fontFamily: "var(--font-body)", lineHeight: 1.45 }}>
              <input type="radio" name={`mode-${item.id}`} checked={mode === value} onChange={() => setMode(value)} style={{ marginTop: "3px", accentColor: "var(--brand-blue)" }} />
              <span><strong style={{ color: "var(--text-primary)" }}>{title}</strong><br />{hint}</span>
            </label>
          ))}
        </fieldset>
      )}

      {error && <div role="alert" style={{ fontSize: "var(--text-xs)", color: "var(--red)", fontFamily: "var(--font-body)" }}>{error}</div>}
      <div style={{ display: "flex", gap: "8px" }}>
        <button type="button" onClick={save} disabled={pending}
          style={{ minHeight: "34px", padding: "0 14px", borderRadius: "var(--radius-sm)", border: "none", background: "var(--brand-blue)", color: "#fff", fontSize: "var(--text-xs)", fontWeight: 600, fontFamily: "var(--font-body)", cursor: "pointer" }}>
          {pending ? "Saving…" : "Save schedule"}
        </button>
        <button type="button" onClick={() => { setOpen(false); setError(null); }}
          style={{ minHeight: "34px", padding: "0 12px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-subtle)", background: "transparent", color: "var(--text-secondary)", fontSize: "var(--text-xs)", fontFamily: "var(--font-body)", cursor: "pointer" }}>
          Cancel
        </button>
      </div>
    </div>
  );
}
