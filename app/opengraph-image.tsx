import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "BuyTune — AI Portfolio Management";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Sage link-preview card. Deep teal-navy ground (oklch(0.24 0.045 210) ≈ #10222d,
// hard-coded because Satori doesn't parse oklch()), soft brand-gradient glow,
// green-teal logo tile, and a SOLID warm-white headline — the old file used
// background-clip:text gradient text, which the design system bans.
const GROUND = "#10222d";
const HEAD = "#f4f2e8"; // warm off-white ≈ oklch(0.95 0.015 90)
export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "1200px",
          height: "630px",
          background: GROUND,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "system-ui, sans-serif",
          position: "relative",
          padding: "0 80px",
        }}
      >
        {/* Soft brand-gradient glow (low opacity, same technique as before) */}
        <div style={{
          position: "absolute", inset: 0,
          background: "radial-gradient(ellipse 70% 60% at 50% 45%, rgba(63,174,74,0.16), transparent 70%)",
        }} />
        <div style={{
          position: "absolute", inset: 0,
          background: "radial-gradient(ellipse 45% 45% at 80% 85%, rgba(14,165,160,0.14), transparent 60%)",
        }} />

        {/* Logo */}
        <div style={{ display: "flex", alignItems: "center", gap: "14px", marginBottom: "40px" }}>
          <div style={{
            width: "48px", height: "48px",
            background: "linear-gradient(135deg, #3fae4a, #0ea5a0)",
            borderRadius: "12px",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <polyline points="3 18.5 10 9.5 14 13.5 21 4.5" stroke="white" strokeWidth="3.2" strokeLinecap="butt" strokeLinejoin="miter" />
            </svg>
          </div>
          <span style={{ fontSize: "28px", fontWeight: 800, letterSpacing: "0.04em", textTransform: "uppercase", color: "#5fd0c9" }}>
            BuyTune
          </span>
        </div>

        {/* Headline — solid color, no gradient text */}
        <div style={{
          fontSize: "64px", fontWeight: 800, color: HEAD,
          letterSpacing: "-2px", lineHeight: 1.1, textAlign: "center",
          marginBottom: "20px",
        }}>
          AI Portfolio Management
        </div>
        <div style={{
          fontSize: "64px", fontWeight: 800, color: HEAD,
          letterSpacing: "-2px", lineHeight: 1.1, textAlign: "center",
          marginBottom: "32px",
        }}>
          Built around your goals.
        </div>

        {/* Subline */}
        <div style={{
          fontSize: "22px", color: "#8fb3ad", textAlign: "center",
          maxWidth: "700px", lineHeight: 1.5,
        }}>
          Portfolio analytics, AI analysis, financial planning, and Atlas — your personal financial AI.
        </div>

        {/* URL */}
        <div style={{
          position: "absolute", bottom: "48px",
          fontSize: "18px", color: "#4a726c", fontWeight: 500,
        }}>
          buytune.io
        </div>
      </div>
    ),
    { ...size }
  );
}
