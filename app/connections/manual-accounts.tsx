"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { BankAccountRow } from "@/lib/connections/plaid";

// Manual accounts: balances no aggregator can reach (Robinhood spending, HSAs, cash
// under the mattress). Same table as Plaid accounts (item_id "manual"), so net worth
// treats them identically — these just update by hand instead of by sync.

function money(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const TYPE_OPTIONS = [
  { value: "depository", label: "Cash / checking / savings" },
  { value: "investment", label: "Investment / HSA / 401k" },
  { value: "credit", label: "Credit card (owed)" },
  { value: "loan", label: "Loan (owed)" },
];
const TYPE_EMOJI: Record<string, string> = { depository: "💵", credit: "💳", loan: "📄", investment: "📈" };

export default function ManualAccounts({ accounts }: { accounts: BankAccountRow[] }) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState("depository");
  const [balance, setBalance] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [editBal, setEditBal] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save(payload: Record<string, unknown>, method: "POST" | "DELETE" = "POST") {
    setBusy(true); setErr(null);
    try {
      const res = await fetch("/api/connections/manual", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const d = await res.json().catch(() => null);
      if (!res.ok) { setErr(d?.error ?? "Could not save."); return false; }
      router.refresh();
      return true;
    } catch { setErr("Network error."); return false; }
    finally { setBusy(false); }
  }

  async function addAccount() {
    const ok = await save({ name, type, balance: Number(balance) });
    if (ok) { setAdding(false); setName(""); setType("depository"); setBalance(""); }
  }

  async function updateBalance(a: BankAccountRow) {
    const ok = await save({ id: a.account_id, type: a.type, balance: Number(editBal) });
    if (ok) { setEditId(null); setEditBal(""); }
  }

  const total = accounts.reduce((s, a) => {
    const bal = Number(a.balance_current ?? 0);
    if (!Number.isFinite(bal)) return s;
    return a.type === "credit" || a.type === "loan" ? s - bal : s + bal;
  }, 0);

  return (
    <div>
      {!adding ? (
        <button
          type="button" onClick={() => { setAdding(true); setErr(null); }}
          style={{ width: "100%", padding: "10px", borderRadius: "10px", border: "1px solid rgba(251,191,36,0.35)", background: "rgba(251,191,36,0.1)", color: "#fbbf24", fontSize: "13px", fontWeight: 700, cursor: "pointer", fontFamily: "var(--font-body)" }}
        >
          {accounts.length > 0 ? "+ Add another account" : "+ Add an account"}
        </button>
      ) : (
        <div style={{ display: "grid", gap: "8px" }}>
          <label className="bt-sr-only" htmlFor="bt-manual-name">Account name</label>
          <input id="bt-manual-name" className="bt-input" placeholder="e.g. Robinhood spending" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
          <label className="bt-sr-only" htmlFor="bt-manual-type">Account type</label>
          <select id="bt-manual-type" className="bt-select" value={type} onChange={(e) => setType(e.target.value)}>
            {TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <label className="bt-sr-only" htmlFor="bt-manual-balance">Current balance</label>
          <input id="bt-manual-balance" className="bt-input" placeholder="Current balance" inputMode="decimal" value={balance} onChange={(e) => setBalance(e.target.value)} />
          <div style={{ display: "flex", gap: "8px" }}>
            <button type="button" disabled={busy || !name.trim() || !balance.trim()} onClick={() => void addAccount()}
              style={{ flex: 1, padding: "9px", borderRadius: "10px", border: "none", background: "#fbbf24", color: "#1a1206", fontSize: "12.5px", fontWeight: 700, cursor: "pointer", fontFamily: "var(--font-body)", opacity: busy || !name.trim() || !balance.trim() ? 0.6 : 1 }}>
              {busy ? "Saving…" : "Save"}
            </button>
            <button type="button" disabled={busy} onClick={() => setAdding(false)}
              style={{ padding: "9px 14px", borderRadius: "10px", border: "1px solid var(--card-border)", background: "var(--bg-elevated)", color: "var(--text-secondary)", fontSize: "12.5px", fontWeight: 600, cursor: "pointer", fontFamily: "var(--font-body)" }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {err && <p style={{ fontSize: "12px", color: "var(--red)", marginTop: "10px" }}>{err}</p>}

      {accounts.length > 0 && (
        <div style={{ marginTop: "14px" }}>
          {accounts.map((a) => (
            <div key={a.account_id} style={{ display: "flex", alignItems: "center", gap: "8px", padding: "8px 2px", borderTop: "1px solid var(--card-border)" }}>
              <span aria-hidden="true" style={{ fontSize: "14px" }}>{TYPE_EMOJI[a.type] ?? "💵"}</span>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: "12.5px", fontWeight: 600, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.name}</div>
                <div style={{ fontSize: "10.5px", color: "var(--text-tertiary)", textTransform: "capitalize" }}>{a.type === "depository" ? "cash" : a.type} · manual</div>
              </div>
              {editId === a.account_id ? (
                <span style={{ display: "inline-flex", gap: "6px", alignItems: "center" }}>
                  <label className="bt-sr-only" htmlFor={`bt-bal-${a.account_id}`}>New balance for {a.name}</label>
                  <input id={`bt-bal-${a.account_id}`} className="bt-input" inputMode="decimal" autoFocus value={editBal} onChange={(e) => setEditBal(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") void updateBalance(a); if (e.key === "Escape") setEditId(null); }}
                    style={{ width: "110px", padding: "6px 8px", fontSize: "12.5px" }} />
                  <button type="button" disabled={busy} onClick={() => void updateBalance(a)}
                    style={{ border: "none", background: "none", color: "var(--green)", fontWeight: 700, fontSize: "12px", cursor: "pointer" }}>Save</button>
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => { setEditId(a.account_id); setEditBal(String(a.balance_current ?? "")); }}
                  title="Update balance"
                  style={{ border: "none", background: "none", cursor: "pointer", fontFamily: "var(--font-mono)", fontSize: "12.5px", fontWeight: 600, color: a.type === "credit" || a.type === "loan" ? "var(--red)" : "var(--text-primary)", textDecoration: "underline dotted", textUnderlineOffset: "3px", padding: "4px" }}
                >
                  {a.type === "credit" || a.type === "loan" ? `−${money(a.balance_current)}` : money(a.balance_current)}
                  <span className="bt-sr-only">, tap to update balance for {a.name}</span>
                </button>
              )}
              <button type="button" disabled={busy} onClick={() => { if (window.confirm(`Remove ${a.name}?`)) void save({ id: a.account_id }, "DELETE"); }}
                style={{ background: "none", border: "none", color: "var(--text-tertiary)", cursor: "pointer", fontSize: "14px", padding: "4px" }}>
                <span aria-hidden="true">×</span><span className="bt-sr-only">Remove {a.name}</span>
              </button>
            </div>
          ))}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 2px 0", borderTop: "1px solid var(--card-border)", marginTop: "2px" }}>
            <span style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--text-tertiary)" }}>Net</span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: "13px", fontWeight: 700, color: total >= 0 ? "#00d395" : "var(--red, #f87171)" }}>{money(total)}</span>
          </div>
          <p style={{ fontSize: "10.5px", color: "var(--text-tertiary)", marginTop: "8px" }}>
            Tap a balance to update it. These count toward your net worth alongside linked accounts.
          </p>
        </div>
      )}
    </div>
  );
}
