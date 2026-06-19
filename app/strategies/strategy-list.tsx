"use client";

import { useState, useEffect } from "react";
import type { StrategyCard } from "./types";
import StrategyCardItem from "./strategy-card";
import StrategyComparePanel from "./strategy-compare-panel";

export default function StrategyList({
  cards,
  newestIsNew,
}: {
  cards: StrategyCard[];
  newestIsNew: boolean;
}) {
  const [compareMode, setCompareMode] = useState(false);
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [comparing, setComparing] = useState(false);
  const [regimeLevel, setRegimeLevel] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/market/regime")
      .then((r) => r.json())
      .then((d) => { if (d?.level) setRegimeLevel(d.level); })
      .catch(() => {});
  }, []);

  function toggleCard(id: string) {
    setCompareIds(prev => {
      if (prev.includes(id)) return prev.filter(x => x !== id);
      if (prev.length >= 2) return prev;
      return [...prev, id];
    });
  }

  function exitCompare() {
    setCompareMode(false);
    setCompareIds([]);
    setComparing(false);
  }

  const selectedCards = compareIds
    .map(id => cards.find(c => c.id === id))
    .filter((c): c is StrategyCard => c != null);

  return (
    <section>
      {/* Section header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
        <p style={{
          fontSize: "10px", fontWeight: 600, textTransform: "uppercase",
          letterSpacing: "0.08em", color: "var(--text-muted)", margin: 0,
          fontFamily: "var(--font-body)",
        }}>
          My strategies
        </p>

        {cards.length >= 2 && (
          compareMode ? (
            <button type="button" onClick={exitCompare} style={{
              fontSize: "10px", fontWeight: 600, color: "var(--text-muted)",
              background: "none", border: "none", cursor: "pointer",
              fontFamily: "var(--font-body)", padding: 0,
            }}>
              Cancel compare
            </button>
          ) : (
            <button type="button" onClick={() => setCompareMode(true)} style={{
              display: "flex", alignItems: "center", gap: "5px",
              fontSize: "10px", fontWeight: 600, color: "var(--text-secondary)",
              background: "var(--surface-003)",
              border: "1px solid var(--line-007)",
              borderRadius: "6px", cursor: "pointer",
              fontFamily: "var(--font-body)", padding: "3px 9px",
              transition: "background 0.15s",
            }}>
              <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
                <path d="M2 8h12M10 4l4 4-4 4M6 4L2 8l4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Compare
            </button>
          )
        )}
      </div>

      {/* Compare mode instruction */}
      {compareMode && !comparing && (
        <p style={{
          fontSize: "11px", color: "var(--text-muted)", fontFamily: "var(--font-body)",
          margin: "0 0 10px", fontStyle: "italic",
        }}>
          {compareIds.length === 0 && "Select 2 strategies to compare side-by-side."}
          {compareIds.length === 1 && "Select one more strategy."}
          {compareIds.length === 2 && "Ready to compare. Click the button below."}
        </p>
      )}

      {/* Cards */}
      <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
        {cards.map((card, i) => {
          const isSelected = compareIds.includes(card.id);
          const isDisabled = compareMode && compareIds.length >= 2 && !isSelected;

          return (
            <div key={card.id} style={{ position: "relative" }}>
              {/* Compare selection ring */}
              <div style={{
                borderRadius: "var(--radius-xl)",
                outline: compareMode
                  ? isSelected
                    ? "2px solid #7c3aed"
                    : isDisabled
                      ? "2px solid transparent"
                      : "2px solid rgba(255,255,255,0.08)"
                  : "none",
                opacity: isDisabled ? 0.45 : 1,
                transition: "outline 0.15s, opacity 0.15s",
              }}>
                <StrategyCardItem card={card} isNew={i === 0 && newestIsNew} regimeLevel={regimeLevel} />
              </div>

              {/* Overlay select button — only visible in compare mode */}
              {compareMode && (
                <button
                  type="button"
                  onClick={() => !isDisabled && toggleCard(card.id)}
                  style={{
                    position: "absolute", top: "10px", right: "14px", zIndex: 5,
                    width: "22px", height: "22px", borderRadius: "50%",
                    border: isSelected ? "2px solid #7c3aed" : "2px solid rgba(255,255,255,0.2)",
                    background: isSelected ? "#7c3aed" : "rgba(4,13,26,0.8)",
                    cursor: isDisabled ? "default" : "pointer",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    transition: "background 0.15s, border-color 0.15s",
                  }}
                  title={isSelected ? "Deselect" : "Select for comparison"}
                >
                  {isSelected && (
                    <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                      <path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  )}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Compare CTA */}
      {compareMode && compareIds.length === 2 && !comparing && (
        <div style={{
          marginTop: "10px",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "12px 16px",
          background: "rgba(109,40,217,0.07)",
          border: "1px solid rgba(109,40,217,0.2)",
          borderRadius: "12px",
        }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
            <span style={{ fontSize: "11px", fontWeight: 600, color: "var(--text-primary)", fontFamily: "var(--font-body)" }}>
              {selectedCards[0]?.name}
              <span style={{ color: "var(--text-muted)", fontWeight: 400, margin: "0 6px" }}>vs</span>
              {selectedCards[1]?.name}
            </span>
            <span style={{ fontSize: "10px", color: "var(--text-muted)", fontFamily: "var(--font-body)" }}>
              FINN will analyze both strategies in parallel
            </span>
          </div>
          <button
            type="button"
            onClick={() => setComparing(true)}
            style={{
              padding: "7px 16px", borderRadius: "var(--radius-xl)", border: "none",
              background: "linear-gradient(135deg,#7c3aed,#4f46e5)",
              color: "#fff", fontFamily: "var(--font-body)",
              fontSize: "12px", fontWeight: 700, cursor: "pointer", flexShrink: 0,
            }}
          >
            Compare →
          </button>
        </div>
      )}

      {/* Comparison panel */}
      {comparing && selectedCards.length === 2 && (
        <StrategyComparePanel
          cardA={selectedCards[0]}
          cardB={selectedCards[1]}
          onClose={exitCompare}
        />
      )}
    </section>
  );
}
