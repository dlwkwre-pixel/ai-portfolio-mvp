"use client";

import { useEffect, useRef, useState } from "react";

// Animated number that eases from 0 to `value` on mount. Used across the admin KPIs.
export default function CountUp({
  value, duration = 950, decimals = 0, prefix = "", suffix = "",
}: {
  value: number; duration?: number; decimals?: number; prefix?: string; suffix?: string;
}) {
  const [n, setN] = useState(0);
  const raf = useRef<number | undefined>(undefined);

  useEffect(() => {
    // Animate via rAF — setState lives in the frame callback, never synchronously in the effect.
    const startedAt = performance.now();
    const step = (t: number) => {
      const p = Math.min(1, (t - startedAt) / duration);
      const eased = 1 - Math.pow(1 - p, 3); // ease-out-cubic
      setN(value * eased);
      if (p < 1) raf.current = requestAnimationFrame(step);
      else setN(value);
    };
    raf.current = requestAnimationFrame(step);
    return () => { if (raf.current) cancelAnimationFrame(raf.current); };
  }, [value, duration]);

  const display = decimals > 0
    ? n.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
    : Math.round(n).toLocaleString();

  return <span>{prefix}{display}{suffix}</span>;
}
