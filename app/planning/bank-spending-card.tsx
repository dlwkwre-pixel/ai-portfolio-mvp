"use client";

import { useEffect, useState } from "react";
import { addCashFlowItem } from "./planning-actions";

// "Spending from your bank" — live cash-flow awareness from linked banks (Plaid Phase 3)
// plus the Subscription Radar: recurring charges detected in the transaction window,
// each one addable to the budget with a click. Fully self-contained: fetches its own
// data and renders NOTHING unless the user has bank access and transactions.

type Subscription = {
  merchant: string; cadence: "weekly" | "biweekly" | "monthly" | "quarterly";
  avgAmount: number; monthlyEquivalent: number; count: number;
  lastDate: string; lastAmount: number; priceIncreased: boolean;
};

type Payload = {
  hasData: boolean;
  month?: { key: string; spend: number; income: number; topCategories: { name: string; amount: number }[] };
  subscriptions?: Subscription[];
  recent?: { id: string; date: string; name: string; amount: number; category: string; pending: boolean }[];
};

function money(n: number): string {
  return `$${Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function BankSpendingCard({ isPrivate = false }: { isPrivate?: boolean }) {
  const [data, setData] = useState<Payload | null>(null);
  const [added, setAdded] = useState<Set<string>>(new Set());
  const [addingKey, setAddingKey] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/connections/plaid/transactions")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!cancelled && d?.hasData) setData(d); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  async function addToBudget(s: Subscription) {
    if (addingKey) return;
    setAddingKey(s.merchant);
    try {
      const fd = new FormData();
      fd.set("label", s.merchant);
      fd.set("type", "expense");
      fd.set("frequency", "monthly");
      fd.set("amount", String(s.monthlyEquivalent));
      fd.set("category", "subscriptions");
      const r = await addCashFlowItem(fd);
      if (!r?.error) setAdded((prev) => new Set(prev).add(s.merchant));
    } catch { /* leave button re-tryable */ }
    finally { setAddingKey(null); }
  }

  if (!data?.month) return null;
  const { month, recent = [], subscriptions = [] } = data;
  const subsMonthly = subscriptions.reduce((s, x) => s + x.monthlyEquivalent, 0);
  const maxCat = Math.max(1, ...month.topCategories.map((c) => c.amount));
  const monthName = new Date(`${month.key}-15T00:00:00`).toLocaleDateString(undefined, { month: "long" });
  const ph = (s: string) => (isPrivate ? "$••••" : s);

  return (
    <div className="bt-card" style={{ ["--card-bg" as string]: "var(--bg-surface)" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "10px", marginBottom: "14px", flexWrap: "wrap" }}>
        <div>
          <h3 style={{ fontSize: "13px", fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>💳 Spending from your bank</h3>
          <p style={{ fontSize: "11px", color: "var(--text-tertiary)", margin: "3px 0 0" }}>{monthName} so far · live from your linked accounts, updates with each sync</p>
        </div>
        <div style={{ display: "flex", gap: "18px" }}>
          <div>
            <div style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--text-tertiary)" }}>Spent</div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: "17px", fontWeight: 800, color: "var(--red)" }}>{ph(money(month.spend))}</div>
          </div>
          <div>
            <div style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--text-tertiary)" }}>Received</div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: "17px", fontWeight: 800, color: "var(--green)" }}>{ph(money(month.income))}</div>
          </div>
        </div>
      </div>

      {month.topCategories.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "7px", marginBottom: "14px" }}>
          {month.topCategories.map((c) => (
            <div key={c.name} style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <span style={{ fontSize: "11.5px", color: "var(--text-secondary)", width: "128px", flexShrink: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</span>
              <div style={{ flex: 1, height: "6px", borderRadius: "3px", background: "var(--bg-elevated)", overflow: "hidden" }}>
                <div style={{ width: `${(c.amount / maxCat) * 100}%`, height: "100%", borderRadius: "3px", background: "linear-gradient(90deg,#0ea5a0,#3fae4a)" }} />
              </div>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: "11.5px", fontWeight: 600, color: "var(--text-primary)", width: "76px", textAlign: "right", flexShrink: 0 }}>{ph(money(c.amount))}</span>
            </div>
          ))}
        </div>
      )}

      {subscriptions.length > 0 && (
        <div style={{ marginBottom: "14px", padding: "12px 14px", borderRadius: "10px", background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)" }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "8px", marginBottom: "8px" }}>
            <span style={{ fontSize: "12px", fontWeight: 700, color: "var(--text-primary)" }}>🔁 Subscription Radar</span>
            <span style={{ fontSize: "11.5px", color: "var(--text-tertiary)" }}>
              {subscriptions.length} recurring · <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--text-primary)" }}>{ph(money(subsMonthly))}</span>/mo
            </span>
          </div>
          {subscriptions.map((s) => (
            <div key={s.merchant} style={{ display: "flex", alignItems: "center", gap: "8px", padding: "6px 0", borderTop: "1px solid var(--border-subtle)" }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {s.merchant}
                  {s.priceIncreased && <span title="This charge has gone up since the start of the window" style={{ marginLeft: "6px", fontSize: "10px", fontWeight: 700, color: "#f59e0b", background: "rgba(245,158,11,0.12)", border: "1px solid rgba(245,158,11,0.3)", borderRadius: "999px", padding: "1px 6px" }}>↑ price</span>}
                </div>
                <div style={{ fontSize: "10px", color: "var(--text-tertiary)" }}>{s.cadence} · {s.count}× in window</div>
              </div>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: "12px", fontWeight: 600, color: "var(--text-primary)", flexShrink: 0 }}>{ph(money(s.monthlyEquivalent))}/mo</span>
              {added.has(s.merchant) ? (
                <span style={{ fontSize: "10.5px", fontWeight: 700, color: "var(--green)", flexShrink: 0 }}>✓ in budget</span>
              ) : (
                <button
                  type="button" disabled={addingKey !== null} onClick={() => void addToBudget(s)}
                  title="Add this as a monthly expense line in your budget"
                  style={{ fontSize: "10.5px", fontWeight: 700, color: "var(--brand-blue, #3fc9c3)", background: "none", border: "1px solid var(--border-subtle)", borderRadius: "7px", padding: "4px 8px", cursor: "pointer", flexShrink: 0, opacity: addingKey === s.merchant ? 0.6 : 1 }}
                >
                  {addingKey === s.merchant ? "Adding…" : "+ Budget"}
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {recent.length > 0 && (
        <details>
          <summary style={{ fontSize: "11.5px", fontWeight: 600, color: "var(--brand-blue, #3fc9c3)", cursor: "pointer", listStyle: "none" }}>
            Recent transactions ({recent.length})
          </summary>
          <div style={{ marginTop: "8px" }}>
            {recent.map((t) => (
              <div key={t.id} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "6px 0", borderTop: "1px solid var(--border-subtle)" }}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: "10px", color: "var(--text-tertiary)", width: "44px", flexShrink: 0 }}>
                  {new Date(t.date + "T12:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                </span>
                <span style={{ flex: 1, fontSize: "12px", color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {t.name}{t.pending ? " · pending" : ""}
                </span>
                <span style={{ fontSize: "10px", color: "var(--text-tertiary)", flexShrink: 0 }}>{t.category}</span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: "12px", fontWeight: 600, color: t.amount > 0 ? "var(--text-primary)" : "var(--green, #00d395)", width: "84px", textAlign: "right", flexShrink: 0 }}>
                  {t.amount > 0 ? `−${ph(money(t.amount))}` : `+${ph(money(t.amount))}`}
                </span>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
