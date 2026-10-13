"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

// CSS `position: sticky` can't work here: .bt-main-col sets overflow-x: hidden (to stop
// wide content forcing the column past the viewport), which makes it the sticky container
// even though it never scrolls. So the bar renders in place, and once it scrolls out of
// view a fixed copy takes over at the top, aligned to the in-place bar's column.

export default function StickyMonthBar({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [floating, setFloating] = useState<{ left: number; width: number } | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const r = el.getBoundingClientRect();
        const next = r.bottom < 0 ? { left: Math.round(r.left), width: Math.round(r.width) } : null;
        setFloating((cur) =>
          cur === next || (cur && next && cur.left === next.left && cur.width === next.width) ? cur : next);
      });
    };
    // capture: true also catches scrolling inside the page's inner scroll container
    window.addEventListener("scroll", update, { passive: true, capture: true });
    window.addEventListener("resize", update);
    update();
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", update, { capture: true });
      window.removeEventListener("resize", update);
    };
  }, []);

  return (
    <>
      <div ref={ref}>{children}</div>
      {floating && (
        <div style={{ position: "fixed", top: "calc(8px + env(safe-area-inset-top))", left: floating.left, width: floating.width, zIndex: 30 }}>
          {children}
        </div>
      )}
    </>
  );
}
