// The BuyTune chart mark — a single source of truth so every logo matches the app icon.
// A bold, dynamic ascending zigzag (lightning/breakout chart) filling the square, no dots.
// Pure SVG: safe in server, client, and Satori (next/og). Geometry in a 0 0 24 24 viewBox.
//
// Balanced + centered: vertices sit ~5px inside each edge so the bolt reads even (no long
// corner "tail"), peaks near the top, valley near the middle.
export const MARK_POLYLINE = "5 16 10 8.5 14 12.5 19 5";

export function BrandGlyph({
  size = 24,
  stroke = "#ffffff",
  strokeWidth = 3.4,
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
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
