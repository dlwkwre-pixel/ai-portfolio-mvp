import { ImageResponse } from "next/og";
import { MARK_POLYLINE } from "@/app/components/brand-mark";

// iPhone home-screen icon: the BuyTune chart mark (shared geometry from brand-mark.tsx) —
// a bold ascending zigzag in white on the brand gradient. iOS applies its own rounded-squircle
// mask, so we fill the whole square.
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
        <svg width="120" height="120" viewBox="0 0 24 24" fill="none">
          <polyline points={MARK_POLYLINE} stroke="#ffffff" strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    ),
    { ...size },
  );
}
