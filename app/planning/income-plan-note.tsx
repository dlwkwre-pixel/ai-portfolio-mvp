"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { CashFlowItem } from "./planning-actions";
import { updateCashFlowItem } from "./planning-actions";
import type { CashFlowTransaction } from "@/lib/planning/transactions";
import { detectPayFrequency } from "@/lib/planning/pay-schedule";
import { frequencyLabel, toMonthlyAmount } from "@/lib/planning/frequency";

// Where "expected income" comes from — each income line's amount × how often it's paid —
// and a one-tap fix when recorded paychecks show a different schedule than the plan (the
// classic case: a biweekly paycheck saved as "monthly", so expected is one check, not ~2.17).

export default function IncomePlanNote({
  incomeItems, transactions, k401EmployeeMonthly, isPrivate,
}: {
  incomeItems: CashFlowItem[];
  transactions: CashFlowTransaction[];
  k401EmployeeMonthly: number;
  isPrivate: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  if (incomeItems.length === 0) return null;
  const money = (n: number) => (isPrivate ? "••••" : `$${Math.round(n).toLocaleString()}`);
  const planSum = incomeItems.reduce((s, i) => s + toMonthlyAmount(i.amount, i.frequency), 0);
  const today = new Date();

  const mismatches = incomeItems.flatMap((item) => {
    const d = detectPayFrequency(transactions, item.id, today);
    if (!d || d.frequency === item.frequency) return [];
    // Don't flip between twice-a-month and every-2-weeks without enough paychecks to tell.
    const twiceish = (f: string) => f === "semimonthly" || f === "biweekly";
    if (!d.confident && twiceish(d.frequency) && twiceish(item.frequency)) return [];
    // Income lines are stored before the 401(k) deferral but deposits arrive after it, so add
    // this line's share of the deferral back per check.
    const share = planSum > 0 ? toMonthlyAmount(item.amount, item.frequency) / planSum : 1;
    const perCheckPlan = Math.round((d.perCheck + (k401EmployeeMonthly * share) / toMonthlyAmount(1, d.frequency)) * 100) / 100;
    return [{ item, d, perCheckPlan, newMonthly: toMonthlyAmount(perCheckPlan, d.frequency), oldMonthly: toMonthlyAmount(item.amount, item.frequency) }];
  });

  const fix = (m: (typeof mismatches)[number]) => {
    startTransition(async () => {
      const fd = new FormData();
      fd.set("id", m.item.id);
      fd.set("label", m.item.label);
      fd.set("type", "income");
      fd.set("amount", String(m.perCheckPlan));
      fd.set("frequency", m.d.frequency);
      if (m.item.due_day != null) fd.set("due_day", String(m.item.due_day));
      const res = await updateCashFlowItem(fd);
      setMsg(res?.error ? res.error : `${m.item.label} now plans on ${money(m.perCheckPlan)} ${frequencyLabel(m.d.frequency).toLowerCase()}, about ${money(m.newMonthly)} a month.`);
      router.refresh();
    });
  };

  return (
    <div style={{ margin: "-4px 0 10px", display: "flex", flexDirection: "column", gap: "6px" }}>
      <p style={{ margin: 0, fontSize: "11px", color: "var(--text-tertiary)", fontFamily: "var(--font-body)", lineHeight: 1.5 }}>
        {"Expected comes from your plan: "}
        {incomeItems.map((i, idx) => (
          <span key={i.id}>
            {idx > 0 ? "; " : ""}
            {`${i.label} ${money(i.amount)} ${frequencyLabel(i.frequency).toLowerCase()}`}
            {i.frequency !== "monthly" ? ` ≈ ${money(toMonthlyAmount(i.amount, i.frequency))}/mo` : ""}
          </span>
        ))}
        {k401EmployeeMonthly > 0 ? `, minus ${money(k401EmployeeMonthly)} 401(k)` : ""}
        {". Change it under Edit my plan below."}
      </p>
      {mismatches.map((m) => (
        <div key={m.item.id} role="status" style={{ border: "1px solid var(--amber)", borderRadius: "var(--radius-md)", padding: "8px 10px", display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
          <span style={{ flex: "1 1 220px", fontSize: "12px", color: "var(--text-secondary)", fontFamily: "var(--font-body)", lineHeight: 1.5 }}>
            {`Your recorded ${m.item.label} paychecks come ${frequencyLabel(m.d.frequency).toLowerCase()}, but your plan counts it ${frequencyLabel(m.item.frequency).toLowerCase()}. `}
            {`Expected would be about ${money(m.newMonthly)} a month instead of ${money(m.oldMonthly)}.`}
          </span>
          <button type="button" onClick={() => fix(m)} disabled={pending}
            style={{ minHeight: "44px", padding: "0 12px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-default)", background: "var(--bg-elevated)", color: "var(--text-primary)", fontSize: "12px", fontWeight: 600, fontFamily: "var(--font-body)", cursor: "pointer", flexShrink: 0 }}>
            {pending ? "Updating…" : `Switch to ${frequencyLabel(m.d.frequency).toLowerCase()}`}
          </button>
        </div>
      ))}
      {msg && <span role="status" style={{ fontSize: "11px", color: "var(--green)", fontFamily: "var(--font-body)" }}>{msg}</span>}
    </div>
  );
}
