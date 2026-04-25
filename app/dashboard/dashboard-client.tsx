"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { savePortfolioOrder } from "./portfolio-order-actions";

type PortfolioRow = {
  id: string;
  name: string;
  account_type: string | null;
  accountTypeLabel: string;
  dotColor: string;
  totalValue: number;
  totalValueLabel: string;
  cashLabel: string;
  benchmarkSymbol: string;
  status: string | null;
  createdAt: string;
  aiRecs: { id: string; action_type: string | null; ticker: string | null; thesis: string | null; badgeClass: string; }[];
};

type FeedItem = {
  id: string; kind: "transaction" | "ai";
  portfolioName: string; portfolioId: string;
  title: string; occurredAt: string;
  amount: number | null; href: string; status: string | null;
};

function formatLocalDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function formatMoney(value: number) {
  return `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function DashboardClient({ portfolioRows: initialRows, archivedRows, feedItems, totalValue, totalValueLabel, strategiesCount, lastRunAt }: {
  portfolioRows: PortfolioRow[]; archivedRows: { id: string; name: string }[];
  feedItems: FeedItem[]; totalValue: number; totalValueLabel: string;
  strategiesCount: number; lastRunAt: string | null;
}) {
  const [isPrivate, setIsPrivate] = useState(false);
  const [portfolioRows, setPortfolioRows] = useState(initialRows);
  const [reordering, setReordering] = useState(false);
  const [isSaving, startSave] = useTransition();

  const hide = (v: string, m = false) => isPrivate ? (m ? "$••••••" : "••••••") : v;

  function move(id: string, dir: "up" | "down") {
    setPortfolioRows(prev => {
      const idx = prev.findIndex(p => p.id === id);
      if (idx < 0 || (dir === "up" && idx === 0) || (dir === "down" && idx === prev.length - 1)) return prev;
      const next = [...prev];
      const swap = dir === "up" ? idx - 1 : idx + 1;
      [next[idx], next[swap]] = [next[swap], next[idx]];
      return next;
    });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: "10px" }}>
        {[
          { label: "Total Value", value: hide(totalValueLabel, true), sub: `${portfolioRows.length} portfolios` },
          { label: "Strategies", value: String(strategiesCount), sub: "active" },
          { label: "AI Pending", value: String(portfolioRows.reduce((s,p) => s + p.aiRecs.length, 0)), sub: "recommendations" },
          { label: "Last AI Run", value: formatLocalDateTime(lastRunAt), sub: "most recent", small: true },
        ].map(stat => (
          <div key={stat.label} className="bt-card" style={{ padding: "14px 16px" }}>
            <div className="label" style={{ marginBottom: "6px" }}>{stat.label}</div>
            <div style={{ fontFamily: stat.small ? "var(--font-body)" : "var(--font-mono)", fontSize: stat.small ? "12px" : "18px", fontWeight: 500, color: "var(--text-primary)", letterSpacing: stat.small ? 0 : "-0.3px" }}>{stat.value}</div>
            <div style={{ fontSize: "10px", color: "var(--text-tertiary)", marginTop: "2px" }}>{stat.sub}</div>
          </div>
        ))}
      </div>

      {/* Main grid */}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1.4fr) minmax(280px,0.8fr)", gap: "16px" }}>
        {/* Portfolios */}
        <div className="bt-card">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "14px" }}>
            <div>
              <h2 style={{ fontSize: "13px", fontWeight: 500, color: "var(--text-secondary)" }}>Your Portfolios</h2>
              <p style={{ fontSize: "11px", color: "var(--text-tertiary)", marginTop: "2px" }}>Click to open · Reorder with arrows</p>
            </div>
            <div style={{ display: "flex", gap: "6px" }}>
              <button type="button" onClick={() => setIsPrivate(p => !p)} className="bt-btn bt-btn-ghost bt-btn-sm">
                {isPrivate ? "Show" : "Privacy"}
              </button>
              <button type="button" onClick={() => reordering ? startSave(async () => { await savePortfolioOrder(portfolioRows.map(p => p.id)); setReordering(false); }) : setReordering(true)} disabled={isSaving} className="bt-btn bt-btn-ghost bt-btn-sm">
                {isSaving ? "Saving..." : reordering ? "Done" : "Reorder"}
              </button>
              <Link href="/portfolios" className="bt-btn bt-btn-ghost bt-btn-sm">View all</Link>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {portfolioRows.map((p, idx) => (
              <div key={p.id} style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: "var(--radius-md)", overflow: "hidden" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "11px 14px" }}>
                  {reordering && (
                    <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                      <button type="button" onClick={() => move(p.id, "up")} disabled={idx === 0} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", padding: "1px", opacity: idx === 0 ? 0.2 : 1 }}>
                        <svg width="10" height="10" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 17a.75.75 0 01-.75-.75V5.612L5.29 9.77a.75.75 0 01-1.08-1.04l5.25-5.5a.75.75 0 011.08 0l5.25 5.5a.75.75 0 11-1.08 1.04l-3.96-4.158V16.25A.75.75 0 0110 17z" clipRule="evenodd"/></svg>
                      </button>
                      <button type="button" onClick={() => move(p.id, "down")} disabled={idx === portfolioRows.length - 1} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", padding: "1px", opacity: idx === portfolioRows.length - 1 ? 0.2 : 1 }}>
                        <svg width="10" height="10" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 3a.75.75 0 01.75.75v10.638l3.96-4.158a.75.75 0 111.08 1.04l-5.25 5.5a.75.75 0 01-1.08 0l-5.25-5.5a.75.75 0 111.08-1.04l3.96 4.158V3.75A.75.75 0 0110 3z" clipRule="evenodd"/></svg>
                      </button>
                    </div>
                  )}
                  <div style={{ width: "7px", height: "7px", borderRadius: "50%", background: p.dotColor, flexShrink: 0, boxShadow: `0 0 5px ${p.dotColor}` }}/>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <span style={{ fontSize: "13px", fontWeight: 500, color: "var(--text-primary)" }}>{p.name}</span>
                      <span style={{ fontSize: "9px", color: "var(--text-tertiary)", background: "var(--card-bg)", border: "1px solid var(--card-border)", padding: "1px 6px", borderRadius: "var(--radius-full)" }}>{p.accountTypeLabel}</span>
                      <span style={{ fontSize: "9px", color: "var(--text-muted)", background: "var(--card-bg)", border: "1px solid var(--card-border)", padding: "1px 6px", borderRadius: "var(--radius-full)" }}>{p.benchmarkSymbol}</span>
                    </div>
                    <div style={{ fontSize: "10px", color: "var(--text-tertiary)", marginTop: "2px" }}>Cash: {hide(p.cashLabel, true)} · {new Date(p.createdAt).toLocaleDateString()}</div>
                  </div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: "15px", fontWeight: 500, color: "var(--text-primary)", flexShrink: 0 }}>{hide(p.totalValueLabel, true)}</div>
                  <Link href={`/portfolios/${p.id}`} className="bt-btn bt-btn-primary bt-btn-sm">Open →</Link>
                </div>
                {p.aiRecs.length > 0 && (
                  <div style={{ borderTop: "1px solid var(--border-subtle)", padding: "10px 14px", background: "var(--violet-bg)" }}>
                    <div className="label" style={{ color: "var(--violet)", marginBottom: "6px" }}>✦ AI Recommendations</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
                      {p.aiRecs.map(rec => (
                        <Link key={rec.id} href={`/portfolios/${p.id}?tab=ai`} style={{ display: "flex", alignItems: "center", gap: "8px", textDecoration: "none", padding: "3px 4px", borderRadius: "5px" }}>
                          <span className={rec.badgeClass}>{(rec.action_type || "—").replace("_", " ")}</span>
                          <span style={{ fontFamily: "var(--font-mono)", fontSize: "11px", fontWeight: 500, color: "var(--text-primary)", flexShrink: 0 }}>{rec.ticker}</span>
                          {rec.thesis && <span style={{ fontSize: "10px", color: "var(--text-tertiary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>— {rec.thesis}</span>}
                        </Link>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
            {portfolioRows.length === 0 && (
              <div style={{ padding: "20px", textAlign: "center" }}>
                <p style={{ fontSize: "13px", color: "var(--text-tertiary)" }}>No active portfolios yet.</p>
                <Link href="/portfolios" className="bt-btn bt-btn-primary" style={{ display: "inline-flex", marginTop: "10px" }}>Create Portfolio</Link>
              </div>
            )}
          </div>

          {archivedRows.length > 0 && (
            <details style={{ marginTop: "10px" }}>
              <summary style={{ fontSize: "11px", color: "var(--text-tertiary)", cursor: "pointer", padding: "4px 2px", listStyle: "none" }}>
                {archivedRows.length} archived
              </summary>
              <div style={{ marginTop: "6px", display: "flex", flexDirection: "column", gap: "4px" }}>
                {archivedRows.map(p => (
                  <div key={p.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "7px 10px", opacity: 0.5, background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-md)" }}>
                    <span style={{ fontSize: "12px", color: "var(--text-secondary)" }}>{p.name}</span>
                    <Link href={`/portfolios/${p.id}`} style={{ fontSize: "11px", color: "var(--brand-blue)", textDecoration: "none" }}>View →</Link>
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>

        {/* Activity feed */}
        <div className="bt-card" style={{ height: "fit-content" }}>
          <div style={{ marginBottom: "12px" }}>
            <h2 style={{ fontSize: "13px", fontWeight: 500, color: "var(--text-secondary)" }}>Activity</h2>
            <p style={{ fontSize: "11px", color: "var(--text-tertiary)", marginTop: "2px" }}>Trades and AI runs</p>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            {feedItems.length > 0 ? feedItems.map(item => (
              <Link key={item.id} href={item.href} style={{ display: "flex", alignItems: "flex-start", gap: "10px", padding: "9px 10px", borderRadius: "var(--radius-md)", textDecoration: "none", background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)", transition: "var(--transition-fast)" }}>
                <div style={{ width: "24px", height: "24px", borderRadius: "6px", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: item.kind === "ai" ? "var(--violet-bg)" : "var(--card-bg)", color: item.kind === "ai" ? "var(--violet)" : "var(--text-tertiary)", marginTop: "1px" }}>
                  {item.kind === "ai" ? (
                    <svg width="11" height="11" viewBox="0 0 20 20" fill="currentColor"><path d="M15.98 1.804a1 1 0 00-1.96 0l-.24 1.192a1 1 0 01-.784.785l-1.192.238a1 1 0 000 1.962l1.192.238a1 1 0 01.785.785l.238 1.192a1 1 0 001.962 0l.238-1.192a1 1 0 01.785-.785l1.192-.238a1 1 0 000-1.962l-1.192-.238a1 1 0 01-.785-.785l-.238-1.192z"/></svg>
                  ) : (
                    <svg width="11" height="11" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.798 7.45c.512-.67 1.135-.95 1.702-.95s1.19.28 1.702.95a.75.75 0 001.192-.91C12.637 5.55 11.596 5 10.5 5s-2.137.55-2.894 1.54A5.205 5.205 0 006.83 8H5.75a.75.75 0 000 1.5h.77a6.333 6.333 0 000 1h-.77a.75.75 0 000 1.5h1.08c.183.528.442 1.023.776 1.46.757.99 1.798 1.54 2.894 1.54s2.137-.55 2.894-1.54a.75.75 0 00-1.192-.91c-.512.67-1.135.95-1.702.95s-1.19-.28-1.702-.95a3.505 3.505 0 01-.343-.55h1.795a.75.75 0 000-1.5H8.026a4.835 4.835 0 010-1h2.224a.75.75 0 000-1.5H8.455c.098-.195.212-.38.343-.55z" clipRule="evenodd"/></svg>
                  )}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: "12px", fontWeight: 500, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.title}</p>
                  <p style={{ fontSize: "10px", color: "var(--text-tertiary)", marginTop: "1px" }}>{item.portfolioName} · {formatLocalDateTime(item.occurredAt)}</p>
                </div>
                {item.amount !== null && (
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: "11px", fontWeight: 500, flexShrink: 0, color: item.amount >= 0 ? "var(--green)" : "var(--red)" }}>
                    {isPrivate ? "$••••" : (item.amount > 0 ? "+" : "") + formatMoney(item.amount)}
                  </span>
                )}
              </Link>
            )) : (
              <p style={{ fontSize: "12px", color: "var(--text-tertiary)", padding: "8px 0" }}>No recent activity.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
