// The BuyTune chart mark — a single source of truth so every logo matches the app icon.
// A bold, dynamic ascending zigzag (lightning/breakout chart) filling the square, no dots.
// Pure SVG: safe in server, client, and Satori (next/og). Geometry in a 0 0 24 24 viewBox.

export const MARK_POLYLINE = "3.5 18 9.5 7.5 13.5 13 20.5 4.5";

export function BrandGlyph({
  size = 24,
  stroke = "#ffffff",
  strokeWidth = 3,
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
