"use client";

import { useState, useRef, useEffect } from "react";

type Props = { portfolioId: string };

export default function ExportReportButton({ portfolioId }: Props) {
  const [open, setOpen] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  function openReport() {
    window.open(`/portfolios/${portfolioId}/report`, "_blank");
    setOpen(false);
  }

  async function downloadExcel() {
    if (downloading) return;
    setDownloading(true);
    setOpen(false);
    try {
      const res = await fetch(`/api/portfolios/${portfolioId}/export-xlsx`);
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const cd = res.headers.get("content-disposition") ?? "";
      const match = cd.match(/filename="([^"]+)"/);
      a.href = url;
      a.download = match?.[1] ?? "BuyTune-Portfolio.xlsx";
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // silent — user will see nothing happened
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "5px",
          padding: "5px 10px",
          background: "var(--bg-surface)",
          border: "1px solid var(--card-border)",
          borderRadius: "var(--radius-md)",
          cursor: "pointer",
          fontFamily: "var(--font-body)",
          fontSize: "11px",
          fontWeight: 500,
          color: "var(--text-secondary)",
          transition: "border-color 0.15s",
        }}
        title="Export Report"
      >
        <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
        </svg>
        Export
        <svg width="10" height="10" viewBox="0 0 20 20" fill="currentColor" style={{ opacity: 0.6 }}>
          <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
        </svg>
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            right: 0,
            background: "var(--bg-elevated)",
            border: "1px solid var(--card-border)",
            borderRadius: "var(--radius-md)",
            boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
            minWidth: "190px",
            overflow: "hidden",
            zIndex: 50,
          }}
        >
          <div style={{ padding: "5px" }}>
            <button
              onClick={openReport}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                gap: "8px",
                padding: "8px 10px",
                background: "none",
                border: "none",
                cursor: "pointer",
                fontFamily: "var(--font-body)",
                fontSize: "12px",
                color: "var(--text-primary)",
                borderRadius: "var(--radius-sm)",
                textAlign: "left",
              }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.background = "var(--bg-surface)")
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.background = "none")
              }
            >
              <svg width="13" height="13" viewBox="0 0 20 20" fill="currentColor" style={{ color: "var(--brand-blue)", flexShrink: 0 }}>
                <path fillRule="evenodd" d="M5 4v3H4a2 2 0 00-2 2v3a2 2 0 002 2h1v2a2 2 0 002 2h6a2 2 0 002-2v-2h1a2 2 0 002-2V9a2 2 0 00-2-2h-1V4a2 2 0 00-2-2H7a2 2 0 00-2 2zm8 0H7v3h6V4zm0 8H7v4h6v-4z" clipRule="evenodd" />
              </svg>
              <div>
                <div style={{ fontWeight: 500 }}>View Report / Export PDF</div>
                <div style={{ fontSize: "10px", color: "var(--text-muted)", marginTop: "1px" }}>Opens full report — Print → Save as PDF</div>
              </div>
            </button>

            <button
              onClick={downloadExcel}
              disabled={downloading}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                gap: "8px",
                padding: "8px 10px",
                background: "none",
                border: "none",
                cursor: downloading ? "default" : "pointer",
                fontFamily: "var(--font-body)",
                fontSize: "12px",
                color: downloading ? "var(--text-muted)" : "var(--text-primary)",
                borderRadius: "var(--radius-sm)",
                textAlign: "left",
                opacity: downloading ? 0.6 : 1,
              }}
              onMouseEnter={(e) => {
                if (!downloading) e.currentTarget.style.background = "var(--bg-surface)";
              }}
              onMouseLeave={(e) =>
                (e.currentTarget.style.background = "none")
              }
            >
              <svg width="13" height="13" viewBox="0 0 20 20" fill="currentColor" style={{ color: "#22c55e", flexShrink: 0 }}>
                <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
              <div>
                <div style={{ fontWeight: 500 }}>
                  {downloading ? "Generating..." : "Export Excel (.xlsx)"}
                </div>
                <div style={{ fontSize: "10px", color: "var(--text-muted)", marginTop: "1px" }}>
                  Summary, Holdings, Recommendations, Cash
                </div>
              </div>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
