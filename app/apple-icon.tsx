import { ImageResponse } from "next/og";

// iPhone home-screen icon. Code-generated (not the gappy /icon-192.png) so we control stroke
// weight + padding. iOS applies its own rounded-squircle mask, so we fill the whole square with
// the brand gradient (no self-rounding, no transparent corners → no gaps). Uses the exact
// BuyTune mark from the sidebar so it matches the brand.
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
        <svg width="120" height="120" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 16c2.5-3 4.5-4 7-4 2 0 3.5 1 5 3 1.5-4 3-7 4-8" />
          <circle cx="5" cy="16" r="1.2" fill="white" stroke="none" />
          <circle cx="11" cy="12" r="1.2" fill="white" stroke="none" />
          <circle cx="16" cy="15" r="1.2" fill="white" stroke="none" />
          <circle cx="20" cy="7" r="1.2" fill="white" stroke="none" />
        </svg>
      </div>
    ),
    { ...size },
  );
}
