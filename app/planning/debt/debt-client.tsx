"use client";

import { useState, useMemo, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Debt, DebtScenario } from "./debt-actions";
import { saveDebtScenario, deleteDebtScenario } from "./debt-actions";
import AddToPlanButton from "@/app/planning/add-to-plan-button";
import InfoTooltip from "@/app/components/info-tooltip";

function HintDot({ text }: { text: string }) {
  return (
    <InfoTooltip text={text} align="start" width={230}>
      <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: "14px", height: "14px", borderRadius: "50%", marginLeft: "5px", cursor: "help", background: "rgba(99,102,241,0.12)", border: "1px solid rgba(99,102,241,0.3)", color: "var(--accent, #818cf8)", fontSize: "9px", fontWeight: 700 }}>?</span>
    </InfoTooltip>
  );
}

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
  series: number[];      // total balance by month (index 0 = start)
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
  const series: number[] = [bals.reduce((s, b) => s + b, 0)];

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
    series.push(bals.reduce((s, b) => s + Math.max(0, b), 0));
  }
  return { months: month, totalInterest, payoffMonth, capped: month >= 600, series };
}

// Consolidation loan: one fixed payment over a term. Returns total interest + monthly payment.
function consolidationCost(balance: number, apr: number, termMonths: number): { payment: number; totalInterest: number } {
  if (balance <= 0 || termMonths <= 0) return { payment: 0, totalInterest: 0 };
  const r = apr / 100 / 12;
  const payment = r > 0 ? (balance * r * Math.pow(1 + r, termMonths)) / (Math.pow(1 + r, termMonths) - 1) : balance / termMonths;
  return { payment, totalInterest: payment * termMonths - balance };
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
  const [consolApr, setConsolApr] = useState(11);
  const [consolTermYears, setConsolTermYears] = useState(5);

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

  // Weighted-average APR across balances.
  const avgApr = totalBalance > 0 ? validDebts.reduce((s, d) => s + d.apr * d.balance, 0) / totalBalance : 0;

  // Consolidation comparison: one loan at consolApr over the chosen term.
  const consol = useMemo(() => consolidationCost(totalBalance, consolApr, consolTermYears * 12), [totalBalance, consolApr, consolTermYears]);
  const consolSaves = result.totalInterest - consol.totalInterest;

  // Payoff timeline chart: minimums-only vs your plan.
  const chart = useMemo(() => {
    const a = baseline.series, b = result.series;
    const maxLen = Math.max(a.length, b.length);
    const maxVal = Math.max(a[0] ?? 0, b[0] ?? 0, 1);
    const W = 320, H = 110, pad = 5;
    const x = (i: number) => (maxLen <= 1 ? 0 : (i / (maxLen - 1)) * W);
    const y = (v: number) => H - pad - (v / maxVal) * (H - 2 * pad);
    const path = (s: number[]) => s.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
    return { W, H, basePath: path(a), planPath: path(b), differ: a.length !== b.length };
  }, [baseline.series, result.series]);

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
      <div className="bt-page-content" style={{ flex: 1, overflowY: "auto", padding: "20px 24px 80px", display: "flex", flexDirection: "column", gap: "16px", maxWidth: "1000px", width: "100%", margin: "0 auto" }}>

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
                <input aria-label="e.g. Chase card" style={inputStyle} placeholder="e.g. Chase card" value={d.name} onChange={(e) => updateDebt(i, { name: e.target.value })} />
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

            {/* Verdict hero */}
            <div style={{ ...cardStyle, background: `linear-gradient(135deg, color-mix(in srgb, ${debtFree ? "var(--green)" : "var(--red)"} 8%, var(--bg-card)), var(--bg-card))`, border: `1px solid color-mix(in srgb, ${debtFree ? "var(--green)" : "var(--red)"} 26%, transparent)` }}>
              <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
                <div>
                  <div style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: debtFree ? "var(--green)" : "var(--red)" }}>{debtFree ? "Debt-free date" : "Not on track"}</div>
                  <div style={{ fontSize: "26px", fontWeight: 800, fontFamily: "var(--font-display)", letterSpacing: "-1px", color: "var(--text-primary)", lineHeight: 1.1, marginTop: "2px" }}>
                    {debtFree ? payoffDateLabel(result.months) : "Minimums too low"}
                  </div>
                  <div style={{ fontSize: "11px", color: "var(--text-tertiary)", marginTop: "2px" }}>{fmt(totalBalance)} across {validDebts.length} debt{validDebts.length === 1 ? "" : "s"} · {avgApr.toFixed(1)}% avg APR</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: "10px", color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Total interest</div>
                  <div style={{ fontSize: "22px", fontWeight: 800, fontFamily: "var(--font-mono)", color: "var(--text-primary)" }}>{fmt(result.totalInterest)}</div>
                  {extra > 0 && interestSaved > 0 && <div style={{ fontSize: "10px", color: "var(--green)" }}>saving {fmt(Math.round(interestSaved))} vs minimums</div>}
                </div>
              </div>
            </div>

            {/* Payoff timeline */}
            <div style={cardStyle}>
              <span style={{ fontFamily: "var(--font-display)", fontSize: "13px", fontWeight: 700, display: "flex", alignItems: "center", marginBottom: "12px" }}>Payoff timeline<HintDot text="Your total balance falling to zero. The faster (green) line is your plan with extra payments; the gray line is paying minimums only." /></span>
              <svg viewBox={`0 0 ${chart.W} ${chart.H}`} preserveAspectRatio="none" style={{ width: "100%", height: "110px", display: "block" }}>
                {extra > 0 && <path d={chart.basePath} fill="none" stroke="rgba(148,163,184,0.6)" strokeWidth="1.5" strokeDasharray="4 3" />}
                <path d={chart.planPath} fill="none" stroke="var(--green, #22c55e)" strokeWidth="2" strokeLinejoin="round" />
              </svg>
              {extra > 0 && (
                <div style={{ display: "flex", gap: "16px", marginTop: "8px", fontSize: "10.5px" }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: "5px", color: "var(--text-secondary)" }}><span style={{ width: "14px", height: "2px", background: "var(--green)" }} /> Your plan</span>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: "5px", color: "var(--text-secondary)" }}><span style={{ width: "14px", height: "2px", background: "rgba(148,163,184,0.6)" }} /> Minimums only</span>
                </div>
              )}
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

            {/* Consolidation / refinance */}
            {totalBalance > 0 && (
              <div style={cardStyle}>
                <span style={{ fontFamily: "var(--font-display)", fontSize: "13px", fontWeight: 700, display: "flex", alignItems: "center", marginBottom: "12px" }}>
                  Consolidate or refinance?<HintDot text="Roll everything into one fixed loan (e.g. a personal loan or balance-transfer). Worth it if the new rate beats your blended APR — but a longer term can cost more interest even at a lower rate." />
                </span>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "14px", alignItems: "flex-end", marginBottom: "12px" }}>
                  <div style={{ flex: "0 1 150px" }}>
                    <label style={labelStyle}>New rate (APR %)</label>
                    <input style={inputStyle} type="number" min="0" step="0.1" value={consolApr || ""} onChange={(e) => setConsolApr(Number(e.target.value) || 0)} />
                  </div>
                  <div style={{ flex: "0 1 150px" }}>
                    <label style={labelStyle}>Term (years)</label>
                    <input style={inputStyle} type="number" min="1" max="15" value={consolTermYears || ""} onChange={(e) => setConsolTermYears(Number(e.target.value) || 0)} />
                  </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "14px 10px" }}>
                  <Metric label="New payment / mo" value={fmt(Math.round(consol.payment))} sub={`${consolTermYears} yr @ ${consolApr}%`} />
                  <Metric label="Consolidated interest" value={fmt(Math.round(consol.totalInterest))} sub="over the term" />
                  <Metric label="vs your plan" value={consolSaves >= 0 ? `Save ${fmt(Math.round(Math.abs(consolSaves)))}` : `Cost ${fmt(Math.round(Math.abs(consolSaves)))}`} sub={consolSaves >= 0 ? "less interest" : "more interest"} accent={consolSaves >= 0 ? "var(--green)" : "var(--red)"} />
                </div>
                <div style={{ marginTop: "12px", padding: "10px 12px", borderRadius: "10px", background: consolSaves >= 0 ? "rgba(34,197,94,0.08)" : "rgba(245,158,11,0.08)", border: `1px solid ${consolSaves >= 0 ? "rgba(34,197,94,0.18)" : "rgba(245,158,11,0.18)"}`, fontSize: "12px", color: "var(--text-secondary)", lineHeight: 1.55 }}>
                  {consolApr < avgApr
                    ? `At ${consolApr}% the new loan beats your ${avgApr.toFixed(1)}% blended APR. ${consolSaves >= 0 ? `Consolidating saves ~${fmt(Math.round(consolSaves))} in interest and simplifies to one payment.` : `But the ${consolTermYears}-year term stretches it out enough that you'd pay ~${fmt(Math.round(Math.abs(consolSaves)))} more interest overall — shorten the term to come out ahead.`}`
                    : `At ${consolApr}% the new loan is higher than your ${avgApr.toFixed(1)}% blended APR — consolidating wouldn't help here unless it's the only way to get a single manageable payment.`}
                </div>
              </div>
            )}

            {/* Add to plan — once debt-free, the minimum payments free up as savings */}
            {debtFree && totalMin > 0 && (
              <div style={cardStyle}>
                <span style={{ fontFamily: "var(--font-display)", fontSize: "13px", fontWeight: 700, display: "block", marginBottom: "10px" }}>Add to your plan</span>
                <AddToPlanButton
                  label="Debt paid off"
                  category="debt"
                  amountImpact={0}
                  recurringAnnual={Math.round(totalMin * 12)}
                  defaultYear={new Date().getFullYear() + Math.ceil(result.months / 12)}
                  note={`Once these debts are cleared (~${payoffDateLabel(result.months)}), the ${fmt(totalMin)}/mo in minimum payments frees up — modeled as +${fmt(Math.round(totalMin * 12))}/yr to your savings from that year.`}
                />
              </div>
            )}

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
