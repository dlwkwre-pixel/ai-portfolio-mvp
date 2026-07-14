"use client";

import { useState, useEffect, useTransition } from "react";

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

export default function SupportModal() {
  const [open, setOpen] = useState(false);
  const [area, setArea] = useState("other");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");
  const [isPending, startTransition] = useTransition();

  function handleOpen() {
    setOpen(true);
    setStatus("idle");
  }

  function handleClose() {
    setOpen(false);
    setStatus("idle");
  }

  // Keyboard users can always escape the dialog (WCAG 2.1.2 — no keyboard trap).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") handleClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

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
    background: "var(--bg-elevated, rgba(255,255,255,0.04))",
    color: "var(--text-primary)",
    fontSize: "13px",
    fontFamily: "var(--font-body)",
    outline: "none",
    boxSizing: "border-box",
  };

  return (
    <>
      <button
        type="button"
        onClick={handleOpen}
        className="sb-signout"
        style={{
          width: "100%",
          padding: "7px 10px",
          borderRadius: "8px",
          fontSize: "12px",
          color: "var(--text-tertiary)",
          background: "none",
          border: "1px solid transparent",
          cursor: "pointer",
          fontFamily: "var(--font-body)",
          textAlign: "left",
          display: "flex",
          alignItems: "center",
          gap: "8px",
          transition: "background 0.13s ease, color 0.13s ease",
        }}
      >
        <svg width="13" height="13" viewBox="0 0 20 20" fill="currentColor" style={{ color: "var(--text-muted)", flexShrink: 0 }}>
          <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-3a1 1 0 00-.867.5 1 1 0 11-1.731-1A3 3 0 0113 8a3.001 3.001 0 01-2 2.83V11a1 1 0 11-2 0v-1a1 1 0 011-1 1 1 0 100-2zm0 8a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
        </svg>
        Support
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Contact support"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 10000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(0,0,0,0.55)",
            padding: "16px",
          }}
          onClick={handleClose}
        >
          <div
            style={{
              width: "100%",
              maxWidth: "400px",
              background: "var(--sidebar-bg, #0d1829)",
              border: "1px solid var(--card-border)",
              borderRadius: "14px",
              padding: "22px",
              display: "flex",
              flexDirection: "column",
              gap: "14px",
              fontFamily: "var(--font-body)",
              boxShadow: "0 16px 48px rgba(0,0,0,0.5)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
              <div>
                <div style={{ fontSize: "15px", fontWeight: 700, color: "var(--text-primary)" }}>Submit a ticket</div>
                <div style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "3px" }}>We&apos;ll look into it and get back to you</div>
              </div>
              <button type="button" onClick={handleClose} style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", padding: "2px", display: "flex", alignItems: "center" }}>
                <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
              </button>
            </div>

            {status === "success" ? (
              <div style={{ padding: "20px 0", textAlign: "center" }}>
                <div style={{ fontSize: "32px", marginBottom: "10px" }}>✓</div>
                <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-primary)", marginBottom: "4px" }}>Ticket submitted</div>
                <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>We&apos;ll review it shortly. Thanks for the report.</div>
                <button type="button" onClick={handleClose} style={{ marginTop: "14px", padding: "8px 20px", borderRadius: "8px", background: "var(--accent)", color: "#fff", border: "none", fontSize: "13px", fontWeight: 600, cursor: "pointer", fontFamily: "var(--font-body)" }}>Done</button>
              </div>
            ) : (
              <>
                <div>
                  <label style={{ fontSize: "10px", fontWeight: 600, textTransform: "uppercase" as const, letterSpacing: "0.07em", color: "var(--text-muted)", display: "block", marginBottom: "5px" }}>Area</label>
                  <select value={area} onChange={(e) => setArea(e.target.value)} style={inputBase}>
                    {AREAS.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
                  </select>
                </div>

                <div>
                  <label style={{ fontSize: "10px", fontWeight: 600, textTransform: "uppercase" as const, letterSpacing: "0.07em", color: "var(--text-muted)", display: "block", marginBottom: "5px" }}>Description</label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Describe what happened or what you need help with..."
                    rows={4}
                    style={{ ...inputBase, resize: "vertical", minHeight: "100px", lineHeight: 1.5 }}
                  />
                </div>

                {status === "error" && (
                  <div style={{ fontSize: "12px", color: "var(--red, #ef4444)", padding: "8px 10px", borderRadius: "6px", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)" }}>
                    Something went wrong. Please try again.
                  </div>
                )}

                <button
                  type="button"
                  disabled={isPending || !description.trim()}
                  onClick={handleSubmit}
                  style={{
                    width: "100%",
                    padding: "10px 0",
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
        </div>
      )}
    </>
  );
}
