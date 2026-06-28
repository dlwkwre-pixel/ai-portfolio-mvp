import type { ReactElement } from "react";
import { MARK_POLYLINE } from "@/app/components/brand-mark";

// Shared element for every ImageResponse-generated icon (favicon, PWA 192/512, apple icon):
// the white "N" chart mark on the brand gradient, full-bleed square. One source of truth so
// the installed-app icons can never drift from the in-app logo.
//
// `markScale` is the mark's fraction of the canvas. Keep it ≤ ~0.7 for PWA "maskable" icons so
// the mark stays inside the platform's safe zone; the favicon can run a touch larger to read.
export function brandIcon(px: number, markScale = 0.64): ReactElement {
  const mark = Math.round(px * markScale);
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "linear-gradient(135deg, #2563eb 0%, #7c3aed 100%)",
      }}
    >
      <svg width={mark} height={mark} viewBox="0 0 24 24" fill="none">
        <polyline points={MARK_POLYLINE} stroke="#ffffff" strokeWidth="3.4" strokeLinecap="butt" strokeLinejoin="miter" />
      </svg>
    </div>
  );
}
