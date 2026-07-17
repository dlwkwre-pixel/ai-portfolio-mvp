"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

// Danger zone: permanent account deletion. Requires typing DELETE, calls the server
// route that revokes brokerage/bank connections, removes every row the user owns, and
// deletes the login itself — then signs out locally and returns to the landing page.
export default function DeleteAccount() {
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Keyboard users can always escape the dialog (unless deletion is in flight).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !busy) setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy]);

  async function handleDelete() {
    if (confirm !== "DELETE" || busy) return;
    setBusy(true); setErr(null);
    try {
      const res = await fetch("/api/account/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm }),
      });
      const d = await res.json().catch(() => null);
      if (!res.ok) { setErr(d?.error ?? "Deletion failed. Contact support@buytune.io."); setBusy(false); return; }
      try { await createClient().auth.signOut(); } catch { /* session is already gone server-side */ }
      window.location.href = "/";
    } catch {
      setErr("Network error. Nothing was deleted — try again.");
      setBusy(false);
    }
  }

  return (
    <div style={{ borderTop: "1px solid var(--border-subtle)", paddingTop: "24px", paddingBottom: "8px" }}>
      <p style={{ fontSize: "10px", fontWeight: 700, color: "var(--red)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "8px" }}>Danger zone</p>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
        <p style={{ fontSize: "12.5px", color: "var(--text-tertiary)", maxWidth: "48ch", lineHeight: 1.6 }}>
          Permanently delete your account and all data on our servers — portfolios, plans, posts, and any
          linked bank or brokerage connections. This cannot be undone.
        </p>
        <button
          type="button"
          onClick={() => { setOpen(true); setConfirm(""); setErr(null); }}
          style={{ padding: "9px 14px", borderRadius: "10px", border: "1px solid rgba(248,113,113,0.35)", background: "rgba(248,113,113,0.08)", color: "var(--red)", fontSize: "12.5px", fontWeight: 700, cursor: "pointer", fontFamily: "var(--font-body)", flexShrink: 0, minHeight: "44px" }}
        >
          Delete account
        </button>
      </div>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Confirm account deletion"
          onClick={() => !busy && setOpen(false)}
          style={{ position: "fixed", inset: 0, zIndex: 10000, background: "rgba(2,7,18,0.85)", backdropFilter: "blur(6px)", display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}
        >
          <div onClick={(e) => e.stopPropagation()} style={{ background: "var(--bg-elevated)", border: "1px solid rgba(248,113,113,0.35)", borderRadius: "16px", padding: "24px", width: "100%", maxWidth: "440px" }}>
            <h2 style={{ fontSize: "16px", fontWeight: 800, color: "var(--text-primary)", marginBottom: "10px" }}>Delete your account?</h2>
            <p style={{ fontSize: "13px", color: "var(--text-secondary)", lineHeight: 1.65, marginBottom: "8px" }}>
              This permanently erases everything tied to your account:
            </p>
            <ul style={{ fontSize: "12.5px", color: "var(--text-tertiary)", lineHeight: 1.7, paddingLeft: "18px", listStyle: "disc", marginBottom: "14px" }}>
              <li>Portfolios, holdings, history, and AI analyses</li>
              <li>Plans, scenarios, journal entries, and community posts</li>
              <li>Bank and brokerage links (access revoked at the provider too)</li>
              <li>Your login itself</li>
            </ul>
            <label htmlFor="bt-delete-confirm" style={{ display: "block", fontSize: "12px", color: "var(--text-secondary)", marginBottom: "6px" }}>
              Type <strong style={{ color: "var(--red)" }}>DELETE</strong> to confirm
            </label>
            <input
              id="bt-delete-confirm"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="off"
              className="bt-input"
              style={{ width: "100%", marginBottom: "12px" }}
            />
            {err && <p style={{ fontSize: "12px", color: "var(--red)", marginBottom: "10px" }}>{err}</p>}
            <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
              <button type="button" onClick={() => setOpen(false)} disabled={busy}
                style={{ padding: "9px 14px", borderRadius: "10px", border: "1px solid var(--card-border)", background: "var(--card-bg)", color: "var(--text-secondary)", fontSize: "12.5px", fontWeight: 600, cursor: "pointer", fontFamily: "var(--font-body)", minHeight: "44px" }}>
                Cancel
              </button>
              <button type="button" onClick={() => void handleDelete()} disabled={confirm !== "DELETE" || busy}
                style={{ padding: "9px 16px", borderRadius: "10px", border: "none", background: confirm === "DELETE" && !busy ? "var(--red)" : "rgba(248,113,113,0.25)", color: "#fff", fontSize: "12.5px", fontWeight: 700, cursor: confirm === "DELETE" && !busy ? "pointer" : "not-allowed", fontFamily: "var(--font-body)", minHeight: "44px" }}>
                {busy ? "Deleting…" : "Delete everything"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
