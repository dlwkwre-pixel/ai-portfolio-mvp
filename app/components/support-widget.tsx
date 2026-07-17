"use client";

import { useState, useRef, useEffect, useTransition } from "react";

const AREAS = [
  { value: "dashboard",  label: "Dashboard" },
  { value: "portfolios", label: "Portfolios" },
  { value: "strategies", label: "Strategies" },
  { value: "planning",   label: "Planning" },
  { value: "research",   label: "Research" },
  { value: "tax",        label: "Tax" },
  { value: "community",  label: "Community" },
  { value: "account",    label: "Account / Settings" },
  { value: "billing",    label: "Billing" },
  { value: "other",      label: "Other" },
];

export default function SupportWidget() {
  const [open, setOpen] = useState(false);
  const [area, setArea] = useState("other");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");
  const [isPending, startTransition] = useTransition();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  function handleOpen() {
    setOpen((v) => !v);
    setStatus("idle");
  }

  function handleSubmit() {
    if (!description.trim()) return;
    startTransition(async () => {
      try {
        const res = await fetch("/api/support", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ area, description }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Failed");
        setStatus("success");
        setDescription("");
        setArea("other");
      } catch {
        setStatus("error");
      }
    });
  }

  const inputBase: React.CSSProperties = {
    width: "100%",
    padding: "8px 10px",
    borderRadius: "8px",
    border: "1px solid var(--card-border)",
    background: "var(--bg-elevated, var(--card-bg))",
    color: "var(--text-primary)",
    fontSize: "13px",
    fontFamily: "var(--font-body)",
    outline: "none",
    boxSizing: "border-box",
  };

  return (
    <div ref={panelRef} style={{ position: "relative", flexShrink: 0 }}>
      {/* Trigger button */}
      <button
        type="button"
        onClick={handleOpen}
        aria-label="Support"
        title="Submit a support ticket"
        style={{
          width: "32px",
          height: "32px",
          borderRadius: "8px",
          border: "1px solid var(--card-border)",
          background: open ? "rgba(255,255,255,0.06)" : "var(--card-bg)",
          color: "var(--text-secondary)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
          transition: "var(--transition-fast)",
          flexShrink: 0,
        }}
      >
        {/* Question mark / help icon */}
        <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-3a1 1 0 00-.867.5 1 1 0 11-1.731-1A3 3 0 0113 8a3.001 3.001 0 01-2 2.83V11a1 1 0 11-2 0v-1a1 1 0 011-1 1 1 0 100-2zm0 8a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
        </svg>
      </button>

      {/* Panel */}
      {open && (
        <div style={{
          position: "absolute",
          top: "calc(100% + 8px)",
          right: 0,
          width: "300px",
          background: "var(--sidebar-bg, var(--card-bg))",
          border: "1px solid var(--card-border)",
          borderRadius: "12px",
          padding: "18px",
          boxShadow: "0 8px 32px rgba(0,0,0,0.28)",
          zIndex: 9999,
          display: "flex",
          flexDirection: "column",
          gap: "12px",
          fontFamily: "var(--font-body)",
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontSize: "14px", fontWeight: 700, color: "var(--text-primary)" }}>Submit a ticket</div>
              <div style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "2px" }}>We&apos;ll look into it and get back to you</div>
            </div>
            <button type="button" onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", padding: "2px", display: "flex", alignItems: "center" }}>
              <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
            </button>
          </div>

          {status === "success" ? (
            <div style={{ padding: "20px 0", textAlign: "center" }}>
              <div style={{ fontSize: "28px", marginBottom: "8px" }}>✓</div>
              <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-primary)", marginBottom: "4px" }}>Ticket submitted</div>
              <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>We&apos;ll review it shortly. Thanks for the report.</div>
              <button type="button" onClick={() => { setStatus("idle"); setOpen(false); }} style={{ marginTop: "14px", padding: "7px 18px", borderRadius: "8px", background: "var(--accent)", color: "#fff", border: "none", fontSize: "12px", fontWeight: 600, cursor: "pointer", fontFamily: "var(--font-body)" }}>Done</button>
            </div>
          ) : (
            <>
              <div>
                <label style={{ fontSize: "10px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--text-muted)", display: "block", marginBottom: "5px" }}>
                  Area
                </label>
                <select value={area} onChange={(e) => setArea(e.target.value)} style={inputBase}>
                  {AREAS.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
                </select>
              </div>

              <div>
                <label style={{ fontSize: "10px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--text-muted)", display: "block", marginBottom: "5px" }}>
                  Description
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe what happened or what you need help with..."
                  rows={4}
                  style={{ ...inputBase, resize: "vertical", minHeight: "90px", lineHeight: 1.5 }}
                />
              </div>

              {status === "error" && (
                <div style={{ fontSize: "12px", color: "var(--red)", padding: "8px 10px", borderRadius: "6px", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)" }}>
                  Something went wrong. Please try again.
                </div>
              )}

              <button
                type="button"
                disabled={isPending || !description.trim()}
                onClick={handleSubmit}
                style={{
                  width: "100%",
                  padding: "9px 0",
                  borderRadius: "8px",
                  background: "var(--accent)",
                  color: "#fff",
                  border: "none",
                  fontSize: "13px",
                  fontWeight: 600,
                  fontFamily: "var(--font-body)",
                  cursor: isPending || !description.trim() ? "not-allowed" : "pointer",
                  opacity: isPending || !description.trim() ? 0.5 : 1,
                  transition: "opacity 0.15s",
                }}
              >
                {isPending ? "Sending…" : "Send Ticket"}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
