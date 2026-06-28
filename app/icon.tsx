import { ImageResponse } from "next/og";
import { brandIcon } from "@/lib/brand-icon";

// Browser-tab favicon — generated from the shared brand mark so it always matches.
export const size = { width: 64, height: 64 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(brandIcon(64, 0.74), { ...size });
}
