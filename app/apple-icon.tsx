import { ImageResponse } from "next/og";

// iPhone home-screen icon: an ascending bar-chart / equalizer mark (a play on "Tune") on the
// brand gradient. Simple rounded rects render crisply at any size (unlike the curved line).
// iOS applies its own rounded-squircle mask, so we fill the whole square — no gaps.
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

const BARS = [54, 86, 118, 150]; // ascending heights (px) — tallest ~83% of the icon

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "center",
          gap: "14px",
          paddingBottom: "32px",
          background: "linear-gradient(135deg, #2563eb 0%, #7c3aed 100%)",
        }}
      >
        {BARS.map((h, i) => (
          <div
            key={i}
            style={{
              width: "26px",
              height: `${h}px`,
              background: "#ffffff",
              borderTopLeftRadius: "7px",
              borderTopRightRadius: "7px",
            }}
          />
        ))}
      </div>
    ),
    { ...size },
  );
}
