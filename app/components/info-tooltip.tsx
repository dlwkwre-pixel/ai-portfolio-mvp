"use client";

import { useState, type ReactNode } from "react";

// children is the visible trigger (usually a small icon) — optional because most
// call sites across the app pass none, which used to render an empty, invisible,
// unhoverable span with the explanatory text unreachable. Falls back to a default
// "i" glyph so text is never silently stranded again.
export default function InfoTooltip({
  text,
  children,
  width = 210,
  align = "center",
}: {
  text: string;
  children?: ReactNode;
  width?: number;
  align?: "center" | "start" | "end";
}) {
  const [show, setShow] = useState(false);

  const pos =
    align === "start"
      ? { left: 0, transform: "none" }
      : align === "end"
      ? { right: 0, transform: "none" }
      : { left: "50%", transform: "translateX(-50%)" };

  const arrowPos =
    align === "start" ? { left: "14px" } : align === "end" ? { right: "14px" } : { left: "50%", transform: "translateX(-50%)" };

  return (
    <span
      style={{ position: "relative", display: "inline-flex", alignItems: "center" }}
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
      onClick={(e) => { e.stopPropagation(); setShow((s) => !s); }}
    >
      {children ?? (
        <span
          aria-label="More info"
          style={{
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            width: "14px", height: "14px", borderRadius: "50%", flexShrink: 0,
            fontSize: "9px", fontWeight: 700, lineHeight: 1, cursor: "help",
            color: "var(--text-tertiary)", background: "var(--surface-005)",
            border: "1px solid var(--border-subtle)", fontFamily: "var(--font-body)",
          }}
        >
          i
        </span>
      )}
      {show && (
        <span
          role="tooltip"
          style={{
            position: "absolute",
            bottom: "calc(100% + 9px)",
            width: `${width}px`,
            background: "var(--bg-overlay)",
            border: "1px solid var(--card-border)",
            borderRadius: "11px",
            padding: "10px 12px",
            fontSize: "11px",
            fontWeight: 400,
            lineHeight: 1.55,
            letterSpacing: "0.1px",
            color: "var(--text-primary)",
            textTransform: "none",
            boxShadow: "var(--shadow-lg)",
            zIndex: 60,
            pointerEvents: "none",
            whiteSpace: "normal",
            animation: "bt-fade-up 0.14s ease-out",
            ...pos,
          }}
        >
          {text}
          <span
            style={{
              position: "absolute",
              top: "100%",
              width: 0,
              height: 0,
              borderLeft: "6px solid transparent",
              borderRight: "6px solid transparent",
              borderTop: "6px solid var(--card-border)",
              ...arrowPos,
            }}
          />
        </span>
      )}
    </span>
  );
}
