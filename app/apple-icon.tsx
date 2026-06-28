import { ImageResponse } from "next/og";
import { brandIcon } from "@/lib/brand-icon";

// iPhone home-screen icon: the BuyTune "N" chart mark in white on the brand gradient
// (shared renderer — same mark as the favicon, PWA icons, and in-app logo).
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(brandIcon(180, 0.7), { ...size });
}
