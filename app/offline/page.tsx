"use client";

import { BrandGlyph } from "@/app/components/brand-mark";

export default function OfflinePage() {
  return (
    <main style={{
      minHeight: "100vh", background: "#07090f",
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      fontFamily: "'DM Sans', sans-serif", color: "#e2e8f0",
      padding: "24px", textAlign: "center",
    }}>
      <div style={{ width: "56px", height: "56px", background: "linear-gradient(135deg,#2563eb,#7c3aed)", borderRadius: "14px", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "24px" }}>
        <BrandGlyph size={24} strokeWidth={2.4} />
      </div>
      <h1 style={{ fontFamily: "'Syne', sans-serif", fontSize: "24px", fontWeight: 700, marginBottom: "8px" }}>
        You're offline
      </h1>
      <p style={{ fontSize: "15px", color: "#64748b", maxWidth: "320px", lineHeight: 1.6, marginBottom: "24px" }}>
        BuyTune needs an internet connection to fetch live market data and run AI analysis.
      </p>
      <button
        onClick={() => window.location.reload()}
        style={{ padding: "12px 24px", background: "linear-gradient(135deg,#2563eb,#7c3aed)", border: "none", borderRadius: "10px", color: "#fff", fontSize: "14px", fontWeight: 600, cursor: "pointer" }}
      >
        Try again
      </button>
    </main>
  );
}
