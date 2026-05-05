"use client";

import { useState } from "react";
import StrategyCardItem from "./strategy-card";
import type { StrategyCard } from "./types";

export default function ArchivedSection({ cards }: { cards: StrategyCard[] }) {
  const [isOpen, setIsOpen] = useState(false);

  if (cards.length === 0) return null;

  return (
    <section>
      <button
        type="button"
        onClick={() => setIsOpen(prev => !prev)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "6px",
          background: "none",
          border: "none",
          cursor: "pointer",
          padding: "0",
          marginBottom: isOpen ? "8px" : "0",
        }}
      >
        <span style={{ fontSize: "10px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-muted)" }}>
          Archived
        </span>
        <span style={{ fontSize: "10px", fontFamily: "var(--font-mono)", color: "var(--text-muted)", background: "var(--card-bg)", border: "1px solid var(--card-border)", padding: "1px 7px", borderRadius: "var(--radius-full)" }}>
          {cards.length}
        </span>
        <svg
          width="12" height="12" viewBox="0 0 20 20" fill="currentColor"
          style={{ color: "var(--text-muted)", transform: isOpen ? "rotate(180deg)" : "rotate(0)", transition: "transform 0.24s cubic-bezier(0.16,1,0.3,1)" }}
        >
          <path fillRule="evenodd" d="M5.22 8.22a.75.75 0 011.06 0L10 11.94l3.72-3.72a.75.75 0 111.06 1.06l-4.25 4.25a.75.75 0 01-1.06 0L5.22 9.28a.75.75 0 010-1.06z" clipRule="evenodd" />
        </svg>
      </button>

      <div
        style={{
          display: "grid",
          gridTemplateRows: isOpen ? "1fr" : "0fr",
          transition: "grid-template-rows 0.32s cubic-bezier(0.16,1,0.3,1)",
        }}
      >
        <div style={{ overflow: "hidden" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
            {cards.map(card => (
              <StrategyCardItem key={card.id} card={card} isArchived />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
