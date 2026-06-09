"use client";

import { useState, useTransition } from "react";
import { deleteCashActivity, updateCashActivity, restoreCashActivity, previewCashActivityDeletion } from "./actions";

const CASH_REASONS = ["deposit", "withdrawal", "dividend", "adjustment_in", "adjustment_out", "fee"] as const;
type CashReason = (typeof CASH_REASONS)[number];

type CashEntry = {
  id: string;
  amount: number;
  direction: "IN" | "OUT";
  reason: string;
  effective_at: string;
};

type ArchivedEntry = {
  id: string;
  original_id: string;
  amount: number;
  direction: "IN" | "OUT";
  reason: string;
  effective_at: string;
  deleted_at: string;
};

type DeletePreview = {
  currentTwr: number | null;
  simulatedTwr: number | null;
  amount: number;
  direction: string;
};

function formatMoney(v: number) {
  return v.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function formatPct(v: number | null) {
  if (v === null) return "—";
  return (v >= 0 ? "+" : "") + v.toFixed(2) + "%";
}

function toDateInputValue(iso: string) {
  return iso.split("T")[0];
}

export function CashActivityList({
  entries,
  archivedEntries,
  portfolioId,
}: {
  entries: CashEntry[];
  archivedEntries: ArchivedEntry[];
  portfolioId: string;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editAmount, setEditAmount] = useState("");
  const [editReason, setEditReason] = useState<CashReason>("deposit");
  const [editDate, setEditDate] = useState("");

  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [deletePreview, setDeletePreview] = useState<DeletePreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const [showArchive, setShowArchive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function startEdit(entry: CashEntry) {
    setEditingId(entry.id);
    setEditAmount(String(entry.amount));
    setEditReason(entry.reason as CashReason);
    setEditDate(toDateInputValue(entry.effective_at));
    setPendingDeleteId(null);
    setDeletePreview(null);
    setError(null);
  }

  function cancelEdit() { setEditingId(null); setError(null); }

  async function requestDelete(entry: CashEntry) {
    setPendingDeleteId(entry.id);
    setDeletePreview(null);
    setEditingId(null);
    setError(null);
    setPreviewLoading(true);
    try {
      const preview = await previewCashActivityDeletion(entry.id, portfolioId);
      setDeletePreview(preview);
    } catch {
      // preview failed — still allow delete without it
    } finally {
      setPreviewLoading(false);
    }
  }

  function cancelDelete() {
    setPendingDeleteId(null);
    setDeletePreview(null);
  }

  function confirmDelete(entryId: string) {
    setError(null);
    startTransition(async () => {
      try {
        await deleteCashActivity(entryId, portfolioId);
        setPendingDeleteId(null);
        setDeletePreview(null);
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

  function handleRestore(archiveId: string) {
    setError(null);
    startTransition(async () => {
      try {
        await restoreCashActivity(archiveId, portfolioId);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Restore failed.");
      }
    });
  }

  const twrImprovesOnDelete = deletePreview && deletePreview.simulatedTwr !== null && deletePreview.currentTwr !== null
    ? deletePreview.simulatedTwr > deletePreview.currentTwr
    : null;

  return (
    <div style={{ marginTop: "12px", display: "flex", flexDirection: "column", gap: "4px" }}>
      {error && (
        <p style={{ fontSize: "11px", color: "var(--red)", padding: "6px 10px", background: "rgba(255,60,60,0.08)", borderRadius: "var(--radius-sm)", marginBottom: "4px" }}>
          {error}
        </p>
      )}

      {entries.length === 0 && archivedEntries.length === 0 && null}

      {entries.map((entry) => {
        const isEditing = editingId === entry.id;
        const isPendingDelete = pendingDeleteId === entry.id;

        return (
          <div key={entry.id} style={{ background: "var(--bg-elevated)", border: `1px solid ${isPendingDelete ? "rgba(255,60,60,0.35)" : "var(--border-subtle)"}`, borderRadius: "var(--radius-md)", overflow: "hidden", transition: "border-color 0.15s" }}>
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
                    type="number" min="0.01" step="0.01"
                    value={editAmount}
                    onChange={(e) => setEditAmount(e.target.value)}
                    disabled={isPending}
                    style={{ width: "90px", fontSize: "12px", padding: "5px 8px", background: "var(--bg-base)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-sm)", color: "var(--text-primary)", fontFamily: "var(--font-mono)" }}
                  />
                </div>
                <input
                  type="date" value={editDate}
                  onChange={(e) => setEditDate(e.target.value)}
                  disabled={isPending}
                  style={{ fontSize: "12px", padding: "5px 8px", background: "var(--bg-base)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-sm)", color: "var(--text-primary)" }}
                />
                <div style={{ display: "flex", gap: "6px" }}>
                  <button onClick={() => handleSave(entry.id)} disabled={isPending}
                    style={{ flex: 1, fontSize: "11px", padding: "5px", background: "var(--blue)", color: "#fff", border: "none", borderRadius: "var(--radius-sm)", cursor: "pointer", opacity: isPending ? 0.6 : 1 }}>
                    {isPending ? "Saving…" : "Save"}
                  </button>
                  <button onClick={cancelEdit} disabled={isPending}
                    style={{ flex: 1, fontSize: "11px", padding: "5px", background: "var(--bg-card)", color: "var(--text-secondary)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-sm)", cursor: "pointer" }}>
                    Cancel
                  </button>
                </div>
              </div>
            ) : isPendingDelete ? (
              <div style={{ padding: "10px", display: "flex", flexDirection: "column", gap: "8px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div>
                    <p style={{ fontSize: "12px", color: "var(--text-primary)", textTransform: "capitalize" }}>{entry.reason.replaceAll("_", " ")}</p>
                    <p style={{ fontSize: "10px", color: "var(--text-tertiary)", marginTop: "1px" }}>{new Date(entry.effective_at).toLocaleString()}</p>
                  </div>
                  <p style={{ fontSize: "12px", fontFamily: "var(--font-mono)", fontWeight: 500, color: entry.direction === "IN" ? "var(--green)" : "var(--red)" }}>
                    {entry.direction === "IN" ? "+" : "-"}{formatMoney(Number(entry.amount))}
                  </p>
                </div>

                {previewLoading ? (
                  <p style={{ fontSize: "11px", color: "var(--text-tertiary)" }}>Calculating impact…</p>
                ) : deletePreview ? (
                  <div style={{ padding: "8px", background: "rgba(255,60,60,0.07)", border: "1px solid rgba(255,60,60,0.18)", borderRadius: "var(--radius-sm)" }}>
                    <p style={{ fontSize: "11px", color: "var(--text-secondary)", marginBottom: "4px" }}>Return impact if deleted:</p>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <span style={{ fontSize: "12px", fontFamily: "var(--font-mono)", color: "var(--text-tertiary)" }}>{formatPct(deletePreview.currentTwr)}</span>
                      <span style={{ fontSize: "10px", color: "var(--text-tertiary)" }}>→</span>
                      <span style={{ fontSize: "12px", fontFamily: "var(--font-mono)", fontWeight: 600, color: twrImprovesOnDelete ? "var(--green)" : "var(--red)" }}>
                        {formatPct(deletePreview.simulatedTwr)}
                      </span>
                      {twrImprovesOnDelete !== null && (
                        <span style={{ fontSize: "10px", color: twrImprovesOnDelete ? "var(--green)" : "var(--red)" }}>
                          ({twrImprovesOnDelete ? "improves" : "lowers"})
                        </span>
                      )}
                    </div>
                    <p style={{ fontSize: "10px", color: "var(--text-tertiary)", marginTop: "4px" }}>Entry moves to Recently Deleted — you can restore it anytime.</p>
                  </div>
                ) : null}

                <div style={{ display: "flex", gap: "6px" }}>
                  <button onClick={() => confirmDelete(entry.id)} disabled={isPending}
                    style={{ flex: 1, fontSize: "11px", padding: "5px", background: "rgba(255,60,60,0.15)", color: "var(--red)", border: "1px solid rgba(255,60,60,0.3)", borderRadius: "var(--radius-sm)", cursor: "pointer", opacity: isPending ? 0.6 : 1 }}>
                    {isPending ? "Deleting…" : "Confirm delete"}
                  </button>
                  <button onClick={cancelDelete} disabled={isPending}
                    style={{ flex: 1, fontSize: "11px", padding: "5px", background: "var(--bg-card)", color: "var(--text-secondary)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-sm)", cursor: "pointer" }}>
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
                  <button onClick={() => startEdit(entry)} disabled={isPending} title="Edit"
                    style={{ background: "none", border: "none", cursor: "pointer", padding: "2px", color: "var(--text-tertiary)", lineHeight: 1 }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                    </svg>
                  </button>
                  <button onClick={() => requestDelete(entry)} disabled={isPending} title="Delete"
                    style={{ background: "none", border: "none", cursor: "pointer", padding: "2px", color: "var(--text-tertiary)", lineHeight: 1 }}>
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

      {archivedEntries.length > 0 && (
        <div style={{ marginTop: "8px" }}>
          <button
            onClick={() => setShowArchive((v) => !v)}
            style={{ fontSize: "11px", color: "var(--text-tertiary)", background: "none", border: "none", cursor: "pointer", padding: "4px 0", display: "flex", alignItems: "center", gap: "4px" }}
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ transform: showArchive ? "rotate(90deg)" : "none", transition: "transform 0.15s" }}>
              <polyline points="9 18 15 12 9 6"/>
            </svg>
            Recently deleted ({archivedEntries.length})
          </button>

          {showArchive && (
            <div style={{ marginTop: "6px", display: "flex", flexDirection: "column", gap: "4px" }}>
              {archivedEntries.map((archived) => (
                <div key={archived.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 10px", background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-md)", opacity: 0.7 }}>
                  <div>
                    <p style={{ fontSize: "12px", color: "var(--text-secondary)", textTransform: "capitalize" }}>{archived.reason.replaceAll("_", " ")}</p>
                    <p style={{ fontSize: "10px", color: "var(--text-tertiary)", marginTop: "1px" }}>
                      {new Date(archived.effective_at).toLocaleDateString()} · deleted {new Date(archived.deleted_at).toLocaleDateString()}
                    </p>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <p style={{ fontSize: "12px", fontFamily: "var(--font-mono)", fontWeight: 500, color: "var(--text-tertiary)" }}>
                      {archived.direction === "IN" ? "+" : "-"}{formatMoney(Number(archived.amount))}
                    </p>
                    <button onClick={() => handleRestore(archived.id)} disabled={isPending} title="Restore"
                      style={{ fontSize: "10px", padding: "3px 7px", background: "var(--bg-card)", color: "var(--text-secondary)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-sm)", cursor: "pointer", opacity: isPending ? 0.6 : 1 }}>
                      Restore
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
