import { ImageResponse } from "next/og";
import { brandIcon } from "@/lib/brand-icon";

// PWA install icon (192px) — generated from the shared brand mark. Referenced by manifest.json.
export const dynamic = "force-static";

export function GET() {
  return new ImageResponse(brandIcon(192), { width: 192, height: 192 });
}
