"use client";

import { useState, useEffect } from "react";
import type { FinnInsight } from "@/lib/portfolio/insights";

export type { FinnInsight };

export default function FinnInsightCard({ insights, portfolioId }: { insights: FinnInsight[]; portfolioId: string }) {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    try {
      const key = `bt-finn-dismissed-${portfolioId}`;
      const stored = JSON.parse(localStorage.getItem(key) ?? "[]") as string[];
      setDismissed(new Set(stored));
    } catch {
      // ignore
    }
  }, [portfolioId]);

  const dismiss = (id: string) => {
    setDismissed((prev) => {
      const next = new Set(prev);
      next.add(id);
      try {
        const key = `bt-finn-dismissed-${portfolioId}`;
        localStorage.setItem(key, JSON.stringify([...next]));
      } catch {}
      return next;
    });
  };

  if (!mounted) return null;

  const visible = insights.filter((i) => !dismissed.has(i.id));
  if (visible.length === 0) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      {visible.map((insight) => (
        <div
          key={insight.id}
          style={{
            background: "rgba(124,58,237,0.04)",
            border: "1px solid rgba(124,58,237,0.14)",
            borderRadius: "var(--radius-lg)",
            padding: "12px 14px",
            position: "relative",
          }}
        >
          <button
            type="button"
            onClick={() => dismiss(insight.id)}
            aria-label="Dismiss"
            style={{
              position: "absolute",
              top: "10px",
              right: "10px",
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "var(--text-muted)",
              padding: "2px",
              lineHeight: 1,
            }}
          >
            <svg width="10" height="10" viewBox="0 0 20 20" fill="currentColor">
              <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
            </svg>
          </button>

          <div style={{ display: "flex", alignItems: "flex-start", gap: "9px", paddingRight: "16px" }}>
            <div style={{ marginTop: "1px", flexShrink: 0 }}>
              <svg width="13" height="13" viewBox="0 0 20 20" fill="var(--violet)">
                <path d="M15.98 1.804a1 1 0 00-1.96 0l-.24 1.192a1 1 0 01-.784.785l-1.192.238a1 1 0 000 1.962l1.192.238a1 1 0 01.785.785l.238 1.192a1 1 0 001.962 0l.238-1.192a1 1 0 01.785-.785l1.192-.238a1 1 0 000-1.962l-1.192-.238a1 1 0 01-.785-.785l-.238-1.192z" />
                <path d="M6.949 5.684a1 1 0 00-1.898 0l-.683 2.051a1 1 0 01-.633.633l-2.051.683a1 1 0 000 1.898l2.051.684a1 1 0 01.633.632l.683 2.051a1 1 0 001.898 0l.683-2.051a1 1 0 01.633-.633l2.051-.683a1 1 0 000-1.897l-2.051-.684a1 1 0 01-.633-.633L6.95 5.684z" />
              </svg>
            </div>
            <div>
              <p style={{ fontSize: "12px", fontWeight: 500, color: "var(--text-primary)", marginBottom: "4px" }}>
                Atlas: {insight.title}
              </p>
              <p style={{ fontSize: "11px", color: "var(--text-secondary)", lineHeight: 1.6 }}>
                {insight.body}
              </p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
