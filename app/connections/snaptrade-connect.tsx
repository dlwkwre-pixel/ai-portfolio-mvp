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

function fmtShares(n: number): string {
  if (Number.isInteger(n)) return n.toLocaleString();
  return parseFloat(n.toFixed(4)).toLocaleString(undefined, { maximumFractionDigits: 4 });
}
function fmtUsd(n: number): string {
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function SnaptradeConnect({ status }: { status: ConnectionStatus }) {
  const router = useRouter();
  const [busy, setBusy] = useState<null | "link" | "load" | "preview" | "apply" | "refresh">(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ updated: number; added: number; skipped: number; activities: number; portfolios: Portfolio[] } | null>(null);
  const [importedIds, setImportedIds] = useState<Set<string>>(new Set());

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [portfolios, setPortfolios] = useState<Portfolio[]>([]);
  const [links, setLinks] = useState<Record<string, string | null>>({});
  const [loadedOnce, setLoadedOnce] = useState(false);

  const [reviewAccount, setReviewAccount] = useState<Account | null>(null);
  const [defaultPortfolio, setDefaultPortfolio] = useState<string>("");
  const [rows, setRows] = useState<Row[]>([]);
  const [cashAmount, setCashAmount] = useState(0);
  const [cashTarget, setCashTarget] = useState<string>(""); // portfolioId or SKIP

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

  async function syncAll() {
    setBusy("refresh"); setErr(null); setMsg(null); setSuccess(null);
    try {
      const res = await fetch("/api/connections/snaptrade/refresh", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ full: true }) });
      const d = await res.json();
      if (!res.ok) { setErr(d.error ?? "Sync failed."); return; }
      setMsg(`Synced ${d.accounts} account${d.accounts === 1 ? "" : "s"} · ${d.updated} updated, ${d.added} added${d.activities ? `, ${d.activities} transactions` : ""}.`);
      void loadAccounts(true);
      router.refresh();
    } catch { setErr("Network error."); }
    finally { setBusy(null); }
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
    setBusy("preview"); setErr(null); setMsg(null); setSuccess(null);
    try {
      const res = await fetch("/api/connections/snaptrade/preview", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accountId: account.id }),
      });
      const d = await res.json();
      if (!res.ok) { setErr(d.error ?? "Could not read positions."); return; }
      const def = links[account.id] || portfolios[0]?.id || "";
      setDefaultPortfolio(def);
      setRows((d.positions as PreviewPos[]).map((p) => ({ ...p, target: p.currentPortfolioId ?? def })));
      setCashAmount(typeof d.cash === "number" ? d.cash : 0);
      setCashTarget(def);
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
    const hasCash = !!cashTarget && cashTarget !== SKIP && cashAmount > 0;
    if (Object.keys(assignments).length === 0 && !hasCash) { setErr("Assign at least one holding or the cash, or Cancel."); return; }
    setBusy("apply"); setErr(null); setMsg(null);
    try {
      const res = await fetch("/api/connections/snaptrade/apply", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId: reviewAccount.id, defaultPortfolioId: defaultPortfolio, cashPortfolioId: cashTarget || null, assignments }),
      });
      const d = await res.json();
      if (!res.ok) { setErr(d.error ?? "Import failed."); return; }
      const affected = Array.from(new Set(Object.values(assignments)));
      const affectedPortfolios = affected.map((id) => portfolios.find((p) => p.id === id)).filter((p): p is Portfolio => !!p);
      setSuccess({ updated: d.updated ?? 0, added: d.added ?? 0, skipped: d.skipped ?? 0, activities: d.activitiesImported ?? 0, portfolios: affectedPortfolios });
      setImportedIds((prev) => new Set(prev).add(reviewAccount.id));
      setMsg(null);
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
        {(() => {
          const isConnected = accounts.length > 0;
          return (
            <button type="button" onClick={connect} disabled={busy !== null} title={isConnected ? "Connect another brokerage or reconnect" : "Connect your brokerage"}
              style={{ ...btn, flex: "1 1 auto",
                border: `1px solid ${isConnected ? "var(--card-border)" : "rgba(0,211,149,0.4)"}`,
                background: isConnected ? "var(--bg-elevated)" : "rgba(0,211,149,0.12)",
                color: isConnected ? "#00d395" : "#00d395", opacity: busy ? 0.6 : 1 }}>
              {busy === "link" ? "Opening…" : isConnected ? "✓ Connected · add another" : "Connect brokerage"}
            </button>
          );
        })()}
        <button type="button" onClick={() => loadAccounts(false)} disabled={busy !== null}
          style={{ ...btn, border: "1px solid var(--card-border)", background: "var(--bg-elevated)", color: "var(--text-primary)", opacity: busy ? 0.6 : 1 }}>
          {busy === "load" ? "Loading…" : "Load accounts"}
        </button>
        {accounts.length > 0 && (
          <button type="button" onClick={syncAll} disabled={busy !== null} title="Re-pull holdings, cash, and new transactions for all linked accounts"
            style={{ ...btn, border: "1px solid var(--card-border)", background: "var(--bg-elevated)", color: "var(--text-primary)", opacity: busy ? 0.6 : 1 }}>
            {busy === "refresh" ? "Syncing…" : "Sync all now"}
          </button>
        )}
      </div>
      {(msg || err) && <div style={{ fontSize: "11.5px", color: err ? "#f59e0b" : "var(--text-secondary)" }}>{err ?? msg}</div>}

      {/* Success panel — what changed + what's next */}
      {success && (
        <div style={{ padding: "14px 15px", borderRadius: "14px", border: "1px solid rgba(0,211,149,0.35)", background: "rgba(0,211,149,0.08)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "9px", marginBottom: "8px" }}>
            <span style={{ flexShrink: 0, width: "22px", height: "22px", borderRadius: "50%", background: "rgba(0,211,149,0.2)", color: "#00d395", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "12px", fontWeight: 800 }}>✓</span>
            <span style={{ fontSize: "13.5px", fontWeight: 700, color: "var(--text-primary)" }}>Import complete</span>
            <button type="button" aria-label="Dismiss" onClick={() => setSuccess(null)} style={{ marginLeft: "auto", background: "none", border: "none", color: "var(--text-tertiary)", cursor: "pointer", fontSize: "13px", fontFamily: "var(--font-body)" }}>✕</button>
          </div>
          <div style={{ fontSize: "12px", color: "var(--text-secondary)", lineHeight: 1.6 }}>
            <span style={{ fontFamily: "var(--font-mono)", color: "#00d395", fontWeight: 700 }}>{success.updated}</span> holding{success.updated === 1 ? "" : "s"} updated to your live shares &amp; cost basis
            {success.added > 0 && <>, <span style={{ fontFamily: "var(--font-mono)", color: "#00d395", fontWeight: 700 }}>{success.added}</span> new added</>}
            {success.skipped > 0 && <>, {success.skipped} skipped</>}.
          </div>
          {success.activities > 0 && (
            <div style={{ fontSize: "12px", color: "var(--text-secondary)", lineHeight: 1.6, marginTop: "4px" }}>
              <span style={{ fontFamily: "var(--font-mono)", color: "#00d395", fontWeight: 700 }}>{success.activities}</span> transaction{success.activities === 1 ? "" : "s"} imported (buys, sells, dividends, transfers) — your returns &amp; income now reflect them.
            </div>
          )}
          {success.portfolios.length > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap", marginTop: "9px" }}>
              <span style={{ fontSize: "10.5px", color: "var(--text-tertiary)" }}>Next, review your refreshed holdings:</span>
              {success.portfolios.map((p) => (
                <a key={p.id} href={`/portfolios/${p.id}`}
                  style={{ fontSize: "11.5px", fontWeight: 600, color: "#00d395", textDecoration: "none", border: "1px solid rgba(0,211,149,0.3)", background: "rgba(0,211,149,0.1)", borderRadius: "999px", padding: "3px 10px" }}>
                  {p.name} →
                </a>
              ))}
            </div>
          )}
          <div style={{ fontSize: "10.5px", color: "var(--text-tertiary)", marginTop: "9px", lineHeight: 1.5 }}>
            Your returns, AI analysis, and net worth now reflect these numbers. Re-import anytime to refresh, or connect another account.
          </div>
        </div>
      )}

      {/* Accounts list */}
      {accounts.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          {accounts.map((a) => {
            const synced = importedIds.has(a.id) || !!links[a.id];
            return (
              <div key={a.id} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "9px 11px", borderRadius: "9px", background: "var(--bg-base)", border: `1px solid ${synced ? "rgba(0,211,149,0.25)" : "var(--border-subtle)"}` }}>
                <span title={a.label} style={{ flex: 1, minWidth: 0, fontSize: "12.5px", color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", cursor: "default" }}>{a.label}</span>
                {synced && (
                  <span style={{ flexShrink: 0, fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", color: "#00d395", background: "rgba(0,211,149,0.1)", border: "1px solid rgba(0,211,149,0.3)", borderRadius: "6px", padding: "2px 7px" }}>✓ Synced</span>
                )}
                <button type="button" onClick={() => startReview(a)} disabled={busy !== null}
                  style={{ ...btn, flexShrink: 0, padding: "6px 12px", border: "1px solid var(--card-border)", background: "var(--card-bg)", color: "var(--accent, #818cf8)", opacity: busy ? 0.6 : 1 }}>
                  {busy === "preview" ? "…" : synced ? "Re-import" : "Review & import"}
                </button>
              </div>
            );
          })}
        </div>
      )}
      {loadedOnce && accounts.length === 0 && (
        <div style={{ fontSize: "11px", color: "var(--text-tertiary)" }}>No linked accounts yet. Connect one above, then Load accounts.</div>
      )}

      <div style={{ fontSize: "10.5px", color: "var(--text-tertiary)" }}>
        {status.lastSyncedAt ? `Last import ${new Date(status.lastSyncedAt).toLocaleString()}` : "Read-only. Imports update your existing portfolios, nothing is deleted or duplicated."}
      </div>

      {/* Review modal */}
      {reviewAccount && (
        <div onClick={() => { if (busy === null) { setReviewAccount(null); setRows([]); } }}
          style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(2,6,15,0.72)", display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }}>
          <div onClick={(e) => e.stopPropagation()}
            style={{ width: "100%", maxWidth: "660px", maxHeight: "88vh", display: "flex", flexDirection: "column", background: "var(--bg-elevated, #0d1120)", border: "1px solid var(--card-border)", borderRadius: "16px", overflow: "hidden", boxShadow: "0 24px 80px rgba(0,0,0,0.6)" }}>
            {/* Header */}
            <div style={{ padding: "16px 18px", borderBottom: "1px solid var(--card-border)", display: "flex", alignItems: "flex-start", gap: "12px" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: "15px", fontWeight: 700, color: "var(--text-primary)" }}>{reviewAccount.label}</div>
                <div style={{ fontSize: "11.5px", color: "var(--text-tertiary)", marginTop: "3px", lineHeight: 1.5 }}>
                  Held tickers update in place (history kept). New ones go to the portfolio you pick. Set a holding to “Skip” to leave it out.
                </div>
              </div>
              <button type="button" aria-label="Close" onClick={() => { setReviewAccount(null); setRows([]); }} disabled={busy !== null}
                style={{ flexShrink: 0, width: "30px", height: "30px", borderRadius: "8px", border: "1px solid var(--card-border)", background: "var(--card-bg)", color: "var(--text-secondary)", fontSize: "14px", cursor: "pointer", fontFamily: "var(--font-body)" }}>✕</button>
            </div>
            {/* Default portfolio */}
            <div style={{ padding: "12px 18px", borderBottom: "1px solid var(--card-border)", display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
              <span style={{ fontSize: "11.5px", color: "var(--text-tertiary)" }}>Default portfolio for new holdings</span>
              <select value={defaultPortfolio} onChange={(e) => changeDefault(e.target.value)} style={{ ...sel, flex: "1 1 180px" }}>
                {portfolios.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            {/* Body */}
            <div style={{ padding: "12px 18px", overflowY: "auto", flex: 1 }}>
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  {/* Cash — assignable like a holding */}
                  {cashAmount > 0 && (
                    <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "9px 11px", borderRadius: "10px", background: "rgba(0,211,149,0.05)", border: "1px solid rgba(0,211,149,0.2)" }}>
                      <span style={{ fontWeight: 700, fontSize: "12.5px", color: "var(--text-primary)", minWidth: "62px" }}>Cash</span>
                      <span style={{ fontSize: "12px", fontFamily: "var(--font-mono)", color: "var(--text-tertiary)", flex: 1, minWidth: 0 }}>{fmtUsd(cashAmount)}</span>
                      <span style={{ fontSize: "9px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", color: "#00d395", flexShrink: 0, minWidth: "44px" }}>cash</span>
                      <select value={cashTarget} onChange={(e) => setCashTarget(e.target.value)} style={{ ...sel, flexShrink: 0, width: "170px" }}>
                        <option value={SKIP}>Skip</option>
                        {portfolios.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                    </div>
                  )}
                  {rows.length === 0 && cashAmount <= 0 && (
                    <div style={{ fontSize: "12px", color: "var(--text-tertiary)" }}>Nothing found in this account.</div>
                  )}
                  {rows.map((r, i) => (
                    <div key={r.ticker} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "9px 11px", borderRadius: "10px", background: "var(--card-bg)", border: "1px solid var(--card-border)" }}>
                      <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: "13px", color: "var(--text-primary)", minWidth: "62px" }}>{r.ticker}</span>
                      <span title={`${fmtShares(r.shares)} shares${r.value ? ` · ${fmtUsd(r.value)}` : ""}`}
                        style={{ fontSize: "12px", color: "var(--text-tertiary)", flex: 1, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", cursor: "default" }}>
                        {fmtShares(r.shares)} sh{r.value ? ` · ~$${Math.round(r.value).toLocaleString()}` : ""}
                      </span>
                      <span style={{ fontSize: "9px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", color: r.currentPortfolioId ? "#00d395" : "var(--accent, #818cf8)", flexShrink: 0, minWidth: "44px" }}>
                        {r.currentPortfolioId ? "update" : "add"}
                      </span>
                      <select value={r.target} onChange={(e) => setRows((prev) => prev.map((x, j) => (j === i ? { ...x, target: e.target.value } : x)))} style={{ ...sel, flexShrink: 0, width: "170px" }}>
                        <option value={SKIP}>Skip</option>
                        {portfolios.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                    </div>
                  ))}
                </div>
            </div>
            {/* Footer */}
            <div style={{ padding: "14px 18px", borderTop: "1px solid var(--card-border)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px" }}>
              <span style={{ fontSize: "11.5px", color: "var(--text-tertiary)" }}>
                {rows.filter((r) => r.target && r.target !== SKIP).length} of {rows.length} selected
              </span>
              <div style={{ display: "flex", gap: "8px" }}>
                <button type="button" onClick={() => { setReviewAccount(null); setRows([]); }} disabled={busy !== null}
                  style={{ ...btn, border: "1px solid var(--card-border)", background: "none", color: "var(--text-secondary)" }}>Cancel</button>
                <button type="button" onClick={apply} disabled={busy !== null}
                  style={{ ...btn, border: "none", background: "linear-gradient(135deg,#2563eb,#7c3aed)", color: "#fff", opacity: busy ? 0.6 : 1 }}>
                  {busy === "apply" ? "Importing…" : "Import selected"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
