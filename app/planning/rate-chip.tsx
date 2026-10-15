"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setAccountRate } from "./planning-actions";
import { monthlyInterest, type RateKind } from "@/lib/planning/money-priorities";

// The APY (cash) or APR (debt) on one balance-sheet account. Plaid doesn't return rates on
// the Transactions product, so the user types it once; it then feeds the idle-cash check,
// the interest-cost line, and where Cash Flow suggests the leftover goes.

export default function RateChip({
  itemRef, kind, rate, balance, isPrivate,
}: {
  itemRef: string;
  kind: RateKind;
  rate: number | null;
  balance: number;
  isPrivate: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(rate !== null ? String(rate) : "");
  const [pending, startTransition] = useTransition();
  const label = kind === "apy" ? "APY" : "APR";

  const save = (next: number | null) => {
    startTransition(async () => {
      await setAccountRate(itemRef, next);
      setEditing(false);
      router.refresh();
    });
  };

  if (editing) {
    return (
      <form
        onSubmit={(e) => { e.preventDefault(); const n = Number(value); save(value.trim() === "" ? null : Number.isFinite(n) ? n : null); }}
        style={{ display: "inline-flex", alignItems: "center", gap: "4px", flexShrink: 0 }}
      >
        <input
          autoFocus inputMode="decimal" aria-label={`${label} percent`} value={value} onChange={(e) => setValue(e.target.value)}
          placeholder={kind === "apy" ? "4.2" : "24.99"}
          style={{ width: "64px", height: "30px", padding: "0 6px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-default)", background: "var(--bg-base)", color: "var(--text-primary)", fontFamily: "var(--font-mono)", fontSize: "var(--text-xs)" }}
        />
        <span style={{ fontSize: "var(--text-2xs)", color: "var(--text-tertiary)" }}>{`% ${label}`}</span>
        <button type="submit" disabled={pending} style={{ height: "30px", padding: "0 8px", borderRadius: "var(--radius-sm)", border: "none", background: "var(--brand-blue)", color: "#fff", fontSize: "var(--text-2xs)", fontWeight: 700, cursor: "pointer" }}>
          {pending ? "…" : "Save"}
        </button>
        <button type="button" onClick={() => setEditing(false)} style={{ height: "30px", padding: "0 6px", border: "none", background: "none", color: "var(--text-tertiary)", fontSize: "var(--text-2xs)", cursor: "pointer" }}>
          Cancel
        </button>
      </form>
    );
  }

  const interest = kind === "apr" && rate !== null && balance > 0 ? monthlyInterest(balance, rate) : null;
  return (
    <button
      type="button" onClick={() => setEditing(true)}
      title={rate === null ? `Add this account's ${label} so BuyTune can factor it into suggestions` : `Edit ${label}`}
      style={{
        fontSize: "10px", fontWeight: 600, fontFamily: "var(--font-mono)", padding: "1px 7px", borderRadius: "var(--radius-full)", flexShrink: 0, whiteSpace: "nowrap", cursor: "pointer",
        border: `1px ${rate === null ? "dashed" : "solid"} var(--border-default)`,
        background: "transparent",
        color: rate === null ? "var(--text-tertiary)" : kind === "apr" && rate >= 8 ? "var(--red)" : "var(--text-secondary)",
      }}
    >
      {rate === null
        ? `+ ${label}`
        : `${rate}% ${label}${interest !== null && interest >= 1 ? ` · ${isPrivate ? "••" : `$${Math.round(interest).toLocaleString()}`}/mo if carried` : ""}`}
    </button>
  );
}
