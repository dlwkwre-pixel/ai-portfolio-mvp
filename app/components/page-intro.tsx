"use client";

import { useState, useEffect } from "react";

type PageIntroProps = {
  pageKey: string;
  title: string;
  description: string;
};

export default function PageIntro({ pageKey, title, description }: PageIntroProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      if (!localStorage.getItem(`bt-intro-${pageKey}`)) setVisible(true);
    } catch {}
  }, [pageKey]);

  if (!visible) return null;

  function dismiss() {
    try { localStorage.setItem(`bt-intro-${pageKey}`, "1"); } catch {}
    setVisible(false);
  }

  return (
    <div style={{
      display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "12px",
      padding: "12px 16px", marginBottom: "20px",
      background: "rgba(14,165,160,0.06)", border: "1px solid rgba(14,165,160,0.15)",
      borderRadius: "var(--radius-md)",
    }}>
      <div>
        <p style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)", marginBottom: "2px" }}>
          {title}
        </p>
        <p style={{ fontSize: "12px", color: "var(--text-secondary)", lineHeight: 1.5 }}>
          {description}
        </p>
      </div>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss"
        style={{
          flexShrink: 0, padding: "4px", background: "transparent", border: "none",
          cursor: "pointer", color: "var(--text-muted)", lineHeight: 1,
        }}
      >
        <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd"/>
        </svg>
      </button>
    </div>
  );
}
