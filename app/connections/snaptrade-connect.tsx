"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { ConnectionStatus } from "@/lib/connections/snaptrade";

type Account = { id: string; label: string };
type Portfolio = { id: string; name: string };
type PreviewPos = {
  ticker: string; name: string | null; shares: number; value: number; avgCost: number | null;
  assetType: string; currentPortfolioId: string | null;
};
type Row = PreviewPos & { target: string }; // target = portfolioId or "" (skip)

const SKIP = "";

export default function SnaptradeConnect({ status }: { status: ConnectionStatus }) {
  const router = useRouter();
  const [busy, setBusy] = useState<null | "link" | "load" | "preview" | "apply">(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [portfolios, setPortfolios] = useState<Portfolio[]>([]);
  const [links, setLinks] = useState<Record<string, string | null>>({});
  const [loadedOnce, setLoadedOnce] = useState(false);

  const [reviewAccount, setReviewAccount] = useState<Account | null>(null);
  const [defaultPortfolio, setDefaultPortfolio] = useState<string>("");
  const [rows, setRows] = useState<Row[]>([]);

  useEffect(() => { void loadAccounts(true); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  async function loadAccounts(silent = false) {
    if (!silent) setBusy("load");
    setErr(null);
    try {
      const res = await fetch("/api/connections/snaptrade/accounts");
      const d = await res.json();
      if (res.ok) {
        setAccounts(d.accounts ?? []);
        setPortfolios(d.portfolios ?? []);
        setLinks(d.links ?? {});
      } else if (!silent) setErr(d.error ?? "Could not load accounts.");
    } catch { if (!silent) setErr("Network error."); }
    finally { setLoadedOnce(true); if (!silent) setBusy(null); }
  }

  async function connect() {
    setBusy("link"); setErr(null); setMsg(null);
    try {
      const res = await fetch("/api/connections/snaptrade/link", { method: "POST" });
      const d = await res.json();
      if (!res.ok || !d.redirectURI) { setErr(d.error ?? "Could not open the connection portal."); return; }
      window.open(d.redirectURI, "snaptrade", "width=460,height=760");
      setMsg("When the popup says “Connection Complete”, close it and press “Load accounts”.");
    } catch { setErr("Network error. Try again."); }
    finally { setBusy(null); }
  }

  async function startReview(account: Account) {
    setBusy("preview"); setErr(null); setMsg(null);
    try {
      const res = await fetch("/api/connections/snaptrade/preview", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accountId: account.id }),
      });
      const d = await res.json();
      if (!res.ok) { setErr(d.error ?? "Could not read positions."); return; }
      const def = links[account.id] || portfolios[0]?.id || "";
      setDefaultPortfolio(def);
      setRows((d.positions as PreviewPos[]).map((p) => ({ ...p, target: p.currentPortfolioId ?? def })));
      setReviewAccount(account);
    } catch { setErr("Network error."); }
    finally { setBusy(null); }
  }

  // Changing the default reassigns rows that are "new" (not already held) and weren't hand-set to skip.
  function changeDefault(pid: string) {
    setDefaultPortfolio(pid);
    setRows((prev) => prev.map((r) => (r.currentPortfolioId == null && r.target !== SKIP ? { ...r, target: pid } : r)));
  }

  async function apply() {
    if (!reviewAccount) return;
    const assignments: Record<string, string> = {};
    for (const r of rows) if (r.target && r.target !== SKIP) assignments[r.ticker] = r.target;
    if (Object.keys(assignments).length === 0) { setErr("Assign at least one holding, or Cancel."); return; }
    setBusy("apply"); setErr(null); setMsg(null);
    try {
      const res = await fetch("/api/connections/snaptrade/apply", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId: reviewAccount.id, defaultPortfolioId: defaultPortfolio, assignments }),
      });
      const d = await res.json();
      if (!res.ok) { setErr(d.error ?? "Import failed."); return; }
      setMsg(`Updated ${d.updated}, added ${d.added}${d.skipped ? `, skipped ${d.skipped}` : ""}.`);
      setReviewAccount(null); setRows([]);
      void loadAccounts(true);
      router.refresh();
    } catch { setErr("Network error."); }
    finally { setBusy(null); }
  }

  const sel: React.CSSProperties = { padding: "6px 8px", borderRadius: "8px", background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)", color: "var(--text-primary)", fontSize: "12px", fontFamily: "var(--font-body)" };
  const btn: React.CSSProperties = { padding: "9px 14px", borderRadius: "10px", fontSize: "12.5px", fontWeight: 600, fontFamily: "var(--font-body)", cursor: "pointer" };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
      {/* Actions */}
      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
        <button type="button" onClick={connect} disabled={busy !== null}
          style={{ ...btn, flex: "1 1 auto", border: "1px solid rgba(0,211,149,0.4)", background: "rgba(0,211,149,0.12)", color: "#00d395", opacity: busy ? 0.6 : 1 }}>
          {busy === "link" ? "Opening…" : accounts.length > 0 ? "Add / reconnect" : "Connect brokerage"}
        </button>
        <button type="button" onClick={() => loadAccounts(false)} disabled={busy !== null}
          style={{ ...btn, border: "1px solid var(--card-border)", background: "var(--bg-elevated)", color: "var(--text-primary)", opacity: busy ? 0.6 : 1 }}>
          {busy === "load" ? "Loading…" : "Load accounts"}
        </button>
      </div>
      {(msg || err) && <div style={{ fontSize: "11.5px", color: err ? "#f59e0b" : "var(--text-secondary)" }}>{err ?? msg}</div>}

      {/* Accounts list */}
      {!reviewAccount && accounts.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          {accounts.map((a) => (
            <div key={a.id} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "9px 11px", borderRadius: "9px", background: "var(--bg-base)", border: "1px solid var(--border-subtle)" }}>
              <span style={{ flex: 1, minWidth: 0, fontSize: "12.5px", color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.label}</span>
              <button type="button" onClick={() => startReview(a)} disabled={busy !== null}
                style={{ ...btn, flexShrink: 0, padding: "6px 12px", border: "1px solid var(--card-border)", background: "var(--card-bg)", color: "var(--accent, #818cf8)", opacity: busy ? 0.6 : 1 }}>
                {busy === "preview" ? "…" : "Review & import"}
              </button>
            </div>
          ))}
        </div>
      )}
      {!reviewAccount && loadedOnce && accounts.length === 0 && (
        <div style={{ fontSize: "11px", color: "var(--text-tertiary)" }}>No linked accounts yet. Connect one above, then Load accounts.</div>
      )}

      {/* Review panel */}
      {reviewAccount && (
        <div style={{ border: "1px solid var(--card-border)", borderRadius: "12px", padding: "12px", background: "var(--bg-base)" }}>
          <div style={{ fontSize: "13px", fontWeight: 700, color: "var(--text-primary)", marginBottom: "2px" }}>{reviewAccount.label}</div>
          <div style={{ fontSize: "10.5px", color: "var(--text-tertiary)", marginBottom: "10px" }}>
            Held tickers update in place (history kept). New ones go to the portfolio you pick. Set a holding to “Skip” to leave it out.
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "10px", flexWrap: "wrap" }}>
            <span style={{ fontSize: "11px", color: "var(--text-tertiary)" }}>Default portfolio for new holdings</span>
            <select value={defaultPortfolio} onChange={(e) => changeDefault(e.target.value)} style={sel}>
              {portfolios.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          {rows.length === 0 ? (
            <div style={{ fontSize: "11.5px", color: "var(--text-tertiary)" }}>No positions found in this account.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "5px", maxHeight: "340px", overflowY: "auto" }}>
              {rows.map((r, i) => (
                <div key={r.ticker} style={{ display: "flex", alignItems: "center", gap: "8px", padding: "6px 8px", borderRadius: "8px", background: "var(--card-bg)", border: "1px solid var(--card-border)" }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: "12.5px", color: "var(--text-primary)", minWidth: "56px" }}>{r.ticker}</span>
                  <span style={{ fontSize: "11px", color: "var(--text-tertiary)", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {r.shares} sh{r.value ? ` · ~$${Math.round(r.value).toLocaleString()}` : ""}
                  </span>
                  <span style={{ fontSize: "9px", fontWeight: 700, textTransform: "uppercase", color: r.currentPortfolioId ? "#00d395" : "var(--accent, #818cf8)", flexShrink: 0 }}>
                    {r.currentPortfolioId ? "update" : "add"}
                  </span>
                  <select value={r.target} onChange={(e) => setRows((prev) => prev.map((x, j) => (j === i ? { ...x, target: e.target.value } : x)))} style={{ ...sel, flexShrink: 0, maxWidth: "150px" }}>
                    <option value={SKIP}>Skip</option>
                    {portfolios.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
              ))}
            </div>
          )}
          <div style={{ display: "flex", gap: "8px", marginTop: "12px" }}>
            <button type="button" onClick={apply} disabled={busy !== null}
              style={{ ...btn, border: "none", background: "linear-gradient(135deg,#2563eb,#7c3aed)", color: "#fff", opacity: busy ? 0.6 : 1 }}>
              {busy === "apply" ? "Importing…" : "Import selected"}
            </button>
            <button type="button" onClick={() => { setReviewAccount(null); setRows([]); }} disabled={busy !== null}
              style={{ ...btn, border: "1px solid var(--card-border)", background: "none", color: "var(--text-secondary)" }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      <div style={{ fontSize: "10.5px", color: "var(--text-tertiary)" }}>
        {status.lastSyncedAt ? `Last import ${new Date(status.lastSyncedAt).toLocaleString()}` : "Read-only. Imports update your existing portfolios, nothing is deleted or duplicated."}
      </div>
    </div>
  );
}
