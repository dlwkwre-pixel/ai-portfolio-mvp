"use client";

import { useState, useTransition } from "react";
import { deleteCashActivity, updateCashActivity } from "./actions";

const CASH_REASONS = ["deposit", "withdrawal", "dividend", "adjustment_in", "adjustment_out", "fee"] as const;
type CashReason = (typeof CASH_REASONS)[number];

type CashEntry = {
  id: string;
  amount: number;
  direction: "IN" | "OUT";
  reason: string;
  effective_at: string;
};

function formatMoney(v: number) {
  return v.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function toDateInputValue(iso: string) {
  return iso.split("T")[0];
}

export function CashActivityList({ entries, portfolioId }: { entries: CashEntry[]; portfolioId: string }) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editAmount, setEditAmount] = useState("");
  const [editReason, setEditReason] = useState<CashReason>("deposit");
  const [editDate, setEditDate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function startEdit(entry: CashEntry) {
    setEditingId(entry.id);
    setEditAmount(String(entry.amount));
    setEditReason(entry.reason as CashReason);
    setEditDate(toDateInputValue(entry.effective_at));
    setError(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setError(null);
  }

  function handleDelete(entryId: string) {
    if (!confirm("Delete this cash activity? This will reverse the balance change.")) return;
    setError(null);
    startTransition(async () => {
      try {
        await deleteCashActivity(entryId, portfolioId);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Delete failed.");
      }
    });
  }

  function handleSave(entryId: string) {
    const amount = Number(editAmount);
    if (!Number.isFinite(amount) || amount <= 0) { setError("Amount must be greater than 0."); return; }
    setError(null);
    startTransition(async () => {
      try {
        await updateCashActivity(entryId, portfolioId, amount, editReason, editDate + "T00:00:00.000Z");
        setEditingId(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Update failed.");
      }
    });
  }

  if (entries.length === 0) return null;

  return (
    <div style={{ marginTop: "12px", display: "flex", flexDirection: "column", gap: "4px" }}>
      {error && (
        <p style={{ fontSize: "11px", color: "var(--red)", padding: "6px 10px", background: "rgba(255,60,60,0.08)", borderRadius: "var(--radius-sm)", marginBottom: "4px" }}>
          {error}
        </p>
      )}
      {entries.map((entry) => {
        const isEditing = editingId === entry.id;
        return (
          <div key={entry.id} style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-md)", overflow: "hidden" }}>
            {isEditing ? (
              <div style={{ padding: "10px", display: "flex", flexDirection: "column", gap: "8px" }}>
                <div style={{ display: "flex", gap: "6px" }}>
                  <select
                    value={editReason}
                    onChange={(e) => setEditReason(e.target.value as CashReason)}
                    disabled={isPending}
                    style={{ flex: 1, fontSize: "12px", padding: "5px 8px", background: "var(--bg-base)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-sm)", color: "var(--text-primary)" }}
                  >
                    {CASH_REASONS.map((r) => (
                      <option key={r} value={r}>{r.replaceAll("_", " ")}</option>
                    ))}
                  </select>
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={editAmount}
                    onChange={(e) => setEditAmount(e.target.value)}
                    disabled={isPending}
                    style={{ width: "90px", fontSize: "12px", padding: "5px 8px", background: "var(--bg-base)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-sm)", color: "var(--text-primary)", fontFamily: "var(--font-mono)" }}
                  />
                </div>
                <input
                  type="date"
                  value={editDate}
                  onChange={(e) => setEditDate(e.target.value)}
                  disabled={isPending}
                  style={{ fontSize: "12px", padding: "5px 8px", background: "var(--bg-base)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-sm)", color: "var(--text-primary)" }}
                />
                <div style={{ display: "flex", gap: "6px" }}>
                  <button
                    onClick={() => handleSave(entry.id)}
                    disabled={isPending}
                    style={{ flex: 1, fontSize: "11px", padding: "5px", background: "var(--blue)", color: "#fff", border: "none", borderRadius: "var(--radius-sm)", cursor: "pointer", opacity: isPending ? 0.6 : 1 }}
                  >
                    {isPending ? "Saving…" : "Save"}
                  </button>
                  <button
                    onClick={cancelEdit}
                    disabled={isPending}
                    style={{ flex: 1, fontSize: "11px", padding: "5px", background: "var(--bg-card)", color: "var(--text-secondary)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-sm)", cursor: "pointer" }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 10px" }}>
                <div>
                  <p style={{ fontSize: "12px", color: "var(--text-primary)", textTransform: "capitalize" }}>{entry.reason.replaceAll("_", " ")}</p>
                  <p style={{ fontSize: "10px", color: "var(--text-tertiary)", marginTop: "1px" }}>{new Date(entry.effective_at).toLocaleString()}</p>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <p style={{ fontSize: "12px", fontFamily: "var(--font-mono)", fontWeight: 500, color: entry.direction === "IN" ? "var(--green)" : "var(--red)" }}>
                    {entry.direction === "IN" ? "+" : "-"}{formatMoney(Number(entry.amount))}
                  </p>
                  <button
                    onClick={() => startEdit(entry)}
                    disabled={isPending}
                    title="Edit"
                    style={{ background: "none", border: "none", cursor: "pointer", padding: "2px", color: "var(--text-tertiary)", lineHeight: 1 }}
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                    </svg>
                  </button>
                  <button
                    onClick={() => handleDelete(entry.id)}
                    disabled={isPending}
                    title="Delete"
                    style={{ background: "none", border: "none", cursor: "pointer", padding: "2px", color: "var(--text-tertiary)", lineHeight: 1 }}
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="3 6 5 6 21 6"/>
                      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                      <path d="M10 11v6M14 11v6"/>
                      <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
                    </svg>
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
