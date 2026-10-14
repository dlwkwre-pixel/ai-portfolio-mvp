"use client";

import { useSyncExternalStore } from "react";

// Dates and times in the viewer's own timezone, without hydration errors.
//
// A client component is rendered on the server first (in UTC on Vercel) and again in the
// browser (in the user's timezone). `new Date(x).toLocaleString()` in render therefore
// produces different text in each place — React error #418, a visible flicker, and for a
// moment the wrong time. This renders nothing on the server, then the local value right
// after hydration (useSyncExternalStore's server snapshot is false, the client's is true).

const subscribe = () => () => {};

export function useIsClient(): boolean {
  return useSyncExternalStore(subscribe, () => true, () => false);
}

type Mode = "datetime" | "date" | "time";

export default function LocalTime({
  value, mode = "datetime", options, className, style,
}: {
  value: string | number | Date | null | undefined;
  mode?: Mode;
  options?: Intl.DateTimeFormatOptions;
  className?: string;
  style?: React.CSSProperties;
}) {
  const isClient = useIsClient();
  if (value == null) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  const text = !isClient ? "" :
    mode === "date" ? d.toLocaleDateString(undefined, options)
    : mode === "time" ? d.toLocaleTimeString(undefined, options)
    : d.toLocaleString(undefined, options);
  return <time dateTime={d.toISOString()} className={className} style={style}>{text}</time>;
}
