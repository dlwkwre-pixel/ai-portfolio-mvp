// The BuyTune chart mark — a single source of truth so every logo matches the app icon.
// An ascending line drawn as STRAIGHT segments through 4 vertices, with dots only at the
// two outer endpoints (no inner dots). Pure SVG: safe in server, client, and Satori (next/og).
//
// Geometry lives in a 0 0 24 24 viewBox so callers just pass a pixel size.

export const MARK_POLYLINE = "5 16 11 12 16 15 20 7";
export const MARK_ENDPOINTS: [number, number][] = [[5, 16], [20, 7]];

export function BrandGlyph({
  size = 24,
  stroke = "#ffffff",
  strokeWidth = 2.5,
  dots = true,
}: {
  size?: number;
  stroke?: string;
  strokeWidth?: number;
  dots?: boolean;
}) {
  const r = strokeWidth * 0.72;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <polyline
        points={MARK_POLYLINE}
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {dots ? <circle cx={5} cy={16} r={r} fill={stroke} /> : null}
      {dots ? <circle cx={20} cy={7} r={r} fill={stroke} /> : null}
    </svg>
  );
}
