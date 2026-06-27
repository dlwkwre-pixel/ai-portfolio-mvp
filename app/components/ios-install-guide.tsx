"use client";

import { useState, useEffect, useCallback } from "react";

// "Add BuyTune to your Home Screen" guide for iOS Safari (PWAs can't be installed via a
// beforeinstallprompt event on iOS — the user must use Share → Add to Home Screen).
// Two surfaces:
//   1. A one-time, dismissible bottom nudge shown only to eligible iOS Safari visitors.
//   2. An illustrated step modal, openable anytime (Learn-tab replay) via the
//      `bt-open-ios-install` window event — works on any device for preview.

const DISMISS_KEY = "bt-ios-install-dismissed";

// ── iOS glyphs ──────────────────────────────────────────────────────────────
function ShareGlyph({ size = 22, color = "#2563eb" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 15V3" />
      <path d="M8 7l4-4 4 4" />
      <path d="M5 12v7a1 1 0 001 1h12a1 1 0 001-1v-7" />
    </svg>
  );
}
function AddBoxGlyph({ size = 22, color = "#2563eb" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="4" />
      <path d="M12 8v8M8 12h8" />
    </svg>
  );
}

type StepDef = {
  title: string;
  body: string;
  art: React.ReactNode;
};

const STEPS: StepDef[] = [
  {
    title: "Tap the Share button",
    body: "In Safari, tap the Share icon in the toolbar — at the bottom on iPhone, at the top on iPad.",
    art: (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "10px" }}>
        <div style={{ width: "52px", height: "52px", borderRadius: "14px", background: "rgba(37,99,235,0.12)", border: "1px solid rgba(37,99,235,0.28)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <ShareGlyph size={26} />
        </div>
      </div>
    ),
  },
  {
    title: "Choose “Add to Home Screen”",
    body: "Scroll down the share sheet and tap Add to Home Screen.",
    art: (
      <div style={{ width: "100%", maxWidth: "260px", margin: "0 auto", borderRadius: "12px", border: "1px solid var(--border-subtle, rgba(255,255,255,0.12))", overflow: "hidden", background: "var(--bg-elevated, rgba(255,255,255,0.03))" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px", padding: "12px 14px" }}>
          <span style={{ fontSize: "13px", color: "var(--text-primary)", fontWeight: 500 }}>Add to Home Screen</span>
          <AddBoxGlyph size={20} />
        </div>
      </div>
    ),
  },
  {
    title: "Tap “Add”",
    body: "Confirm with Add in the top corner. BuyTune now lives on your Home Screen and opens full-screen, like a native app.",
    art: (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "10px" }}>
        <div style={{ width: "58px", height: "58px", borderRadius: "14px", background: "linear-gradient(135deg, #2563eb 0%, #7c3aed 100%)", display: "flex", alignItems: "flex-end", justifyContent: "center", gap: "4px", paddingBottom: "11px", boxShadow: "0 8px 20px rgba(37,99,235,0.35)" }}>
          {[14, 22, 30, 38].map((h, i) => (
            <div key={i} style={{ width: "6px", height: `${h}%`, minHeight: `${h * 0.42}px`, background: "#fff", borderTopLeftRadius: "2px", borderTopRightRadius: "2px" }} />
          ))}
        </div>
        <span style={{ fontSize: "11px", color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>BuyTune</span>
      </div>
    ),
  },
];

export default function IosInstallGuide() {
  const [mounted, setMounted] = useState(false);
  const [eligible, setEligible] = useState(false); // iOS Safari, not already installed
  const [showNudge, setShowNudge] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [step, setStep] = useState(0);

  const openModal = useCallback(() => {
    setStep(0);
    setModalOpen(true);
    setShowNudge(false);
  }, []);

  useEffect(() => {
    setMounted(true);

    // Eligibility: iPhone/iPad on Safari, not already running standalone.
    let isEligible = false;
    try {
      const ua = window.navigator.userAgent;
      const isIOS = /iPad|iPhone|iPod/.test(ua) ||
        (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1); // iPadOS reports as Mac
      const isSafari = /safari/i.test(ua) && !/crios|fxios|edgios|chrome|android/i.test(ua);
      const nav = window.navigator as Navigator & { standalone?: boolean };
      const standalone = nav.standalone === true ||
        window.matchMedia("(display-mode: standalone)").matches;
      isEligible = isIOS && isSafari && !standalone;
    } catch { /* ignore */ }
    setEligible(isEligible);

    // One-time nudge for eligible users who haven't dismissed it.
    if (isEligible) {
      let dismissed = false;
      try { dismissed = localStorage.getItem(DISMISS_KEY) === "1"; } catch { /* ignore */ }
      if (!dismissed) {
        const t = setTimeout(() => setShowNudge(true), 2500); // let the page settle first
        return () => clearTimeout(t);
      }
    }
  }, []);

  // Open on demand from the Learn-tab card (any device).
  useEffect(() => {
    const handler = () => openModal();
    window.addEventListener("bt-open-ios-install", handler);
    return () => window.removeEventListener("bt-open-ios-install", handler);
  }, [openModal]);

  const dismissNudge = useCallback(() => {
    try { localStorage.setItem(DISMISS_KEY, "1"); } catch { /* ignore */ }
    setShowNudge(false);
  }, []);

  if (!mounted) return null;

  const last = step >= STEPS.length - 1;
  const s = STEPS[step];

  return (
    <>
      {/* One-time bottom nudge (eligible iOS Safari only) */}
      {eligible && showNudge && !modalOpen && (
        <div
          style={{
            position: "fixed", left: "12px", right: "12px",
            bottom: "calc(env(safe-area-inset-bottom, 0px) + 80px)",
            zIndex: 1200, maxWidth: "440px", margin: "0 auto",
            background: "var(--card-bg, #0b1524)", border: "1px solid var(--card-border, rgba(255,255,255,0.12))",
            borderRadius: "16px", padding: "14px 14px 13px", boxShadow: "0 18px 44px rgba(0,0,0,0.5)",
            display: "flex", alignItems: "center", gap: "13px",
            animation: "bt-ios-rise 0.35s cubic-bezier(0.16,1,0.3,1) both",
          }}
        >
          <style>{`@keyframes bt-ios-rise { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }`}</style>
          <div style={{ flexShrink: 0, width: "40px", height: "40px", borderRadius: "11px", background: "linear-gradient(135deg, #2563eb 0%, #7c3aed 100%)", display: "flex", alignItems: "flex-end", justifyContent: "center", gap: "3px", paddingBottom: "8px" }}>
            {[10, 15, 20, 25].map((h, i) => (
              <div key={i} style={{ width: "4px", height: `${h}px`, background: "#fff", borderTopLeftRadius: "1.5px", borderTopRightRadius: "1.5px" }} />
            ))}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)", letterSpacing: "-0.1px" }}>Install BuyTune</div>
            <div style={{ fontSize: "11.5px", color: "var(--text-tertiary)", marginTop: "1px" }}>Add it to your Home Screen for a full-screen app.</div>
          </div>
          <button type="button" onClick={openModal} style={{ flexShrink: 0, padding: "8px 13px", borderRadius: "10px", border: "none", background: "linear-gradient(135deg,#2563eb,#4f46e5)", color: "#fff", fontSize: "12px", fontWeight: 700, cursor: "pointer", fontFamily: "var(--font-body)" }}>
            Show me
          </button>
          <button type="button" onClick={dismissNudge} aria-label="Dismiss" style={{ flexShrink: 0, background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: "18px", lineHeight: 1, padding: "2px 4px" }}>
            &times;
          </button>
        </div>
      )}

      {/* Illustrated step modal */}
      {modalOpen && (
        <div onClick={() => setModalOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 1300, background: "rgba(4,13,26,0.78)", backdropFilter: "blur(6px)", display: "flex", alignItems: "center", justifyContent: "center", padding: "20px", animation: "bt-ios-fade 0.25s ease both" }}>
          <style>{`@keyframes bt-ios-fade { from { opacity: 0; } to { opacity: 1; } } @keyframes bt-ios-pop { from { opacity: 0; transform: translateY(8px) scale(0.98); } to { opacity: 1; transform: none; } }`}</style>
          <div onClick={(e) => e.stopPropagation()} style={{ background: "var(--card-bg, #0b1524)", border: "1px solid var(--card-border, rgba(255,255,255,0.1))", borderRadius: "var(--radius-lg, 16px)", padding: "24px 24px 20px", width: "100%", maxWidth: "420px", boxShadow: "0 28px 60px rgba(0,0,0,0.6)", animation: "bt-ios-pop 0.3s cubic-bezier(0.16,1,0.3,1) both" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "18px" }}>
              <div style={{ width: "34px", height: "34px", borderRadius: "9px", background: "linear-gradient(135deg, rgba(37,99,235,0.18), rgba(124,58,237,0.14))", border: "1px solid rgba(99,102,241,0.25)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "17px" }}>📲</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: "10px", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-tertiary)" }}>Add to Home Screen</div>
                <div style={{ fontSize: "10px", color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>{step + 1} of {STEPS.length}</div>
              </div>
              <button type="button" onClick={() => setModalOpen(false)} style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: "12px", fontFamily: "var(--font-body)" }}>Close</button>
            </div>

            {/* Illustration */}
            <div style={{ minHeight: "92px", display: "flex", alignItems: "center", justifyContent: "center", padding: "8px 0 18px" }}>
              <div key={`art-${step}`} style={{ width: "100%", animation: "bt-ios-pop 0.3s ease both" }}>{s.art}</div>
            </div>

            <h2 key={`t-${step}`} style={{ fontFamily: "var(--font-display)", fontSize: "18px", fontWeight: 700, color: "var(--text-primary)", margin: "0 0 8px", textAlign: "center", animation: "bt-ios-pop 0.3s ease both" }}>{s.title}</h2>
            <p key={`b-${step}`} style={{ fontSize: "13px", color: "var(--text-secondary)", lineHeight: 1.6, margin: "0 0 20px", textAlign: "center", animation: "bt-ios-pop 0.3s ease both" }}>{s.body}</p>

            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "6px", marginBottom: "18px" }}>
              {STEPS.map((_, i) => (
                <div key={i} style={{ height: "5px", flex: i === step ? "0 0 22px" : "0 0 5px", borderRadius: "3px", background: i === step ? "var(--brand-blue, #2563eb)" : i < step ? "rgba(37,99,235,0.4)" : "var(--border, rgba(255,255,255,0.12))", transition: "all 0.25s ease" }} />
              ))}
            </div>

            <div style={{ display: "flex", gap: "8px" }}>
              {step > 0 && (
                <button type="button" onClick={() => setStep((p) => p - 1)} style={{ padding: "10px 16px", borderRadius: "var(--radius-md, 10px)", border: "1px solid var(--border-subtle, rgba(255,255,255,0.1))", background: "transparent", color: "var(--text-secondary)", fontSize: "13px", cursor: "pointer", fontFamily: "var(--font-body)" }}>Back</button>
              )}
              <button type="button" onClick={() => (last ? setModalOpen(false) : setStep((p) => p + 1))} style={{ flex: 1, padding: "10px 16px", borderRadius: "var(--radius-md, 10px)", border: "none", background: "linear-gradient(135deg,#2563eb,#4f46e5)", color: "#fff", fontSize: "13px", fontWeight: 700, cursor: "pointer", fontFamily: "var(--font-body)" }}>
                {last ? "Done" : "Next"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
