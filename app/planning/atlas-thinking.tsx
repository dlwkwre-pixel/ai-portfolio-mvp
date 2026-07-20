"use client";

import { useState, useEffect } from "react";

// Shared Atlas "thinking" indicator — a softly glowing orb + cycling contextual
// states, so every Atlas surface (chat, sub-planner takes) feels like the same
// premium advisor instead of a generic spinner.
const DEFAULT_STATES = [
  "Reviewing your inputs…",
  "Running the numbers…",
  "Weighing the trade-offs…",
  "Pressure-testing the plan…",
];

export default function AtlasThinking({
  messages = DEFAULT_STATES,
  label = "Atlas",
}: {
  messages?: string[];
  label?: string;
}) {
  const [i, setI] = useState(0);
  useEffect(() => {
    setI(0);
    const t = setInterval(() => setI((p) => (p + 1) % messages.length), 1600);
    return () => clearInterval(t);
  }, [messages.length]);

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "12px 14px", borderRadius: "var(--radius-md, 10px)", background: "var(--violet-bg, rgba(63,174,74,0.06))", border: "1px solid var(--violet-border, rgba(63,174,74,0.18))" }}>
      <div className="atlas-thinking-orb" style={{
        width: "28px", height: "28px", borderRadius: "50%", flexShrink: 0,
        background: "linear-gradient(135deg, #3fae4a 0%, #0e9488 100%)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }} aria-hidden>
        <span style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: "12px", color: "#fff" }}>A</span>
      </div>
      <span key={i} style={{ fontSize: "12px", color: "var(--text-secondary)", fontFamily: "var(--font-body)", animation: "atlasFade 0.4s ease both" }}>
        {messages[i]}
      </span>
      <div style={{ display: "flex", gap: "4px", alignItems: "center", marginLeft: "auto" }} aria-label={`${label} is thinking`}>
        {[0, 1, 2].map((d) => (
          <div key={d} style={{ width: "5px", height: "5px", borderRadius: "50%", background: "var(--violet, #3fae4a)", opacity: 0.8, animation: `atlasBounce 1.2s ${d * 0.2}s ease-in-out infinite` }} />
        ))}
      </div>
      <style>{`
        @keyframes atlasGlow { 0%,100% { box-shadow: 0 0 0 0 rgba(63,174,74,0); } 50% { box-shadow: 0 0 0 5px rgba(63,174,74,0.18); } }
        .atlas-thinking-orb { animation: atlasGlow 1.8s ease-in-out infinite; }
        @keyframes atlasFade { from { opacity: 0; transform: translateY(2px); } to { opacity: 1; transform: none; } }
        @keyframes atlasBounce { 0%,60%,100% { transform: translateY(0); } 30% { transform: translateY(-4px); } }
      `}</style>
    </div>
  );
}
