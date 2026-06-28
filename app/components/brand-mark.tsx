// The BuyTune chart mark — a single source of truth so every logo matches the app icon.
// Per brand spec: a stock/portfolio chart that forms the letter "N" — STRAIGHT lines only,
// SHARP angles, NO rounded corners, NO rounded endpoints, NO dots/circles. Rise → dip → rise
// (bullish momentum). The two risers (A→B, C→D) are parallel so it reads as an "N".
// Pure SVG: safe in server, client, and Satori (next/og). Geometry in a 0 0 24 24 viewBox.
//
// A(3,18.5) → B(10,9.5) → C(14,13.5) → D(21,4.5): long lines reaching toward the corners.
export const MARK_POLYLINE = "3 18.5 10 9.5 14 13.5 21 4.5";

export function BrandGlyph({
  size = 24,
  stroke = "#ffffff",
  strokeWidth = 3.2,
}: {
  size?: number;
  stroke?: string;
  strokeWidth?: number;
}) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <polyline
        points={MARK_POLYLINE}
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeLinecap="butt"
        strokeLinejoin="miter"
      />
    </svg>
  );
}
