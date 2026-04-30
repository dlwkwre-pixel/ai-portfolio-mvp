import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/app/components/theme-provider";
import PWARegister from "@/app/components/pwa-register";
import MobileBottomNav from "@/app/components/mobile-bottom-nav";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "BuyTune.io — AI-Powered Portfolio Analysis",
  description: "Institutional-grade AI investing insights, personalized to your strategy and risk profile.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "BuyTune",
  },
  formatDetection: {
    telephone: false,
  },
  openGraph: {
    title: "BuyTune.io — AI Portfolio Analysis",
    description: "Institutional-grade AI investing insights, personalized to your strategy.",
    type: "website",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#07090f",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <link rel="apple-touch-icon" sizes="192x192" href="/icon-192.png" />
        <link rel="apple-touch-icon" sizes="512x512" href="/icon-512.png" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="BuyTune" />
      </head>
      <body className="min-h-full flex flex-col">
        <ThemeProvider>
          <PWARegister />
          {children}
          <MobileBottomNav />
        </ThemeProvider>
      </body>
    </html>
  );
}
