"use client";

import { useEffect } from "react";
import { reportClientError } from "@/app/components/error-reporter";

// Last-resort fallback when the root layout itself fails. It replaces the whole document,
// so the app's stylesheet and tokens may not be available: plain inline styles only.
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    if (!error?.digest) reportClientError(error, "global-error");
  }, [error]);

  return (
    <html lang="en">
      <body style={{ margin: 0, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f3f5ef", color: "#1c2a22", fontFamily: "system-ui, sans-serif", padding: "16px" }}>
        <div style={{ maxWidth: "400px", textAlign: "center" }}>
          <h1 style={{ fontSize: "20px", margin: "0 0 8px" }}>BuyTune hit an error</h1>
          <p style={{ fontSize: "14px", lineHeight: 1.6, margin: "0 0 18px" }}>It&apos;s been reported. Please try again.</p>
          <button type="button" onClick={reset} style={{ minHeight: "44px", padding: "0 20px", borderRadius: "10px", border: "none", background: "#1c2a22", color: "#fff", fontSize: "14px", cursor: "pointer" }}>
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
