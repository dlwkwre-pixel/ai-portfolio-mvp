"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import type { BankStatus } from "@/lib/connections/plaid";

// Plaid Link flow: fetch a link_token → open the Plaid widget (CDN script, loaded on
// demand) → exchange the public_token server-side → balances appear. Read-only.

declare global {
  interface Window {
    Plaid?: {
      create: (opts: {
        token: string;
        onSuccess: (publicToken: string, metadata: { institution?: { name?: string } | null }) => void;
        onExit: (err: unknown) => void;
      }) => { open: () => void };
    };
  }
}

const PLAID_SCRIPT = "https://cdn.plaid.com/link/v2/stable/link-initialize.js";

async function ensurePlaidScript(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  if (window.Plaid) return true;
  return new Promise((resolve) => {
    const existing = document.querySelector(`script[src="${PLAID_SCRIPT}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve(!!window.Plaid));
      existing.addEventListener("error", () => resolve(false));
      if (window.Plaid) resolve(true);
      return;
    }
    const s = document.createElement("script");
    s.src = PLAID_SCRIPT;
    s.async = true;
    s.onload = () => resolve(!!window.Plaid);
    s.onerror = () => resolve(false);
    document.head.appendChild(s);
  });
}

function money(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const TYPE_EMOJI: Record<string, string> = { depository: "🏦", credit: "💳", loan: "📄", investment: "📈" };

export default function PlaidConnect({ status }: { status: BankStatus }) {
  const router = useRouter();
  const [busy, setBusy] = useState<null | "link" | "refresh">(null);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const connect = useCallback(async () => {
    setBusy("link"); setErr(null); setMsg(null);
    try {
      const res = await fetch("/api/connections/plaid/link-token", { method: "POST" });
      const d = await res.json();
      if (!res.ok) { setErr(d.error ?? "Could not start bank linking."); return; }
      const ok = await ensurePlaidScript();
      if (!ok || !window.Plaid) { setErr("Couldn't load the secure bank widget. Check your connection and try again."); return; }
      const handler = window.Plaid.create({
        token: d.linkToken,
        onSuccess: async (publicToken, metadata) => {
          try {
            const ex = await fetch("/api/connections/plaid/exchange", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ publicToken, institution: metadata?.institution?.name ?? null }),
            });
            const ed = await ex.json();
            if (!ex.ok) { setErr(ed.error ?? "Bank link failed."); return; }
            setMsg(`Connected · ${ed.accounts} account${ed.accounts === 1 ? "" : "s"} imported.`);
            router.refresh();
          } catch { setErr("Network error while finishing the link."); }
          finally { setBusy(null); }
        },
        onExit: () => setBusy(null),
      });
      handler.open();
      return; // busy cleared in onSuccess/onExit
    } catch { setErr("Network error."); }
    setBusy(null);
  }, [router]);

  async function refresh() {
    setBusy("refresh"); setErr(null); setMsg(null);
    try {
      const res = await fetch("/api/connections/plaid/refresh", { method: "POST" });
      const d = await res.json();
      if (!res.ok) { setErr(d.error ?? "Refresh failed."); return; }
      setMsg(`Refreshed ${d.accounts} account${d.accounts === 1 ? "" : "s"}.`);
      router.refresh();
    } catch { setErr("Network error."); }
    finally { setBusy(null); }
  }

  async function unlink(itemId: string) {
    setBusy("refresh"); setErr(null); setMsg(null);
    try {
      const res = await fetch("/api/connections/plaid/remove", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId }),
      });
      const d = await res.json();
      if (!res.ok) { setErr(d.error ?? "Unlink failed."); return; }
      setMsg("Bank unlinked — access revoked.");
      router.refresh();
    } catch { setErr("Network error."); }
    finally { setBusy(null); }
  }

  const hasAccounts = status.accounts.length > 0;
  const total = status.accounts.reduce((s, a) => {
    const bal = Number(a.balance_current ?? 0);
    if (!Number.isFinite(bal)) return s;
    return a.type === "credit" || a.type === "loan" ? s - bal : s + bal;
  }, 0);
  const lastSynced = status.connections.map((c) => c.lastSyncedAt).filter(Boolean).sort().pop() ?? null;

  return (
    <div>
      <div style={{ display: "flex", gap: "8px" }}>
        <button
          type="button" onClick={() => void connect()} disabled={busy !== null}
          style={{ flex: 1, padding: "10px", borderRadius: "10px", border: "1px solid rgba(129,140,248,0.4)", background: "rgba(129,140,248,0.12)", color: "#5fbf9a", fontSize: "13px", fontWeight: 700, cursor: busy ? "default" : "pointer", fontFamily: "var(--font-body)", opacity: busy === "link" ? 0.7 : 1 }}
        >
          {busy === "link" ? "Opening secure link…" : hasAccounts ? "✓ Connected · add another bank" : "Connect a bank"}
        </button>
        {hasAccounts && (
          <button
            type="button" onClick={() => void refresh()} disabled={busy !== null} aria-label="Refresh balances"
            style={{ padding: "10px 14px", borderRadius: "10px", border: "1px solid var(--card-border)", background: "var(--bg-elevated)", color: "var(--text-secondary)", fontSize: "13px", fontWeight: 600, cursor: busy ? "default" : "pointer", fontFamily: "var(--font-body)", opacity: busy === "refresh" ? 0.7 : 1 }}
          >
            {busy === "refresh" ? "…" : "↻"}
          </button>
        )}
      </div>

      {err && <p style={{ fontSize: "12px", color: "var(--red)", marginTop: "10px" }}>{err}</p>}
      {msg && <p style={{ fontSize: "12px", color: "var(--green)", marginTop: "10px" }}>{msg}</p>}

      {hasAccounts && (
        <div style={{ marginTop: "14px" }}>
          {status.accounts.map((a) => (
            <div key={a.account_id} style={{ display: "flex", alignItems: "center", gap: "8px", padding: "8px 2px", borderTop: "1px solid var(--card-border)" }}>
              <span style={{ fontSize: "14px" }}>{TYPE_EMOJI[a.type] ?? "🏦"}</span>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: "12.5px", fontWeight: 600, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {a.name}{a.mask ? ` ··${a.mask}` : ""}
                </div>
                <div style={{ fontSize: "10.5px", color: "var(--text-tertiary)", textTransform: "capitalize" }}>{a.subtype ?? a.type}</div>
              </div>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: "12.5px", fontWeight: 600, color: a.type === "credit" || a.type === "loan" ? "var(--red, #f87171)" : "var(--text-primary)" }}>
                {a.type === "credit" || a.type === "loan" ? `−${money(a.balance_current)}` : money(a.balance_current)}
              </span>
            </div>
          ))}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 2px 0", borderTop: "1px solid var(--card-border)", marginTop: "2px" }}>
            <span style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--text-tertiary)" }}>Net</span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: "13px", fontWeight: 700, color: total >= 0 ? "#00d395" : "var(--red, #f87171)" }}>{money(total)}</span>
          </div>
          {lastSynced && (
            <p style={{ fontSize: "10.5px", color: "var(--text-tertiary)", marginTop: "8px" }}>
              Balances as of {new Date(lastSynced).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })} · read-only, BuyTune can never move money
            </p>
          )}
          {status.connections.length > 0 && (
            <div style={{ marginTop: "10px", display: "flex", flexDirection: "column", gap: "4px" }}>
              {status.connections.map((c) => (
                <div key={c.itemId} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
                  <span style={{ fontSize: "10.5px", color: "var(--text-tertiary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {c.institution ?? "Linked bank"}{c.lastError ? " · sync issue" : ""}
                  </span>
                  <button
                    type="button" disabled={busy !== null}
                    onClick={() => { if (window.confirm(`Unlink ${c.institution ?? "this bank"}? BuyTune's access is revoked and its balances are removed.`)) void unlink(c.itemId); }}
                    style={{ background: "none", border: "none", color: "var(--text-tertiary)", fontSize: "10.5px", cursor: "pointer", textDecoration: "underline", textUnderlineOffset: "2px", padding: "2px 0", flexShrink: 0 }}
                  >
                    Unlink<span className="bt-sr-only"> {c.institution ?? "bank"}</span>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
