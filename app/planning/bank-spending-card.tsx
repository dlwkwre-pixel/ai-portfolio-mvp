"use client";

import { useEffect, useState } from "react";

// "Spending from your bank" — live cash-flow awareness from linked banks (Plaid Phase 3).
// Fully self-contained: fetches its own data and renders NOTHING unless the user has
// bank access and transactions, so Cash Flow is untouched for everyone else.

type Payload = {
  hasData: boolean;
  month?: { key: string; spend: number; income: number; topCategories: { name: string; amount: number }[] };
  recent?: { id: string; date: string; name: string; amount: number; category: string; pending: boolean }[];
};

function money(n: number): string {
  return `$${Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function BankSpendingCard({ isPrivate = false }: { isPrivate?: boolean }) {
  const [data, setData] = useState<Payload | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/connections/plaid/transactions")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!cancelled && d?.hasData) setData(d); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  if (!data?.month) return null;
  const { month, recent = [] } = data;
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
            <div style={{ fontSize: "9px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--text-tertiary)" }}>Spent</div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: "17px", fontWeight: 800, color: "var(--red, #f87171)" }}>{ph(money(month.spend))}</div>
          </div>
          <div>
            <div style={{ fontSize: "9px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--text-tertiary)" }}>Received</div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: "17px", fontWeight: 800, color: "var(--green, #00d395)" }}>{ph(money(month.income))}</div>
          </div>
        </div>
      </div>

      {month.topCategories.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "7px", marginBottom: "14px" }}>
          {month.topCategories.map((c) => (
            <div key={c.name} style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <span style={{ fontSize: "11.5px", color: "var(--text-secondary)", width: "128px", flexShrink: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</span>
              <div style={{ flex: 1, height: "6px", borderRadius: "3px", background: "var(--bg-elevated)", overflow: "hidden" }}>
                <div style={{ width: `${(c.amount / maxCat) * 100}%`, height: "100%", borderRadius: "3px", background: "linear-gradient(90deg,#2563eb,#7c3aed)" }} />
              </div>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: "11.5px", fontWeight: 600, color: "var(--text-primary)", width: "76px", textAlign: "right", flexShrink: 0 }}>{ph(money(c.amount))}</span>
            </div>
          ))}
        </div>
      )}

      {recent.length > 0 && (
        <details>
          <summary style={{ fontSize: "11.5px", fontWeight: 600, color: "var(--brand-blue, #60a5fa)", cursor: "pointer", listStyle: "none" }}>
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
