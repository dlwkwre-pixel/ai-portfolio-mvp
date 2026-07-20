"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { publishPortfolio } from "./portfolio-actions";
import { toggleStrategyPublic } from "./social-actions";

// ─── Types ────────────────────────────────────────────────────────────────────

export type OwnStrategy = {
  id: string;
  name: string;
  style: string | null;
  risk_level: string | null;
  is_public: boolean;
};

export type OwnPortfolio = {
  id: string;
  name: string;
  cash_balance: number;
  account_type: string | null;
};

export type CommunityStats = {
  strategies_count: number;
  portfolios_count: number;
  total_copies: number;
};

type ShareStep = "picker" | "strategy" | "portfolio";
type ShareStatus = "idle" | "loading" | "error";

// ─── Share modal ──────────────────────────────────────────────────────────────

function ShareModal({
  ownStrategies,
  ownPortfolios,
  publishedPortfolioIds,
  onClose,
  onSuccess,
}: {
  ownStrategies: OwnStrategy[];
  ownPortfolios: OwnPortfolio[];
  publishedPortfolioIds: Set<string>;
  onClose: () => void;
  onSuccess: (message: string) => void;
}) {
  const [step, setStep] = useState<ShareStep>("picker");
  const [status, setStatus] = useState<ShareStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [selectedStratId, setSelectedStratId] = useState(ownStrategies[0]?.id ?? "");
  const [selectedPortId, setSelectedPortId] = useState(ownPortfolios[0]?.id ?? "");
  const [publicName, setPublicName] = useState(ownPortfolios[0]?.name ?? "");
  const [publicDesc, setPublicDesc] = useState("");

  const selectedStrat = ownStrategies.find((s) => s.id === selectedStratId);
  const selectedPort  = ownPortfolios.find((p) => p.id === selectedPortId);
  const portAlreadyPublished = publishedPortfolioIds.has(selectedPortId);

  useEffect(() => {
    if (selectedPort) setPublicName(selectedPort.name);
  }, [selectedPortId]); // eslint-disable-line react-hooks/exhaustive-deps

  function reset() { setStep("picker"); setStatus("idle"); setError(null); }

  async function handleShareStrategy() {
    if (!selectedStratId || selectedStrat?.is_public) return;
    setStatus("loading"); setError(null);
    try {
      await toggleStrategyPublic(selectedStratId, true);
      onSuccess("Strategy is now live in Community.");
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to share strategy.");
      setStatus("error");
    }
  }

  async function handleSharePortfolio() {
    if (!selectedPortId || !publicName.trim() || portAlreadyPublished) return;
    setStatus("loading"); setError(null);
    try {
      const fd = new FormData();
      fd.set("portfolio_id", selectedPortId);
      fd.set("public_name", publicName.trim());
      fd.set("public_description", publicDesc.trim());
      await publishPortfolio(fd);
      onSuccess("Portfolio is now live in Community.");
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to publish portfolio.");
      setStatus("error");
    }
  }

  const labelStyle: React.CSSProperties = {
    fontSize: "10px", fontWeight: 600, color: "var(--text-tertiary)",
    textTransform: "uppercase", letterSpacing: "0.07em",
    display: "block", marginBottom: "7px",
  };

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "9px 12px",
    background: "var(--card-bg)", border: "1px solid var(--card-border)",
    borderRadius: "var(--radius-md)",
    color: "var(--text-primary)", fontSize: "13px", fontFamily: "var(--font-body)",
    outline: "none", boxSizing: "border-box",
    transition: "border-color 150ms ease, box-shadow 150ms ease",
  };

  return (
    <>
      <div
        onClick={onClose}
        style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(0,0,0,0.65)", backdropFilter: "blur(3px)" }}
      />
      <div style={{
        position: "fixed", top: "50%", left: "50%",
        transform: "translate(-50%, -50%)", zIndex: 201,
        width: "min(480px, calc(100vw - 32px))",
        background: "var(--bg-elevated)",
        border: "1px solid var(--card-border)",
        borderRadius: "18px",
        boxShadow: "0 8px 40px rgba(0,0,0,0.7)",
        overflow: "hidden",
      }}>
        {/* Header */}
        <div style={{
          padding: "16px 20px 14px",
          borderBottom: "1px solid var(--border-subtle)",
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <div>
            <h2 style={{
              fontFamily: "var(--font-display)", fontSize: "15px", fontWeight: 600,
              color: "var(--text-primary)", letterSpacing: "-0.2px", marginBottom: "1px",
            }}>
              {step === "picker" ? "Share to Community" : step === "strategy" ? "Share a Strategy" : "Share a Portfolio"}
            </h2>
            {step !== "picker" && (
              <button
                type="button" onClick={reset}
                style={{
                  fontSize: "11px", color: "var(--text-muted)", background: "none", border: "none",
                  cursor: "pointer", padding: 0, fontFamily: "var(--font-body)",
                  display: "flex", alignItems: "center", gap: "3px", marginTop: "2px",
                }}
              >
                <svg width="10" height="10" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
                Back
              </button>
            )}
          </div>
          <button
            type="button" onClick={onClose}
            style={{
              width: "26px", height: "26px", display: "flex", alignItems: "center", justifyContent: "center",
              background: "none", border: "none", borderRadius: "var(--radius-md)",
              color: "var(--text-muted)", cursor: "pointer",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.05)"; e.currentTarget.style.color = "var(--text-secondary)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "none"; e.currentTarget.style.color = "var(--text-muted)"; }}
          >
            <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor">
              <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: "16px 20px 20px", display: "flex", flexDirection: "column", gap: "12px" }}>
          {step === "picker" && (
            <>
              <PickerCard
                icon={<svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor" style={{ color: "#7fd9d4" }}><path d="M15.98 1.804a1 1 0 00-1.96 0l-.24 1.192a1 1 0 01-.784.785l-1.192.238a1 1 0 000 1.962l1.192.238a1 1 0 01.785.785l.238 1.192a1 1 0 001.962 0l.238-1.192a1 1 0 01.785-.785l1.192-.238a1 1 0 000-1.962l-1.192-.238a1 1 0 01-.785-.785l-.238-1.192zM6.949 5.684a1 1 0 00-1.898 0l-.683 2.051a1 1 0 01-.633.633l-2.051.683a1 1 0 000 1.898l2.051.684a1 1 0 01.633.632l.683 2.051a1 1 0 001.898 0l.683-2.051a1 1 0 01.633-.633l2.051-.683a1 1 0 000-1.897l-2.051-.684a1 1 0 01-.633-.633L6.95 5.684z" /></svg>}
                iconBg="rgba(14,165,160,0.12)" iconBorder="rgba(14,165,160,0.2)"
                title="Share a Strategy"
                description={ownStrategies.length === 0 ? "No strategies yet. Create one on the Strategies page." : "Let others see your investing thesis and approach."}
                disabled={ownStrategies.length === 0}
                onClick={() => setStep("strategy")}
              />
              <PickerCard
                icon={<svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="#a78bfa" strokeWidth="1.5"><path d="M3 3h14v14H3V3z" /><path d="M3 7h14M7 3v14" /></svg>}
                iconBg="rgba(63,174,74,0.12)" iconBorder="rgba(63,174,74,0.2)"
                title="Share a Portfolio"
                description={ownPortfolios.length === 0 ? "No portfolios yet. Add one to share it." : "Allocation percentages only. Dollar amounts stay private."}
                disabled={ownPortfolios.length === 0}
                onClick={() => setStep("portfolio")}
              />
            </>
          )}

          {step === "strategy" && (
            <>
              <div>
                <label style={labelStyle}>Select a strategy</label>
                <select value={selectedStratId} onChange={(e) => setSelectedStratId(e.target.value)} style={inputStyle}
                  onFocus={(e) => { e.target.style.borderColor = "var(--brand-blue)"; }}
                  onBlur={(e) => { e.target.style.borderColor = "var(--card-border)"; }}
                >
                  {ownStrategies.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}{s.is_public ? " (already shared)" : ""}</option>
                  ))}
                </select>
              </div>
              {selectedStrat?.is_public ? (
                <AlreadySharedNotice text="This strategy is already public. To unpublish it, use the toggle on your Strategies page." />
              ) : (
                <>
                  {error && <p style={{ fontSize: "12px", color: "var(--red)" }}>{error}</p>}
                  <SubmitButton onClick={handleShareStrategy} loading={status === "loading"} disabled={!selectedStratId} label="Share Strategy" />
                </>
              )}
            </>
          )}

          {step === "portfolio" && (
            <>
              <div>
                <label style={labelStyle}>Select a portfolio</label>
                <select value={selectedPortId} onChange={(e) => setSelectedPortId(e.target.value)} style={inputStyle}
                  onFocus={(e) => { e.target.style.borderColor = "var(--brand-blue)"; }}
                  onBlur={(e) => { e.target.style.borderColor = "var(--card-border)"; }}
                >
                  {ownPortfolios.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}{publishedPortfolioIds.has(p.id) ? " (already shared)" : ""}</option>
                  ))}
                </select>
              </div>
              {portAlreadyPublished ? (
                <AlreadySharedNotice text="This portfolio is already live. To update or unpublish, manage it from your Portfolio page." />
              ) : (
                <>
                  <div>
                    <label style={labelStyle}>Public title</label>
                    <input type="text" value={publicName} onChange={(e) => setPublicName(e.target.value)} maxLength={100}
                      placeholder="Give your portfolio a public name..." style={inputStyle}
                      onFocus={(e) => { e.target.style.borderColor = "var(--brand-blue)"; e.target.style.boxShadow = "0 0 0 3px rgba(14,165,160,0.1)"; }}
                      onBlur={(e) => { e.target.style.borderColor = "var(--card-border)"; e.target.style.boxShadow = "none"; }}
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>Description <span style={{ textTransform: "none", fontWeight: 400, color: "var(--text-muted)" }}>(optional)</span></label>
                    <textarea value={publicDesc} onChange={(e) => setPublicDesc(e.target.value)} maxLength={500} rows={3}
                      placeholder="Describe your allocation approach..." style={{ ...inputStyle, resize: "none", lineHeight: 1.55 }}
                      onFocus={(e) => { e.target.style.borderColor = "var(--brand-blue)"; e.target.style.boxShadow = "0 0 0 3px rgba(14,165,160,0.1)"; }}
                      onBlur={(e) => { e.target.style.borderColor = "var(--card-border)"; e.target.style.boxShadow = "none"; }}
                    />
                  </div>
                  <div style={{ padding: "10px 13px", background: "var(--surface-002)", border: "1px solid var(--line-006)", borderRadius: "var(--radius-md)", display: "flex", gap: "9px", alignItems: "flex-start" }}>
                    <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor" style={{ color: "var(--text-muted)", flexShrink: 0, marginTop: "1px" }}>
                      <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                    </svg>
                    <p style={{ fontSize: "11px", color: "var(--text-muted)", lineHeight: 1.55, margin: 0 }}>
                      <strong style={{ color: "var(--text-tertiary)", fontWeight: 600 }}>% only.</strong>{" "}
                      Only percentage weights are shared. Counts, cost basis, dollar values, and account balance are never visible.
                    </p>
                  </div>
                  {error && <p style={{ fontSize: "12px", color: "var(--red)", margin: 0 }}>{error}</p>}
                  <SubmitButton onClick={handleSharePortfolio} loading={status === "loading"} disabled={!publicName.trim()} label="Share Portfolio" />
                </>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}

function PickerCard({ icon, iconBg, iconBorder, title, description, disabled, onClick }: {
  icon: React.ReactNode; iconBg: string; iconBorder: string;
  title: string; description: string; disabled: boolean; onClick: () => void;
}) {
  return (
    <button type="button" onClick={onClick} disabled={disabled}
      style={{
        display: "flex", alignItems: "flex-start", gap: "14px", padding: "14px 16px",
        background: "var(--card-bg)", border: "1px solid var(--card-border)", borderRadius: "var(--radius-lg)",
        cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.45 : 1,
        textAlign: "left", fontFamily: "var(--font-body)", width: "100%",
        transition: "border-color 150ms ease, background 150ms ease",
      }}
      onMouseEnter={(e) => { if (!disabled) { e.currentTarget.style.borderColor = "rgba(14,165,160,0.3)"; e.currentTarget.style.background = "var(--card-hover)"; } }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--card-border)"; e.currentTarget.style.background = "var(--card-bg)"; }}
    >
      <div style={{ width: "36px", height: "36px", minWidth: "36px", borderRadius: "var(--radius-md)", background: iconBg, border: `1px solid ${iconBorder}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
        {icon}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)", marginBottom: "3px" }}>{title}</p>
        <p style={{ fontSize: "12px", color: "var(--text-tertiary)", lineHeight: 1.5 }}>{description}</p>
      </div>
      <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor" style={{ color: "var(--text-muted)", flexShrink: 0, marginTop: "3px" }}>
        <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
      </svg>
    </button>
  );
}

function AlreadySharedNotice({ text }: { text: string }) {
  return (
    <div style={{ padding: "11px 14px", background: "rgba(0,211,149,0.05)", border: "1px solid rgba(0,211,149,0.15)", borderRadius: "var(--radius-md)" }}>
      <p style={{ fontSize: "12px", fontWeight: 600, color: "var(--green)", marginBottom: "3px" }}>Already live in Community</p>
      <p style={{ fontSize: "11px", color: "var(--text-tertiary)", lineHeight: 1.5 }}>{text}</p>
    </div>
  );
}

function SubmitButton({ onClick, loading, disabled, label }: { onClick: () => void; loading: boolean; disabled: boolean; label: string }) {
  return (
    <button type="button" onClick={onClick} disabled={loading || disabled}
      style={{
        width: "100%", padding: "10px 16px",
        background: loading || disabled ? "rgba(14,165,160,0.25)" : "var(--brand-gradient)",
        border: "none", borderRadius: "var(--radius-md)",
        color: loading || disabled ? "rgba(255,255,255,0.5)" : "#fff",
        fontSize: "13px", fontWeight: 600, cursor: loading || disabled ? "not-allowed" : "pointer",
        fontFamily: "var(--font-body)", transition: "opacity 150ms ease",
      }}
      onPointerDown={(e) => { if (!loading && !disabled) e.currentTarget.style.opacity = "0.85"; }}
      onPointerUp={(e) => { e.currentTarget.style.opacity = "1"; }}
      onPointerCancel={(e) => { e.currentTarget.style.opacity = "1"; }}
    >
      {loading ? "Publishing..." : label}
    </button>
  );
}

// ─── Stat chip ────────────────────────────────────────────────────────────────

function StatChip({ icon, value, label }: { icon: React.ReactNode; value: number; label: string }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: "6px",
      padding: "4px 11px",
      background: "var(--surface-004)",
      border: "1px solid var(--line-007)",
      borderRadius: "var(--radius-full)",
    }}>
      <span style={{ color: "var(--text-tertiary)", display: "flex", alignItems: "center" }}>{icon}</span>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: "12px", fontWeight: 500, color: "var(--text-secondary)", letterSpacing: "-0.03em" }}>
        {value.toLocaleString()}
      </span>
      <span style={{ fontSize: "11px", color: "var(--text-tertiary)" }}>{label}</span>
    </div>
  );
}

// ─── CommunityHeader ──────────────────────────────────────────────────────────

export default function CommunityHeader({
  stats, ownStrategies, ownPortfolios, publishedPortfolioIds,
}: {
  stats: CommunityStats;
  ownStrategies: OwnStrategy[];
  ownPortfolios: OwnPortfolio[];
  publishedPortfolioIds: Set<string>;
}) {
  const [shareOpen, setShareOpen] = useState(false);
  const [toast, setToast] = useState<{ message: string } | null>(null);
  const router = useRouter();

  function handleShareSuccess(message: string) {
    setToast({ message });
    router.refresh();
    setTimeout(() => setToast(null), 4500);
  }

  return (
    <>
      {/* Hero header */}
      <div style={{
        position: "relative", overflow: "hidden",
        padding: "16px 24px 14px",
        borderBottom: "1px solid var(--border-subtle)",
        background: "var(--bg-base)",
      }}>
        {/* Subtle glow */}
        <div style={{
          position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
          background: "radial-gradient(ellipse at 20% -30%, rgba(14,165,160,0.09) 0%, transparent 60%)",
          pointerEvents: "none",
        }} />

        <div style={{ position: "relative", display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "16px" }}>
          <div style={{ minWidth: 0 }}>
            <h1 style={{
              fontFamily: "var(--font-display)", fontSize: "17px", fontWeight: 600,
              color: "var(--text-primary)", letterSpacing: "-0.3px", marginBottom: "2px",
            }}>
              Community
            </h1>
            <p style={{ fontSize: "12px", color: "var(--text-tertiary)", marginBottom: "12px", lineHeight: 1.4 }}>
              Copy strategies and follow portfolios from BuyTune investors.
            </p>
            {/* Stat chips */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: "7px" }}>
              <StatChip
                icon={<svg width="11" height="11" viewBox="0 0 20 20" fill="currentColor"><path d="M15.98 1.804a1 1 0 00-1.96 0l-.24 1.192a1 1 0 01-.784.785l-1.192.238a1 1 0 000 1.962l1.192.238a1 1 0 01.785.785l.238 1.192a1 1 0 001.962 0l.238-1.192a1 1 0 01.785-.785l1.192-.238a1 1 0 000-1.962l-1.192-.238a1 1 0 01-.785-.785l-.238-1.192zM6.949 5.684a1 1 0 00-1.898 0l-.683 2.051a1 1 0 01-.633.633l-2.051.683a1 1 0 000 1.898l2.051.684a1 1 0 01.633.632l.683 2.051a1 1 0 001.898 0l.683-2.051a1 1 0 01.633-.633l2.051-.683a1 1 0 000-1.897l-2.051-.684a1 1 0 01-.633-.633L6.95 5.684z" /></svg>}
                value={stats.strategies_count}
                label="strategies"
              />
              <StatChip
                icon={<svg width="11" height="11" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 3h14v14H3V3z" /><path d="M3 7h14M7 3v14" /></svg>}
                value={stats.portfolios_count}
                label="portfolios"
              />
              {stats.total_copies > 0 && (
                <StatChip
                  icon={<svg width="11" height="11" viewBox="0 0 20 20" fill="currentColor"><path d="M7 9a2 2 0 012-2h6a2 2 0 012 2v6a2 2 0 01-2 2H9a2 2 0 01-2-2V9z" /><path d="M5 3a2 2 0 00-2 2v6a2 2 0 002 2V5h8a2 2 0 00-2-2H5z" /></svg>}
                  value={stats.total_copies}
                  label="copies made"
                />
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={() => setShareOpen(true)}
            style={{
              display: "flex", alignItems: "center", gap: "6px",
              padding: "7px 16px",
              background: "var(--brand-gradient)",
              border: "none", borderRadius: "var(--radius-md)",
              color: "#fff", fontSize: "12px", fontWeight: 600,
              fontFamily: "var(--font-body)", cursor: "pointer", flexShrink: 0,
              boxShadow: "0 2px 10px rgba(14,165,160,0.28)",
              transition: "box-shadow 150ms ease, transform 150ms ease",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.boxShadow = "0 4px 18px rgba(14,165,160,0.45)"; e.currentTarget.style.transform = "translateY(-1px)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.boxShadow = "0 2px 10px rgba(14,165,160,0.28)"; e.currentTarget.style.transform = ""; }}
            onPointerDown={(e) => { e.currentTarget.style.transform = "scale(0.97)"; }}
            onPointerUp={(e) => { e.currentTarget.style.transform = ""; }}
            onPointerCancel={(e) => { e.currentTarget.style.transform = ""; }}
          >
            <svg width="11" height="11" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M10 3v14M3 10l7-7 7 7" />
            </svg>
            Share
          </button>
        </div>
      </div>

      {/* Success toast */}
      {toast && (
        <div style={{
          position: "fixed", bottom: "24px", right: "24px", zIndex: 300,
          background: "var(--bg-elevated)", border: "1px solid rgba(0,211,149,0.2)",
          borderRadius: "var(--radius-md)", padding: "11px 16px",
          display: "flex", alignItems: "center", gap: "10px",
          boxShadow: "0 4px 20px rgba(0,0,0,0.55)", maxWidth: "280px",
        }}>
          <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor" style={{ color: "var(--green)", flexShrink: 0 }}>
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
          </svg>
          <span style={{ fontSize: "12px", color: "var(--text-secondary)" }}>{toast.message}</span>
        </div>
      )}

      {shareOpen && (
        <ShareModal
          ownStrategies={ownStrategies}
          ownPortfolios={ownPortfolios}
          publishedPortfolioIds={publishedPortfolioIds}
          onClose={() => setShareOpen(false)}
          onSuccess={handleShareSuccess}
        />
      )}
    </>
  );
}
