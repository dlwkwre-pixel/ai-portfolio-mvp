"use client";

import { useId } from "react";

interface SparklineProps {
  points: number[];
  positive: boolean;
  height?: number;
  /** Optional low/high band (e.g. a forecast confidence range), same length as points — rendered as a shaded area behind the line. */
  bandLow?: number[];
  bandHigh?: number[];
}

export default function Sparkline({ points, positive, height = 32, bandLow, bandHigh }: SparklineProps) {
  const uid = useId().replace(/:/g, "");

  if (!points || points.length < 2) return null;

  const hasBand = !!bandLow && !!bandHigh && bandLow.length === points.length && bandHigh.length === points.length;
  const allValues = hasBand ? [...points, ...bandLow!, ...bandHigh!] : points;

  const min = Math.min(...allValues);
  const max = Math.max(...allValues);
  const range = max - min || Math.abs(min) * 0.01 || 1;
  const pad = range * 0.12;
  const lo = min - pad;
  const hi = max + pad;

  // Virtual 100-unit width — SVG scales to fill container via width="100%"
  const W = 100;
  const xAt = (i: number) => (i / (points.length - 1)) * W;
  const yAt = (v: number) => height - ((v - lo) / (hi - lo)) * height;

  const coords = points.map((p, i) => ({ x: xAt(i), y: yAt(p) }));

  const lineD = coords
    .map((c, i) => `${i === 0 ? "M" : "L"}${c.x.toFixed(2)},${c.y.toFixed(2)}`)
    .join(" ");
  const fillD = `${lineD} L${W},${height} L0,${height} Z`;

  const color = positive ? "#00d395" : "#ff5c5c";
  const gid = `spk-${uid}`;

  // Band area: high values left-to-right, then low values right-to-left back to the start.
  const bandD = hasBand
    ? bandHigh!.map((v, i) => `${i === 0 ? "M" : "L"}${xAt(i).toFixed(2)},${yAt(v).toFixed(2)}`).join(" ")
      + " " + bandLow!.map((v, i) => `L${xAt(bandLow!.length - 1 - i).toFixed(2)},${yAt(bandLow![bandLow!.length - 1 - i]).toFixed(2)}`).join(" ")
      + " Z"
    : null;

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
      {bandD && <path d={bandD} fill={color} fillOpacity={0.14} stroke="none" />}
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
