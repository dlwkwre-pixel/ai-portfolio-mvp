"use client";

import { useState, useMemo, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Debt, DebtScenario } from "./debt-actions";
import { saveDebtScenario, deleteDebtScenario } from "./debt-actions";

// ── Formatters ──────────────────────────────────────────────────────────────
function fmt(n: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}
function monthsToLabel(m: number): string {
  if (m <= 0) return "—";
  if (m >= 600) return "30+ yrs";
  const y = Math.floor(m / 12);
  const mo = m % 12;
  if (y === 0) return `${mo} mo`;
  if (mo === 0) return `${y} yr${y > 1 ? "s" : ""}`;
  return `${y}y ${mo}m`;
}
function payoffDateLabel(m: number): string {
  if (m <= 0 || m >= 600) return "—";
  const d = new Date();
  d.setMonth(d.getMonth() + m);
  return d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

// ── Amortization engine ───────────────────────────────────────────────────────
type SimResult = {
  months: number;
  totalInterest: number;
  payoffMonth: number[]; // per debt
  capped: boolean;       // true if a debt never amortizes (min < interest)
};

function priorityOrder(debts: Debt[], strategy: "avalanche" | "snowball"): number[] {
  return debts
    .map((_, i) => i)
    .sort((a, b) =>
      strategy === "avalanche"
        ? debts[b].apr - debts[a].apr || debts[a].balance - debts[b].balance
        : debts[a].balance - debts[b].balance || debts[b].apr - debts[a].apr
    );
}

function simulate(debts: Debt[], strategy: "avalanche" | "snowball", extra: number): SimResult {
  const bals = debts.map((d) => Math.max(0, d.balance));
  const rate = debts.map((d) => Math.max(0, d.apr) / 100 / 12);
  const mins = debts.map((d) => Math.max(0, d.min_payment));
  const payoffMonth = debts.map(() => 0);
  const order = priorityOrder(debts, strategy);
  let totalInterest = 0;
  let month = 0;

  while (bals.some((b) => b > 0.5) && month < 600) {
    month++;
    // Accrue interest
    for (let i = 0; i < bals.length; i++) {
      if (bals[i] > 0) {
        const int = bals[i] * rate[i];
        bals[i] += int;
        totalInterest += int;
      }
    }
    // Budget = extra + minimums of all still-active debts (freed minimums roll in)
    let budget = extra + bals.reduce((s, b, i) => (b > 0 ? s + mins[i] : s), 0);
    // Pay minimums first
    for (let i = 0; i < bals.length; i++) {
      if (bals[i] > 0 && budget > 0) {
        const pay = Math.min(bals[i], mins[i], budget);
        bals[i] -= pay;
        budget -= pay;
      }
    }
    // Dump remaining budget on priority debts
    for (const i of order) {
      if (budget <= 0) break;
      if (bals[i] > 0) {
        const pay = Math.min(bals[i], budget);
        bals[i] -= pay;
        budget -= pay;
      }
    }
    // Record payoffs
    for (let i = 0; i < bals.length; i++) {
      if (bals[i] <= 0.5 && payoffMonth[i] === 0) payoffMonth[i] = month;
    }
  }
  return { months: month, totalInterest, payoffMonth, capped: month >= 600 };
}

// ── Styles ──────────────────────────────────────────────────────────────────
const labelStyle: React.CSSProperties = { display: "block", fontSize: "10px", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--text-tertiary)", marginBottom: "6px" };
const inputStyle: React.CSSProperties = { width: "100%", padding: "8px 10px", borderRadius: "8px", border: "1px solid var(--border-subtle)", background: "var(--bg-base)", color: "var(--text-primary)", fontSize: "13px", fontFamily: "var(--font-body)", outline: "none", boxSizing: "border-box" };
const cardStyle: React.CSSProperties = { background: "var(--bg-card)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-lg, 14px)", padding: "16px 18px" };

const BLANK_DEBT: Debt = { name: "", balance: 0, apr: 0, min_payment: 0 };

export default function DebtClient({ scenarios, prefillDebts }: { scenarios: DebtScenario[]; prefillDebts: Debt[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const active = scenarios[0] ?? null;

  const [debts, setDebts] = useState<Debt[]>(
    active?.debts?.length ? active.debts : prefillDebts.length ? prefillDebts : [{ ...BLANK_DEBT }]
  );
  const [strategy, setStrategy] = useState<"avalanche" | "snowball">(active?.strategy ?? "avalanche");
  const [extra, setExtra] = useState<number>(active?.extra_payment ?? 0);
  const [name, setName] = useState(active?.name ?? "My debts");
  const [saved, setSaved] = useState(false);

  const validDebts = debts.filter((d) => d.balance > 0);

  const result = useMemo(() => simulate(validDebts, strategy, extra), [validDebts, strategy, extra]);
  const baseline = useMemo(() => simulate(validDebts, strategy, 0), [validDebts, strategy]);
  const altResult = useMemo(
    () => simulate(validDebts, strategy === "avalanche" ? "snowball" : "avalanche", extra),
    [validDebts, strategy, extra]
  );

  const totalBalance = validDebts.reduce((s, d) => s + d.balance, 0);
  const totalMin = validDebts.reduce((s, d) => s + d.min_payment, 0);
  const interestSaved = baseline.totalInterest - result.totalInterest;
  const monthsSaved = baseline.months - result.months;
  const altInterestDiff = altResult.totalInterest - result.totalInterest; // >0 means current strategy is better

  // Per-debt payoff order under current strategy
  const order = priorityOrder(validDebts, strategy);

  function updateDebt(i: number, patch: Partial<Debt>) {
    setDebts((prev) => prev.map((d, idx) => (idx === i ? { ...d, ...patch } : d)));
    setSaved(false);
  }
  function addDebt() { setDebts((prev) => [...prev, { ...BLANK_DEBT }]); }
  function removeDebt(i: number) { setDebts((prev) => prev.filter((_, idx) => idx !== i)); setSaved(false); }

  function handleSave() {
    startTransition(async () => {
      const res = await saveDebtScenario(
        { name: name.trim() || "My debts", debts: validDebts, strategy, extra_payment: extra, notes: null },
        active?.id
      );
      if (!res.error) { setSaved(true); router.refresh(); }
    });
  }
  function handleDelete() {
    if (!active || !confirm("Delete this debt plan?")) return;
    startTransition(async () => { await deleteDebtScenario(active.id); router.refresh(); });
  }

  const debtFree = validDebts.length > 0 && !result.capped;

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", color: "var(--text-primary)", fontFamily: "var(--font-body)" }}>
      <style>{`
        @media (max-width: 600px) {
          [data-debt-grid] { grid-template-columns: 1fr 1fr 1fr 28px !important; }
          [data-debt-grid] > :first-child { grid-column: 1 / -1 !important; }
        }
      `}</style>
      {/* Header */}
      <div style={{ padding: "12px 24px", borderBottom: "1px solid var(--border-subtle)", display: "flex", alignItems: "center", justifyContent: "space-between", background: "var(--bg-base)", flexShrink: 0, gap: "12px" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "3px" }}>
            <Link href="/planning?tab=events" style={{ display: "flex", alignItems: "center", gap: "5px", fontSize: "12px", color: "var(--text-muted)", textDecoration: "none" }}>
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M10 3L5 8l5 5" strokeLinecap="round" strokeLinejoin="round" /></svg>
              Planning
            </Link>
            <span style={{ color: "var(--border)" }}>/</span>
            <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)" }}>Debt Payoff</span>
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: "10px" }}>
            <span style={{ fontSize: "16px", fontWeight: 700, color: "var(--text-primary)" }}>Debt Payoff Planner</span>
            <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>Avalanche vs. snowball — payoff date & interest saved</span>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="bt-page-content" style={{ flex: 1, overflowY: "auto", padding: "20px 24px 80px", display: "flex", flexDirection: "column", gap: "16px", maxWidth: "820px" }}>

        {/* Debts editor */}
        <div style={cardStyle}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
            <span style={{ fontFamily: "var(--font-display)", fontSize: "13px", fontWeight: 700 }}>Your Debts</span>
            <span style={{ fontSize: "11px", color: "var(--text-tertiary)" }}>{validDebts.length} debt{validDebts.length === 1 ? "" : "s"} · {fmt(totalBalance)} total</span>
          </div>

          {/* Column headers */}
          <div data-debt-grid style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr 0.8fr 1fr 28px", gap: "8px", marginBottom: "6px", paddingRight: "2px" }}>
            {["Debt", "Balance", "APR %", "Min / mo", ""].map((h, i) => (
              <span key={i} style={{ fontSize: "9px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)" }}>{h}</span>
            ))}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            {debts.map((d, i) => (
              <div key={i} data-debt-grid style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr 0.8fr 1fr 28px", gap: "8px", alignItems: "center" }}>
                <input style={inputStyle} placeholder="e.g. Chase card" value={d.name} onChange={(e) => updateDebt(i, { name: e.target.value })} />
                <input style={inputStyle} type="number" min="0" placeholder="0" value={d.balance || ""} onChange={(e) => updateDebt(i, { balance: Number(e.target.value) })} />
                <input style={inputStyle} type="number" min="0" step="0.1" placeholder="0" value={d.apr || ""} onChange={(e) => updateDebt(i, { apr: Number(e.target.value) })} />
                <input style={inputStyle} type="number" min="0" placeholder="0" value={d.min_payment || ""} onChange={(e) => updateDebt(i, { min_payment: Number(e.target.value) })} />
                <button type="button" onClick={() => removeDebt(i)} aria-label="Remove" style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: "16px", padding: "4px" }}>×</button>
              </div>
            ))}
          </div>

          <button type="button" onClick={addDebt} style={{ marginTop: "10px", padding: "7px 12px", borderRadius: "8px", border: "1px dashed var(--border-default, rgba(255,255,255,0.15))", background: "transparent", color: "var(--text-secondary)", fontSize: "12px", fontWeight: 600, cursor: "pointer", fontFamily: "var(--font-body)" }}>
            + Add debt
          </button>
          {prefillDebts.length > 0 && active == null && (
            <p style={{ fontSize: "11px", color: "var(--text-tertiary)", marginTop: "10px", lineHeight: 1.5 }}>
              Pre-filled from your balance sheet. APR and minimum payments are estimates — adjust them to match your statements for accurate projections.
            </p>
          )}
        </div>

        {validDebts.length > 0 && (
          <>
            {/* Strategy + extra payment */}
            <div style={cardStyle}>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "20px", alignItems: "flex-end" }}>
                <div style={{ flex: "1 1 240px" }}>
                  <label style={labelStyle}>Payoff Strategy</label>
                  <div style={{ display: "flex", gap: "8px" }}>
                    {([["avalanche", "Avalanche", "Highest APR first — saves the most"], ["snowball", "Snowball", "Smallest balance first — fastest wins"]] as const).map(([val, lbl, hint]) => (
                      <button key={val} type="button" onClick={() => { setStrategy(val); setSaved(false); }}
                        style={{ flex: 1, padding: "10px 12px", borderRadius: "10px", cursor: "pointer", textAlign: "left",
                          border: `1px solid ${strategy === val ? "var(--brand-blue, #2563eb)" : "var(--border-subtle)"}`,
                          background: strategy === val ? "rgba(37,99,235,0.1)" : "var(--bg-base)", color: "var(--text-primary)", fontFamily: "var(--font-body)" }}>
                        <div style={{ fontSize: "13px", fontWeight: 700 }}>{lbl}</div>
                        <div style={{ fontSize: "10px", color: "var(--text-tertiary)", marginTop: "2px" }}>{hint}</div>
                      </button>
                    ))}
                  </div>
                </div>
                <div style={{ flex: "0 1 180px" }}>
                  <label style={labelStyle}>Extra payment / mo</label>
                  <input style={inputStyle} type="number" min="0" placeholder="0" value={extra || ""} onChange={(e) => { setExtra(Number(e.target.value)); setSaved(false); }} />
                  <div style={{ fontSize: "10px", color: "var(--text-tertiary)", marginTop: "5px" }}>On top of {fmt(totalMin)} minimums</div>
                </div>
              </div>
            </div>

            {/* Results */}
            <div style={cardStyle}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "14px 10px" }}>
                <Metric label="Debt-free in" value={debtFree ? monthsToLabel(result.months) : "Never*"} sub={debtFree ? payoffDateLabel(result.months) : "min < interest"} accent={debtFree ? "var(--green)" : "var(--red)"} />
                <Metric label="Total interest" value={fmt(result.totalInterest)} sub="over payoff" />
                <Metric label="Interest saved" value={extra > 0 ? fmt(Math.max(0, interestSaved)) : "—"} sub={extra > 0 ? `vs. minimums only` : "add extra to see"} accent={extra > 0 && interestSaved > 0 ? "var(--green)" : undefined} />
              </div>

              {extra > 0 && monthsSaved > 0 && (
                <div style={{ marginTop: "14px", padding: "10px 12px", borderRadius: "10px", background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.18)", fontSize: "12px", color: "var(--text-secondary)", lineHeight: 1.5 }}>
                  Paying <strong style={{ color: "var(--text-primary)" }}>{fmt(extra)}/mo</strong> extra clears your debt <strong style={{ color: "var(--green)" }}>{monthsToLabel(monthsSaved)}</strong> sooner and saves <strong style={{ color: "var(--green)" }}>{fmt(Math.max(0, interestSaved))}</strong> in interest.
                </div>
              )}

              {validDebts.length > 1 && (
                <div style={{ marginTop: "12px", fontSize: "12px", color: "var(--text-secondary)", lineHeight: 1.5 }}>
                  {Math.abs(altInterestDiff) < 1
                    ? `Avalanche and snowball cost about the same here — pick whichever keeps you motivated.`
                    : altInterestDiff > 0
                    ? `${strategy === "avalanche" ? "Avalanche" : "Snowball"} (current) saves ${fmt(Math.abs(altInterestDiff))} more in interest than ${strategy === "avalanche" ? "snowball" : "avalanche"}.`
                    : `Switching to ${strategy === "avalanche" ? "snowball" : "avalanche"} would save ${fmt(Math.abs(altInterestDiff))} more in interest.`}
                </div>
              )}

              {result.capped && (
                <p style={{ marginTop: "12px", fontSize: "11px", color: "var(--red)", lineHeight: 1.5 }}>
                  *At least one debt&apos;s minimum payment is lower than its monthly interest, so it never gets paid off. Increase the minimum or add an extra payment.
                </p>
              )}
            </div>

            {/* Payoff order */}
            <div style={cardStyle}>
              <span style={{ fontFamily: "var(--font-display)", fontSize: "13px", fontWeight: 700, display: "block", marginBottom: "12px" }}>Payoff Order ({strategy})</span>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {order.map((idx, rank) => {
                  const d = validDebts[idx];
                  const pm = result.payoffMonth[idx];
                  return (
                    <div key={idx} style={{ display: "flex", alignItems: "center", gap: "12px", padding: "8px 0", borderBottom: rank < order.length - 1 ? "1px solid var(--border-subtle)" : "none" }}>
                      <span style={{ width: "20px", height: "20px", borderRadius: "50%", background: "rgba(37,99,235,0.12)", color: "var(--brand-blue, #2563eb)", fontSize: "11px", fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{rank + 1}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: "13px", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.name || "Debt"}</div>
                        <div style={{ fontSize: "11px", color: "var(--text-tertiary)" }}>{fmt(d.balance)} · {d.apr.toFixed(1)}% APR</div>
                      </div>
                      <div style={{ textAlign: "right", flexShrink: 0 }}>
                        <div style={{ fontSize: "12px", fontWeight: 600, fontFamily: "var(--font-mono)" }}>{pm > 0 ? payoffDateLabel(pm) : "—"}</div>
                        <div style={{ fontSize: "10px", color: "var(--text-tertiary)" }}>{pm > 0 ? monthsToLabel(pm) : ""}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Save row */}
            <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
              <input style={{ ...inputStyle, width: "200px" }} value={name} onChange={(e) => { setName(e.target.value); setSaved(false); }} placeholder="Plan name" />
              <button type="button" onClick={handleSave} disabled={pending} style={{ padding: "9px 18px", borderRadius: "8px", border: "none", background: pending ? "rgba(37,99,235,0.5)" : "var(--brand-blue, #2563eb)", color: "#fff", fontSize: "13px", fontWeight: 600, cursor: pending ? "not-allowed" : "pointer", fontFamily: "var(--font-body)" }}>
                {pending ? "Saving…" : active ? "Update plan" : "Save plan"}
              </button>
              {active && (
                <button type="button" onClick={handleDelete} disabled={pending} style={{ padding: "9px 14px", borderRadius: "8px", border: "1px solid var(--border-subtle)", background: "var(--bg-card)", color: "var(--text-secondary)", fontSize: "13px", fontWeight: 500, cursor: "pointer", fontFamily: "var(--font-body)" }}>
                  Delete
                </button>
              )}
              {saved && <span style={{ fontSize: "12px", color: "var(--green)" }}>Saved</span>}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Metric({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: string }) {
  return (
    <div>
      <div style={{ fontSize: "9px", color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "5px" }}>{label}</div>
      <div style={{ fontSize: "22px", fontWeight: 700, fontFamily: "var(--font-display)", letterSpacing: "-0.5px", color: accent ?? "var(--text-primary)", lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: "10px", color: "var(--text-tertiary)", marginTop: "5px" }}>{sub}</div>}
    </div>
  );
}
