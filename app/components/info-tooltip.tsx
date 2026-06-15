"use client";

import { useState, type ReactNode } from "react";

export default function InfoTooltip({
  text,
  children,
  width = 210,
  align = "center",
}: {
  text: string;
  children: ReactNode;
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
      {children}
      {show && (
        <span
          role="tooltip"
          style={{
            position: "absolute",
            bottom: "calc(100% + 9px)",
            width: `${width}px`,
            background: "linear-gradient(180deg, rgba(13,24,42,0.99), rgba(8,16,30,0.99))",
            border: "1px solid rgba(96,165,250,0.28)",
            borderRadius: "11px",
            padding: "10px 12px",
            fontSize: "11px",
            fontWeight: 400,
            lineHeight: 1.55,
            letterSpacing: "0.1px",
            color: "var(--text-secondary)",
            textTransform: "none",
            boxShadow: "0 10px 32px rgba(0,0,0,0.55), 0 0 0 1px rgba(0,0,0,0.2)",
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
              borderTop: "6px solid rgba(96,165,250,0.28)",
              ...arrowPos,
            }}
          />
        </span>
      )}
    </span>
  );
}
