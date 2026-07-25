"use client";

import { useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import TickerPreviewModal from "./ticker-preview-modal";

// Self-contained clickable $TICKER — manages its own preview-modal state, so
// it can drop into server components (e.g. community portfolio detail pages)
// without lifting modal state up through the tree.
export default function TickerChip({ ticker, children, style, className }: {
  ticker: string; children?: ReactNode; style?: CSSProperties; className?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className={className}
        onClick={(e) => { e.stopPropagation(); e.preventDefault(); setOpen(true); }}
        style={{ background: "none", border: "none", padding: 0, cursor: "pointer", font: "inherit", textAlign: "left", ...style }}
      >
        {children ?? `$${ticker}`}
      </button>
      {open && <TickerPreviewModal ticker={ticker} onClose={() => setOpen(false)} />}
    </>
  );
}
