import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "BuyTune — AI Portfolio Management";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "1200px",
          height: "630px",
          background: "linear-gradient(135deg, #050d1e 0%, #0a1628 60%, #0d1a35 100%)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "system-ui, sans-serif",
          position: "relative",
          padding: "0 80px",
        }}
      >
        {/* Glow */}
        <div style={{
          position: "absolute", inset: 0,
          background: "radial-gradient(ellipse 70% 60% at 50% 50%, rgba(37,99,235,0.1), transparent 70%)",
        }} />

        {/* Logo */}
        <div style={{ display: "flex", alignItems: "center", gap: "14px", marginBottom: "40px" }}>
          <div style={{
            width: "48px", height: "48px",
            background: "linear-gradient(135deg, #2563eb, #7c3aed)",
            borderRadius: "12px",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
              <path d="M4 16c2.5-3 4.5-4 7-4 2 0 3.5 1 5 3 1.5-4 3-7 4-8" />
            </svg>
          </div>
          <span style={{ fontSize: "28px", fontWeight: 800, letterSpacing: "0.04em", textTransform: "uppercase", color: "#3b82f6" }}>
            BuyTune
          </span>
        </div>

        {/* Headline */}
        <div style={{
          fontSize: "64px", fontWeight: 800, color: "#f0f4ff",
          letterSpacing: "-2px", lineHeight: 1.1, textAlign: "center",
          marginBottom: "20px",
        }}>
          AI Portfolio Management
        </div>
        <div style={{
          fontSize: "64px", fontWeight: 800,
          background: "linear-gradient(90deg, #3b82f6, #818cf8)",
          backgroundClip: "text",
          color: "transparent",
          letterSpacing: "-2px", lineHeight: 1.1, textAlign: "center",
          marginBottom: "32px",
        }}>
          Built around your goals.
        </div>

        {/* Subline */}
        <div style={{
          fontSize: "22px", color: "#475569", textAlign: "center",
          maxWidth: "700px", lineHeight: 1.5,
        }}>
          Portfolio analytics, AI analysis, financial planning, and FINN — your personal financial AI.
        </div>

        {/* URL */}
        <div style={{
          position: "absolute", bottom: "48px",
          fontSize: "18px", color: "#1e3a5f", fontWeight: 500,
        }}>
          buytune.io
        </div>
      </div>
    ),
    { ...size }
  );
}
