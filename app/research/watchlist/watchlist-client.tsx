"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import InfoTooltip from "@/app/components/info-tooltip";
import { addWatchlistItem, removeWatchlistItem, type WatchlistItem } from "./watchlist-actions";

type WatchQuote = { price: number; changePct: number };
type ScanResult = { signal: string; headline: string; points: string[] };

const fmt = (n: number) => "$" + n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const inputStyle: React.CSSProperties = { width: "100%", boxSizing: "border-box", padding: "9px 11px", borderRadius: "8px", border: "1px solid var(--card-border)", background: "var(--bg-elevated, rgba(255,255,255,0.03))", color: "var(--text-primary)", fontSize: "13px", fontFamily: "var(--font-body)", outline: "none" };

const SIGNAL_META: Record<string, { label: string; color: string }> = {
  improving: { label: "Improving", color: "var(--green)" },
  deteriorating: { label: "Deteriorating", color: "var(--red)" },
  watch_closely: { label: "Watch closely", color: "var(--amber, #f59e0b)" },
  no_change: { label: "No material change", color: "var(--text-tertiary)" },
};

export default function WatchlistClient({ items, prices }: { items: WatchlistItem[]; prices: Record<string, WatchQuote> }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [showAdd, setShowAdd] = useState(items.length === 0);
  const [ticker, setTicker] = useState("");
  const [target, setTarget] = useState("");
  const [direction, setDirection] = useState<"below" | "above">("below");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");

  const [scans, setScans] = useState<Record<string, ScanResult>>({});
  const [scanning, setScanning] = useState<string | null>(null);
  const [scanErr, setScanErr] = useState<Record<string, string>>({});

  function add() {
    if (!ticker.trim()) { setError("Enter a ticker."); return; }
    setError("");
    const fd = new FormData();
    fd.set("ticker", ticker.trim());
    fd.set("target_price", target);
    fd.set("alert_direction", direction);
    fd.set("note", note.trim());
    startTransition(async () => {
      const res = await addWatchlistItem(fd);
      if (res?.error) { setError(res.error); return; }
      setTicker(""); setTarget(""); setNote(""); setDirection("below"); setShowAdd(false);
      router.refresh();
    });
  }
  function remove(id: string) {
    startTransition(async () => { await removeWatchlistItem(id); router.refresh(); });
  }
  async function scan(tkr: string) {
    if (scanning) return;
    setScanErr((p) => ({ ...p, [tkr]: "" }));
    setScanning(tkr);
    try {
      const res = await fetch(`/api/watchlist/${tkr}/scan`, { method: "POST" });
      const d = await res.json();
      if (!res.ok) { setScanErr((p) => ({ ...p, [tkr]: d?.error ?? "Scan failed." })); return; }
      setScans((p) => ({ ...p, [tkr]: d.scan as ScanResult }));
    } catch {
      setScanErr((p) => ({ ...p, [tkr]: "Network error." }));
    } finally { setScanning(null); }
  }

  return (
    <div className="bt-page-content" style={{ flex: 1, overflowY: "auto" }}>
      <div style={{ maxWidth: "880px", margin: "0 auto", padding: "20px 24px 80px" }}>
        {/* Header */}
        <div style={{ marginBottom: "18px" }}>
          <Link href="/research" style={{ fontSize: "12px", color: "var(--text-tertiary)", textDecoration: "none" }}>← Research</Link>
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: "22px", fontWeight: 700, color: "var(--text-primary)", letterSpacing: "-0.4px", margin: "8px 0 2px", display: "flex", alignItems: "center" }}>
            Watchlist
            <InfoTooltip align="start" width={250} text="Track names you don't own yet. Set a price target to get an alert when it's hit, and run an AI scan to check if recent news has changed the story.">
              <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: "16px", height: "16px", borderRadius: "50%", marginLeft: "8px", cursor: "help", background: "rgba(99,102,241,0.12)", border: "1px solid rgba(99,102,241,0.3)", color: "var(--accent, #818cf8)", fontSize: "10px", fontWeight: 700 }}>?</span>
            </InfoTooltip>
          </h1>
          <p style={{ fontSize: "13px", color: "var(--text-tertiary)", margin: 0 }}>Price-target alerts + on-demand AI news monitoring for names you&apos;re tracking.</p>
        </div>

        {/* Add */}
        {!showAdd ? (
          <button type="button" onClick={() => setShowAdd(true)} style={{ width: "100%", padding: "12px", borderRadius: "var(--radius-lg)", border: "1px dashed var(--card-border)", background: "transparent", color: "var(--accent, #818cf8)", fontSize: "13px", fontWeight: 600, cursor: "pointer", fontFamily: "var(--font-body)", marginBottom: "18px" }}>
            + Add to watchlist
          </button>
        ) : (
          <div style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)", borderRadius: "var(--radius-lg)", padding: "16px 18px", marginBottom: "18px", display: "flex", flexDirection: "column", gap: "10px" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1.2fr", gap: "8px" }}>
              <input value={ticker} onChange={(e) => setTicker(e.target.value.toUpperCase())} placeholder="Ticker" maxLength={12} style={inputStyle} />
              <input value={target} onChange={(e) => setTarget(e.target.value)} type="number" min="0" placeholder="Target $ (optional)" style={inputStyle} />
              <select value={direction} onChange={(e) => setDirection(e.target.value as "below" | "above")} style={inputStyle}>
                <option value="below">Alert when it drops to target</option>
                <option value="above">Alert when it rises to target</option>
              </select>
            </div>
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Why are you watching it? (optional)" maxLength={300} style={inputStyle} />
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <button type="button" onClick={add} disabled={pending || !ticker.trim()} style={{ padding: "9px 18px", borderRadius: "8px", border: "none", fontSize: "13px", fontWeight: 700, cursor: pending ? "wait" : "pointer", fontFamily: "var(--font-body)", background: pending || !ticker.trim() ? "var(--bg-elevated, #1e293b)" : "var(--brand-gradient)", color: "#fff" }}>
                {pending ? "Adding…" : "Add"}
              </button>
              {items.length > 0 && <button type="button" onClick={() => { setShowAdd(false); setError(""); }} style={{ fontSize: "12px", color: "var(--text-tertiary)", background: "none", border: "none", cursor: "pointer", fontFamily: "var(--font-body)" }}>Cancel</button>}
              {error && <span style={{ fontSize: "12px", color: "var(--red)" }}>{error}</span>}
            </div>
          </div>
        )}

        {/* List */}
        {items.length === 0 ? (
          <p style={{ fontSize: "13px", color: "var(--text-tertiary)", fontStyle: "italic", textAlign: "center", padding: "20px" }}>
            Nothing on your watchlist yet. Add a ticker you&apos;re considering — set a target and we&apos;ll ping you when it&apos;s hit.
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {items.map((it) => {
              const q = prices[it.ticker];
              const price = q?.price ?? null;
              const hit = price != null && it.target_price != null && (it.alert_direction === "below" ? price <= it.target_price : price >= it.target_price);
              const distPct = price != null && it.target_price != null && price > 0 ? ((it.target_price - price) / price) * 100 : null;
              const scanResult = scans[it.ticker];
              const sigMeta = scanResult ? (SIGNAL_META[scanResult.signal] ?? SIGNAL_META.no_change) : null;
              return (
                <div key={it.id} style={{ background: "var(--card-bg)", border: `1px solid ${hit ? "rgba(34,197,94,0.3)" : "var(--card-border)"}`, borderRadius: "var(--radius-lg)", padding: "14px 16px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                    <div style={{ flex: 1, minWidth: "150px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <Link href={`/research?ticker=${encodeURIComponent(it.ticker)}`} style={{ fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: "15px", color: "var(--brand-blue)", textDecoration: "none" }}>{it.ticker}</Link>
                        {hit && <span style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--green)", background: "rgba(34,197,94,0.12)", border: "1px solid rgba(34,197,94,0.3)", padding: "2px 7px", borderRadius: "999px" }}>Target hit</span>}
                      </div>
                      {it.company_name && <div style={{ fontSize: "11px", color: "var(--text-tertiary)", marginTop: "1px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "240px" }}>{it.company_name}</div>}
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: "15px", fontWeight: 700, fontFamily: "var(--font-mono)", color: "var(--text-primary)" }}>{price != null ? fmt(price) : "—"}</div>
                      {q && <div style={{ fontSize: "11px", fontFamily: "var(--font-mono)", color: q.changePct >= 0 ? "var(--green)" : "var(--red)" }}>{q.changePct >= 0 ? "+" : ""}{q.changePct.toFixed(2)}%</div>}
                    </div>
                  </div>

                  {/* Target line */}
                  {it.target_price != null && (
                    <div style={{ fontSize: "11.5px", color: "var(--text-tertiary)", marginTop: "8px" }}>
                      Target <span style={{ fontFamily: "var(--font-mono)", color: "var(--text-secondary)", fontWeight: 600 }}>{fmt(it.target_price)}</span> ({it.alert_direction === "below" ? "buy the dip" : "breakout"})
                      {distPct != null && !hit && <span> · {Math.abs(distPct).toFixed(1)}% {distPct > 0 ? "below" : "above"} current</span>}
                    </div>
                  )}
                  {it.note && <p style={{ fontSize: "12px", color: "var(--text-secondary)", lineHeight: 1.5, margin: "6px 0 0", fontStyle: "italic" }}>&ldquo;{it.note}&rdquo;</p>}

                  {/* AI scan result */}
                  {scanResult && (
                    <div style={{ marginTop: "10px", padding: "11px 12px", background: "rgba(99,102,241,0.05)", border: "1px solid rgba(99,102,241,0.18)", borderRadius: "var(--radius-md)" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "7px", marginBottom: "6px" }}>
                        <span style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: sigMeta?.color }}>{sigMeta?.label}</span>
                      </div>
                      <p style={{ fontSize: "12.5px", fontWeight: 600, color: "var(--text-primary)", margin: "0 0 6px", lineHeight: 1.45 }}>{scanResult.headline}</p>
                      <ul style={{ margin: 0, paddingLeft: "16px", display: "flex", flexDirection: "column", gap: "3px" }}>
                        {scanResult.points.map((p, i) => <li key={i} style={{ fontSize: "12px", color: "var(--text-secondary)", lineHeight: 1.45 }}>{p}</li>)}
                      </ul>
                      <p style={{ fontSize: "10px", color: "var(--text-muted)", marginTop: "8px" }}>AI read of recent headlines — not advice.</p>
                    </div>
                  )}

                  {/* Actions */}
                  <div style={{ display: "flex", alignItems: "center", gap: "14px", marginTop: "10px", paddingTop: "10px", borderTop: "1px solid var(--border-subtle)" }}>
                    <button type="button" onClick={() => scan(it.ticker)} disabled={scanning === it.ticker} style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "11.5px", fontWeight: 600, color: scanning === it.ticker ? "var(--text-muted)" : "var(--accent, #818cf8)", background: "none", border: "none", cursor: scanning === it.ticker ? "wait" : "pointer", fontFamily: "var(--font-body)", padding: 0 }}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
                      {scanning === it.ticker ? "Scanning news…" : scanResult ? "Re-scan news" : "AI news scan"}
                    </button>
                    {scanErr[it.ticker] && <span style={{ fontSize: "11px", color: "var(--red)" }}>{scanErr[it.ticker]}</span>}
                    <button type="button" onClick={() => remove(it.id)} disabled={pending} style={{ marginLeft: "auto", fontSize: "10px", color: "var(--text-muted)", background: "none", border: "none", cursor: "pointer", fontFamily: "var(--font-body)" }}>Remove</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <p style={{ fontSize: "10px", color: "var(--text-muted)", marginTop: "18px", textAlign: "center" }}>
          Price-target alerts arrive in your notification bell (checked daily). AI scans run when you ask, on recent news.
        </p>
      </div>
    </div>
  );
}
