import { ImageResponse } from "next/og";
import { MARK_POLYLINE, MARK_ENDPOINTS } from "@/app/components/brand-mark";

// iPhone home-screen icon: the BuyTune chart mark (shared geometry from brand-mark.tsx) —
// an ascending line of STRAIGHT segments with dots only at the two outer endpoints, in
// white on the brand gradient. iOS applies its own rounded-squircle mask, so we fill the square.
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
        <svg width="124" height="124" viewBox="0 0 24 24" fill="none">
          <polyline points={MARK_POLYLINE} stroke="#ffffff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          {MARK_ENDPOINTS.map(([cx, cy], i) => (
            <circle key={i} cx={cx} cy={cy} r="1.9" fill="#ffffff" />
          ))}
        </svg>
      </div>
    ),
    { ...size },
  );
}
