"use client";

import { useId } from "react";

interface SparklineProps {
  points: number[];
  positive: boolean;
  height?: number;
}

export default function Sparkline({ points, positive, height = 32 }: SparklineProps) {
  const uid = useId().replace(/:/g, "");

  if (!points || points.length < 2) return null;

  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || Math.abs(min) * 0.01 || 1;
  const pad = range * 0.12;
  const lo = min - pad;
  const hi = max + pad;

  // Virtual 100-unit width — SVG scales to fill container via width="100%"
  const W = 100;
  const coords = points.map((p, i) => ({
    x: (i / (points.length - 1)) * W,
    y: height - ((p - lo) / (hi - lo)) * height,
  }));

  const lineD = coords
    .map((c, i) => `${i === 0 ? "M" : "L"}${c.x.toFixed(2)},${c.y.toFixed(2)}`)
    .join(" ");
  const fillD = `${lineD} L${W},${height} L0,${height} Z`;

  const color = positive ? "#00d395" : "#ff5c5c";
  const gid = `spk-${uid}`;

  return (
    <svg
      width="100%"
      height={height}
      viewBox={`0 0 ${W} ${height}`}
      preserveAspectRatio="none"
      style={{ display: "block" }}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor={color} stopOpacity="0.22" />
          <stop offset="100%" stopColor={color} stopOpacity="0"    />
        </linearGradient>
      </defs>
      <path d={fillD} fill={`url(#${gid})`} />
      <path
        d={lineD}
        fill="none"
        stroke={color}
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
