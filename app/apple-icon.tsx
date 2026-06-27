import { ImageResponse } from "next/og";

// iPhone home-screen icon. Code-generated (not the gappy /icon-192.png) so we control the
// logo's stroke weight, length, and padding. iOS applies its own rounded-squircle mask, so we
// fill the whole square with the brand gradient (no self-rounding) — no gaps, no short lines.
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #2563eb 0%, #7c3aed 100%)",
        }}
      >
        <svg width="124" height="124" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3.5 16.5c2.8-3.3 5-4.6 8-4.6 2.2 0 3.9 1.1 5.6 3.3 1.6-4.4 3.2-7.6 4.2-8.7" />
          <circle cx="3.5" cy="16.5" r="1.5" fill="white" stroke="none" />
          <circle cx="11.5" cy="11.9" r="1.5" fill="white" stroke="none" />
          <circle cx="17.1" cy="15.2" r="1.5" fill="white" stroke="none" />
          <circle cx="21.3" cy="6.5" r="1.5" fill="white" stroke="none" />
        </svg>
      </div>
    ),
    { ...size },
  );
}
