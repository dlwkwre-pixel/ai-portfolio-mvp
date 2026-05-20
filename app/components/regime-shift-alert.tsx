"use client";

import { useState, useEffect } from "react";

type HistoryPoint = { date: string; level: string; label: string; score: number };

const LEVEL_ORDER: Record<string, number> = {
  "risk-on": 5, "constructive": 4, "cautious": 3, "defensive": 2, "risk-off": 1,
};

export default function RegimeShiftAlert() {
  const [shift, setShift] = useState<{ fromLabel: string; toLabel: string; to: string; improving: boolean } | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    fetch("/api/market/regime/history")
      .then((r) => r.json())
      .then((data: HistoryPoint[]) => {
        if (!Array.isArray(data) || data.length < 2) return;
        const last = data[data.length - 1];
        const prev = data[data.length - 2];
        if (last.level !== prev.level) {
          const improving = (LEVEL_ORDER[last.level] ?? 3) > (LEVEL_ORDER[prev.level] ?? 3);
          setShift({ fromLabel: prev.label, toLabel: last.label, to: last.level, improving });
        }
      })
      .catch(() => {});
  }, []);

  if (!shift || dismissed) return null;

  const color = shift.improving ? "var(--green)" : "var(--amber)";
  const bg    = shift.improving ? "var(--green-bg)" : "var(--amber-bg)";
  const border= shift.improving ? "var(--green-border)" : "var(--amber-border)";

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: "10px",
      padding: "10px 14px",
      background: bg,
      border: `1px solid ${border}`,
      borderRadius: "var(--radius-lg)",
    }}>
      <svg width="14" height="14" viewBox="0 0 20 20" fill={color} style={{ flexShrink: 0 }}>
        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z" clipRule="evenodd" />
      </svg>
      <p style={{ flex: 1, margin: 0, fontSize: "12px", fontFamily: "var(--font-body)", lineHeight: 1.5 }}>
        <span style={{ fontWeight: 700, color: "var(--text-primary)" }}>Regime shift: </span>
        <span style={{ color: "var(--text-secondary)" }}>
          Market moved from <strong>{shift.fromLabel}</strong> to{" "}
          <strong style={{ color }}>{shift.toLabel}</strong>.
          {shift.improving ? " Conditions are improving." : " Review your position sizing and cash allocation."}
        </span>
      </p>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: "16px", lineHeight: 1, padding: "2px 4px", flexShrink: 0 }}
        aria-label="Dismiss"
      >
        ×
      </button>
    </div>
  );
}
