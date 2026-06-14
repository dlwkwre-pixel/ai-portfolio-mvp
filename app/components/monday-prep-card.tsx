"use client";

import Link from "next/link";
import { useState, useEffect } from "react";

type PrepItem = {
  id: string;
  label: string;
  detail: string;
  type: "earnings" | "risk" | "action" | "info";
  href: string | null;
  cta: string | null;
};

type PrepData = {
  checklist: PrepItem[];
  vix_level: number;
  vix_label: string;
  earnings_count: number;
  week_of: string;
};

function isFriSatSun(): boolean {
  const day = new Date().getDay();
  return day === 5 || day === 6 || day === 0;
}

const TYPE_COLOR: Record<string, string> = {
  earnings: "#f59e0b",
  risk: "var(--red)",
  action: "rgba(96,165,250,0.9)",
  info: "var(--text-muted)",
};

function TypeDot({ type }: { type: string }) {
  return (
    <span
      style={{
        width: "6px",
        height: "6px",
        borderRadius: "50%",
        background: TYPE_COLOR[type] ?? TYPE_COLOR.info,
        flexShrink: 0,
        marginTop: "7px",
      }}
    />
  );
}

export default function MondayPrepCard() {
  const [data, setData] = useState<PrepData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<string | null>(null);
  const [show, setShow] = useState(false);

  const STORAGE_KEY = `bt-monday-prep-${new Date().toISOString().split("T")[0]}`;

  // ALL hooks first — no early return before useEffect
  useEffect(() => {
    if (!isFriSatSun()) { setLoading(false); return; }
    setShow(true);

    // Restore checked state from localStorage
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]") as string[];
      setChecked(new Set(stored));
    } catch {}

    fetch("/api/market/monday-prep")
      .then((r) => r.json())
      .then((d) => {
        if (d?.checklist) setData(d);
        else setError(true);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (typeof window !== "undefined" && !isFriSatSun()) return null;
  if (error) return null;

  const toggle = (id: string) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify([...next])); } catch {}
      return next;
    });
  };

  if (!show || error) return null;

  const doneCount = data ? data.checklist.filter((i) => checked.has(i.id)).length : 0;
  const totalCount = data?.checklist.length ?? 0;
  const allDone = totalCount > 0 && doneCount === totalCount;

  return (
    <div
      style={{
        background: "rgba(245,158,11,0.03)",
        border: allDone ? "1px solid rgba(34,197,94,0.2)" : "1px solid rgba(245,158,11,0.12)",
        borderRadius: "var(--radius-lg)",
        padding: "14px 16px",
        transition: "border-color 0.3s ease",
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: loading ? "0" : "12px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <svg width="13" height="13" viewBox="0 0 20 20" fill={allDone ? "rgba(74,222,128,0.85)" : "rgba(251,191,36,0.85)"} style={{ transition: "fill 0.3s" }}>
            {allDone ? (
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
            ) : (
              <path fillRule="evenodd" d="M10 2a8 8 0 100 16A8 8 0 0010 2zM6.75 9.25a.75.75 0 000 1.5h4.59l-2.1 1.95a.75.75 0 001.02 1.1l3.5-3.25a.75.75 0 000-1.1l-3.5-3.25a.75.75 0 10-1.02 1.1l2.1 1.95H6.75z" clipRule="evenodd" />
            )}
          </svg>
          <span style={{ fontSize: "11px", fontWeight: 600, color: allDone ? "rgba(74,222,128,0.85)" : "rgba(251,191,36,0.85)", letterSpacing: "0.04em", textTransform: "uppercase", transition: "color 0.3s" }}>
            {allDone ? "All Prepped" : "Prepare for Monday"}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          {data && (
            <span style={{ fontSize: "10px", color: doneCount > 0 ? "var(--text-secondary)" : "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>
              {doneCount}/{totalCount}
            </span>
          )}
          {data && (
            <span style={{ fontSize: "10px", color: "var(--text-tertiary)" }}>
              Week of {data.week_of}
            </span>
          )}
        </div>
      </div>

      {/* Progress bar */}
      {data && totalCount > 0 && (
        <div style={{ height: "2px", background: "rgba(255,255,255,0.06)", borderRadius: "2px", marginBottom: "12px", overflow: "hidden" }}>
          <div
            style={{
              height: "100%",
              borderRadius: "2px",
              background: allDone ? "var(--green)" : "rgba(251,191,36,0.6)",
              width: `${(doneCount / totalCount) * 100}%`,
              transition: "width 0.3s ease, background 0.3s ease",
            }}
          />
        </div>
      )}

      {loading && (
        <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "6px 0" }}>
          <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: "rgba(251,191,36,0.5)", animation: "bt-pulse 1.2s ease-in-out infinite" }} />
          <span style={{ fontSize: "11px", color: "var(--text-tertiary)" }}>Building your pre-market checklist...</span>
        </div>
      )}

      {data && !loading && (
        <div style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
          {data.checklist.map((item) => {
            const done = checked.has(item.id);
            const open = expanded === item.id;

            return (
              <div
                key={item.id}
                style={{
                  borderRadius: "var(--radius-md)",
                  background: done ? "rgba(34,197,94,0.04)" : "rgba(255,255,255,0.02)",
                  border: `1px solid ${done ? "rgba(34,197,94,0.1)" : "rgba(255,255,255,0.04)"}`,
                  overflow: "hidden",
                  transition: "background 0.2s, border-color 0.2s",
                }}
              >
                {/* Row */}
                <div style={{ display: "flex", alignItems: "flex-start", gap: "10px", padding: "9px 10px" }}>
                  {/* Checkbox */}
                  <button
                    type="button"
                    onClick={() => toggle(item.id)}
                    style={{
                      width: "16px",
                      height: "16px",
                      borderRadius: "4px",
                      border: `1.5px solid ${done ? "var(--green)" : "rgba(255,255,255,0.2)"}`,
                      background: done ? "rgba(34,197,94,0.15)" : "transparent",
                      cursor: "pointer",
                      flexShrink: 0,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      marginTop: "1px",
                      transition: "all 0.15s",
                    }}
                    aria-label={done ? "Mark incomplete" : "Mark complete"}
                  >
                    {done && (
                      <svg width="9" height="9" viewBox="0 0 12 12" fill="var(--green)">
                        <path d="M2 6l3 3 5-5" stroke="var(--green)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                      </svg>
                    )}
                  </button>

                  {/* Content */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
                      <TypeDot type={item.type} />
                      <span
                        style={{
                          fontSize: "12px",
                          fontWeight: 500,
                          color: done ? "var(--text-muted)" : "var(--text-primary)",
                          textDecoration: done ? "line-through" : "none",
                          transition: "color 0.2s",
                          cursor: "pointer",
                          flex: 1,
                        }}
                        onClick={() => setExpanded(open ? null : item.id)}
                      >
                        {item.label}
                      </span>
                    </div>

                    {/* Expanded detail */}
                    {open && (
                      <div style={{ marginTop: "6px", paddingTop: "6px", borderTop: "1px solid rgba(255,255,255,0.04)" }}>
                        <p style={{ fontSize: "11px", color: "var(--text-secondary)", lineHeight: 1.6, marginBottom: item.href ? "8px" : "0" }}>
                          {item.detail}
                        </p>
                        {item.href && item.cta && (
                          <Link
                            href={item.href}
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "4px",
                              fontSize: "11px",
                              fontWeight: 600,
                              color: TYPE_COLOR[item.type] ?? "var(--brand-blue)",
                              textDecoration: "none",
                              padding: "4px 10px",
                              borderRadius: "var(--radius-sm)",
                              background: "rgba(255,255,255,0.04)",
                              border: "1px solid rgba(255,255,255,0.07)",
                            }}
                          >
                            {item.cta}
                          </Link>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Quick link arrow (if has href, not expanded) */}
                  {item.href && !open && !done && (
                    <Link
                      href={item.href}
                      style={{
                        flexShrink: 0,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        width: "22px",
                        height: "22px",
                        borderRadius: "var(--radius-sm)",
                        background: "rgba(255,255,255,0.04)",
                        color: "var(--text-muted)",
                        textDecoration: "none",
                        marginTop: "0px",
                      }}
                      title={item.cta ?? ""}
                    >
                      <svg width="9" height="9" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M3 10a.75.75 0 01.75-.75h10.638L10.23 5.29a.75.75 0 111.04-1.08l5.5 5.25a.75.75 0 010 1.08l-5.5 5.25a.75.75 0 11-1.04-1.08l4.158-3.96H3.75A.75.75 0 013 10z" clipRule="evenodd" />
                      </svg>
                    </Link>
                  )}

                  {/* Expand toggle */}
                  <button
                    type="button"
                    onClick={() => setExpanded(open ? null : item.id)}
                    style={{
                      flexShrink: 0,
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      color: "var(--text-muted)",
                      padding: "2px",
                      display: "flex",
                      alignItems: "center",
                    }}
                    aria-label={open ? "Collapse" : "Expand"}
                  >
                    <svg
                      width="9"
                      height="9"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                      style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 0.15s" }}
                    >
                      <path fillRule="evenodd" d="M5.22 8.22a.75.75 0 011.06 0L10 11.94l3.72-3.72a.75.75 0 111.06 1.06l-4.25 4.25a.75.75 0 01-1.06 0L5.22 9.28a.75.75 0 010-1.06z" clipRule="evenodd" />
                    </svg>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
