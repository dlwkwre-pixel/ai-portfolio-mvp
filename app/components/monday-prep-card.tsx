"use client";

import { useState, useEffect } from "react";

type ChecklistItem = {
  item: string;
  type: "earnings" | "risk" | "action" | "info";
};

type PrepData = {
  checklist: ChecklistItem[];
  vix_level: number;
  vix_label: string;
  earnings_count: number;
  week_of: string;
};

function isFriSatSun(): boolean {
  const day = new Date().getDay();
  return day === 5 || day === 6 || day === 0;
}

const TYPE_STYLE: Record<string, { color: string; icon: string }> = {
  earnings: { color: "#f59e0b", icon: "📊" },
  risk: { color: "var(--red)", icon: "⚠" },
  action: { color: "rgba(96,165,250,0.9)", icon: "→" },
  info: { color: "var(--text-secondary)", icon: "·" },
};

export default function MondayPrepCard() {
  const [data, setData] = useState<PrepData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  if (typeof window !== "undefined" && !isFriSatSun()) return null;

  useEffect(() => {
    if (!isFriSatSun()) { setLoading(false); return; }
    fetch("/api/market/monday-prep")
      .then((r) => r.json())
      .then((d) => {
        if (d?.checklist) setData(d);
        else setError(true);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  if (typeof window !== "undefined" && !isFriSatSun()) return null;
  if (error) return null;

  return (
    <div
      style={{
        background: "rgba(245,158,11,0.03)",
        border: "1px solid rgba(245,158,11,0.12)",
        borderRadius: "var(--radius-lg)",
        padding: "14px 16px",
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: loading ? "0" : "10px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <svg width="13" height="13" viewBox="0 0 20 20" fill="rgba(251,191,36,0.85)">
            <path fillRule="evenodd" d="M10 2a8 8 0 100 16A8 8 0 0010 2zM6.75 9.25a.75.75 0 000 1.5h4.59l-2.1 1.95a.75.75 0 001.02 1.1l3.5-3.25a.75.75 0 000-1.1l-3.5-3.25a.75.75 0 10-1.02 1.1l2.1 1.95H6.75z" clipRule="evenodd" />
          </svg>
          <span style={{ fontSize: "11px", fontWeight: 600, color: "rgba(251,191,36,0.85)", letterSpacing: "0.04em", textTransform: "uppercase" }}>
            Prepare for Monday
          </span>
        </div>
        {data && (
          <span style={{ fontSize: "10px", color: "var(--text-tertiary)" }}>
            Week of {data.week_of}
          </span>
        )}
      </div>

      {loading && (
        <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "6px 0" }}>
          <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: "rgba(251,191,36,0.5)", animation: "bt-pulse 1.2s ease-in-out infinite" }} />
          <span style={{ fontSize: "11px", color: "var(--text-tertiary)" }}>Building your pre-market checklist...</span>
        </div>
      )}

      {data && !loading && (
        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          {data.checklist.map((c, i) => {
            const style = TYPE_STYLE[c.type] ?? TYPE_STYLE.info;
            return (
              <div
                key={i}
                style={{ display: "flex", alignItems: "flex-start", gap: "8px", padding: "6px 0", borderBottom: i < data.checklist.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none" }}
              >
                <span style={{ fontSize: "11px", color: style.color, flexShrink: 0, marginTop: "1px", lineHeight: 1.5 }}>
                  {style.icon}
                </span>
                <span style={{ fontSize: "12px", color: "var(--text-secondary)", lineHeight: 1.5 }}>
                  {c.item}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
