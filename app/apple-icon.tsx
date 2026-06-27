import { ImageResponse } from "next/og";

// iPhone home-screen icon: the BuyTune chart mark — an ascending line drawn with STRAIGHT
// segments (no curve) through 4 data dots, in white on the brand gradient. iOS applies its
// own rounded-squircle mask, so we fill the whole square.
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

// Rising chart with a dip (matches the old logo's shape), as straight polyline segments.
const POINTS = "22,86 52,54 74,68 100,30";
const DOTS: [number, number][] = [
  [22, 86], [52, 54], [74, 68], [100, 30],
];

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
        <svg width="122" height="122" viewBox="0 0 122 122" fill="none">
          <polyline
            points={POINTS}
            stroke="#ffffff"
            strokeWidth="10"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {DOTS.map(([cx, cy], i) => (
            <circle key={i} cx={cx} cy={cy} r="8" fill="#ffffff" />
          ))}
        </svg>
      </div>
    ),
    { ...size },
  );
}
