"use client";

import { useState, useEffect, useRef, useTransition, useCallback } from "react";
import type { DiffItem, DiffResult, ParseResult } from "@/lib/portfolio-audit/parsers/types";
import { parseRobinhoodCsv } from "@/lib/portfolio-audit/parsers/robinhood";
import { parsePastedHoldings } from "@/lib/portfolio-audit/parsers/paste";
import { computeDiff, countMeaningfulChanges } from "@/lib/portfolio-audit/diff";
import { applyPortfolioAudit } from "./audit-actions";

type Step = "import" | "review" | "success";
type Method = "csv" | "paste";

type CurrentHolding = {
  ticker: string;
  shares: number;
  company_name: string | null;
};

interface Props {
  portfolioId: string;
  currentHoldings: CurrentHolding[];
}

function fmt(n: number | null, digits = 4): string {
  if (n === null) return "—";
  return n.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  });
}

function DiffRow({
  item,
  selected,
  onToggle,
}: {
  item: DiffItem;
  selected: boolean;
  onToggle: () => void;
}) {
  const isAdd = item.action === "add";
  const isRemove = item.action === "remove";
  const isChange = item.action === "change";

  const dotColor = isAdd ? "var(--green)" : isRemove ? "var(--red)" : "var(--amber)";
  const deltaColor = item.delta > 0 ? "var(--green)" : "var(--red)";
  const deltaPrefix = item.delta > 0 ? "+" : "";

  return (
    <div
      onClick={onToggle}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "10px",
        padding: "8px 12px",
        borderRadius: "var(--radius-md)",
        background: selected ? "var(--card-hover)" : "transparent",
        border: `1px solid ${selected ? "var(--border)" : "transparent"}`,
        cursor: "pointer",
        transition: "background 0.12s ease, border-color 0.12s ease",
        userSelect: "none",
      }}
    >
      {/* Color dot */}
      <div
        style={{
          width: "6px",
          height: "6px",
          borderRadius: "50%",
          background: dotColor,
          flexShrink: 0,
          opacity: selected ? 1 : 0.35,
        }}
      />

      {/* Ticker chip */}
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "11px",
          fontWeight: 500,
          background: "var(--bg-overlay)",
          border: "1px solid var(--border-subtle)",
          borderRadius: "var(--radius-sm)",
          padding: "2px 7px",
          color: selected ? "var(--text-primary)" : "var(--text-tertiary)",
          flexShrink: 0,
          minWidth: "52px",
          textAlign: "center",
        }}
      >
        {item.ticker}
      </span>

      {/* Shares from → to */}
      <div
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          gap: "6px",
          fontSize: "12px",
          fontFamily: "var(--font-mono)",
          overflow: "hidden",
        }}
      >
        {isAdd ? (
          <span style={{ color: "var(--text-muted)", fontStyle: "italic", fontFamily: "var(--font-body)" }}>
            not in BuyTune
          </span>
        ) : (
          <span style={{ color: "var(--text-tertiary)" }}>{fmt(item.currentShares)}</span>
        )}

        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ flexShrink: 0, color: "var(--text-muted)" }}>
          <path d="M2 6h8M7 3l3 3-3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>

        {isRemove ? (
          <span style={{ color: "var(--text-muted)", fontStyle: "italic", fontFamily: "var(--font-body)" }}>
            not in import
          </span>
        ) : (
          <span style={{ color: "var(--text-primary)" }}>{fmt(item.importedShares)}</span>
        )}
      </div>

      {/* Delta */}
      {isChange && (
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "11px",
            fontWeight: 500,
            color: selected ? deltaColor : "var(--text-muted)",
            flexShrink: 0,
          }}
        >
          {deltaPrefix}{fmt(item.delta)}
        </span>
      )}
      {isAdd && (
        <span style={{ fontFamily: "var(--font-mono)", fontSize: "11px", color: selected ? "var(--green)" : "var(--text-muted)", flexShrink: 0 }}>
          +{fmt(item.importedShares)}
        </span>
      )}
      {isRemove && (
        <span style={{ fontFamily: "var(--font-mono)", fontSize: "11px", color: selected ? "var(--red)" : "var(--text-muted)", flexShrink: 0 }}>
          {fmt(item.delta)}
        </span>
      )}

      {/* Checkbox */}
      <div
        style={{
          width: "16px",
          height: "16px",
          borderRadius: "4px",
          border: `1.5px solid ${selected ? "var(--brand-blue)" : "var(--border)"}`,
          background: selected ? "var(--brand-blue)" : "transparent",
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          transition: "background 0.12s ease, border-color 0.12s ease",
        }}
      >
        {selected && (
          <svg width="9" height="7" viewBox="0 0 9 7" fill="none">
            <path d="M1 3.5L3.5 6L8 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </div>
    </div>
  );
}

function SectionHeader({ label, count, color }: { label: string; count: number; color: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "4px 0 6px" }}>
      <span
        style={{
          fontSize: "9px",
          fontWeight: 600,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color,
          fontFamily: "var(--font-body)",
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontSize: "10px",
          fontFamily: "var(--font-mono)",
          color: "var(--text-muted)",
          background: "var(--bg-overlay)",
          border: "1px solid var(--border-subtle)",
          borderRadius: "var(--radius-full)",
          padding: "1px 7px",
        }}
      >
        {count}
      </span>
    </div>
  );
}

export default function AuditPortfolioModal({ portfolioId, currentHoldings }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [step, setStep] = useState<Step>("import");
  const [method, setMethod] = useState<Method>("csv");

  // Import step state
  const [pasteText, setPasteText] = useState("");
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);

  // Review step state
  const [diff, setDiff] = useState<DiffResult | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Apply state
  const [isPending, startTransition] = useTransition();
  const [applyError, setApplyError] = useState<string | null>(null);
  const [appliedCount, setAppliedCount] = useState(0);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const pasteDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function resetAndClose() {
    setIsOpen(false);
    setTimeout(() => {
      setStep("import");
      setMethod("csv");
      setPasteText("");
      setParseResult(null);
      setParseError(null);
      setDiff(null);
      setSelected(new Set());
      setApplyError(null);
      setFileName(null);
      setAppliedCount(0);
    }, 200);
  }

  // Lock body scroll when open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [isOpen]);

  // Escape to close
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isPending) resetAndClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [isOpen, isPending]);

  // Debounced paste parse
  useEffect(() => {
    if (method !== "paste") return;
    if (pasteDebounceRef.current) clearTimeout(pasteDebounceRef.current);
    pasteDebounceRef.current = setTimeout(() => {
      if (!pasteText.trim()) {
        setParseResult(null);
        setParseError(null);
        return;
      }
      const result = parsePastedHoldings(pasteText);
      applyParseResult(result);
    }, 300);
    return () => { if (pasteDebounceRef.current) clearTimeout(pasteDebounceRef.current); };
  }, [pasteText, method]);

  function applyParseResult(result: ParseResult) {
    if (result.errors.length > 0) {
      setParseError(result.errors[0]);
      setParseResult(null);
    } else if (result.holdings.length === 0) {
      setParseError("No valid holdings found.");
      setParseResult(null);
    } else {
      setParseError(null);
      setParseResult(result);
    }
  }

  async function handleFile(file: File) {
    if (!file.name.toLowerCase().endsWith(".csv")) {
      setParseError("Please upload a .csv file.");
      return;
    }
    setFileName(file.name);
    setParseResult(null);
    setParseError(null);
    const text = await file.text();
    applyParseResult(parseRobinhoodCsv(text));
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  function handleContinue() {
    if (!parseResult) return;
    const diffResult = computeDiff(currentHoldings, parseResult.holdings);
    setDiff(diffResult);
    const initial = new Set<string>();
    for (const item of [...diffResult.added, ...diffResult.changed, ...diffResult.removed]) {
      initial.add(`${item.action}:${item.ticker}`);
    }
    setSelected(initial);
    setStep("review");
  }

  const toggleChange = useCallback((key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  function handleApply() {
    if (!diff || !parseResult) return;
    setApplyError(null);

    const allChanges = [...diff.added, ...diff.changed, ...diff.removed];
    const changesToApply = allChanges
      .filter((item) => selected.has(`${item.action}:${item.ticker}`))
      .map((item) => ({
        ticker: item.ticker,
        action: item.action as "add" | "remove" | "change",
        importedShares: item.importedShares ?? 0,
      }));

    if (!changesToApply.length) return;

    startTransition(async () => {
      const result = await applyPortfolioAudit({
        portfolioId,
        sourceType: method === "csv" ? "robinhood_csv" : "manual_paste",
        importedHoldings: parseResult.holdings,
        changesToApply,
      });
      if (result.success) {
        setAppliedCount(result.changesApplied);
        setStep("success");
      } else {
        setApplyError(result.error ?? "Failed to apply changes. Your holdings are unchanged.");
      }
    });
  }

  const selectedCount = selected.size;
  const meaningfulChanges = diff ? countMeaningfulChanges(diff) : 0;
  const importedCount = parseResult?.holdings.length ?? 0;
  const ignoredCount = diff?.ignored.length ?? 0;

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "5px",
          padding: "5px 11px",
          fontSize: "12px",
          fontFamily: "var(--font-body)",
          fontWeight: 500,
          color: "var(--text-secondary)",
          background: "var(--card-bg)",
          border: "1px solid var(--card-border)",
          borderRadius: "var(--radius-md)",
          cursor: "pointer",
          transition: "color 0.15s ease, background 0.15s ease, border-color 0.15s ease",
          whiteSpace: "nowrap",
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLButtonElement).style.color = "var(--text-primary)";
          (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--border-strong)";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLButtonElement).style.color = "var(--text-secondary)";
          (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--card-border)";
        }}
      >
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
          <path d="M2 5h12M5 2v3M11 2v3M4 8h2M7 8h2M10 8h2M4 11h2M7 11h2M10 11h2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <rect x="1.5" y="4" width="13" height="10.5" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
        </svg>
        Audit
      </button>
    );
  }

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={() => { if (!isPending) resetAndClose(); }}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.72)",
          backdropFilter: "blur(4px)",
          zIndex: 200,
          animation: "bt-fade-in 0.18s ease both",
        }}
      />

      {/* Modal card */}
      <div
        style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          width: "min(560px, calc(100vw - 24px))",
          maxHeight: "calc(100vh - 48px)",
          background: "var(--bg-elevated)",
          border: "1px solid var(--border-strong)",
          borderRadius: "var(--radius-xl)",
          boxShadow: "var(--shadow-lg)",
          zIndex: 201,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          animation: "bt-scale-in 0.22s ease both",
        }}
      >
        {/* ── STEP 1: IMPORT ──────────────────────────────────────────────── */}
        {step === "import" && (
          <>
            <ModalHeader
              title="Audit Portfolio"
              subtitle="Import holdings to detect drift"
              step="1 of 3"
              onClose={resetAndClose}
            />

            <div style={{ flex: 1, overflowY: "auto", padding: "20px" }}>
              {/* Method tabs */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "6px",
                  marginBottom: "16px",
                  background: "var(--bg-overlay)",
                  border: "1px solid var(--border-subtle)",
                  borderRadius: "var(--radius-md)",
                  padding: "4px",
                }}
              >
                {(["csv", "paste"] as Method[]).map((m) => (
                  <button
                    key={m}
                    onClick={() => {
                      setMethod(m);
                      setParseResult(null);
                      setParseError(null);
                      setFileName(null);
                    }}
                    style={{
                      padding: "8px 12px",
                      fontSize: "12px",
                      fontFamily: "var(--font-body)",
                      fontWeight: method === m ? 600 : 400,
                      color: method === m ? "var(--text-primary)" : "var(--text-tertiary)",
                      background: method === m ? "var(--bg-elevated)" : "transparent",
                      border: method === m ? "1px solid var(--border)" : "1px solid transparent",
                      borderRadius: "var(--radius-sm)",
                      cursor: "pointer",
                      transition: "all 0.12s ease",
                      textAlign: "center",
                    }}
                  >
                    {m === "csv" ? "Upload Brokerage CSV" : "Paste Holdings"}
                  </button>
                ))}
              </div>

              {/* CSV upload */}
              {method === "csv" && (
                <div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv"
                    style={{ display: "none" }}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleFile(file);
                      e.target.value = "";
                    }}
                  />
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                    onDragLeave={() => setIsDragging(false)}
                    onDrop={handleDrop}
                    style={{
                      border: `1.5px dashed ${isDragging ? "var(--brand-blue)" : parseResult ? "var(--green)" : "var(--border)"}`,
                      borderRadius: "var(--radius-lg)",
                      background: isDragging ? "rgba(37,99,235,0.04)" : parseResult ? "var(--green-bg)" : "var(--card-bg)",
                      padding: "28px 20px",
                      textAlign: "center",
                      cursor: "pointer",
                      transition: "all 0.15s ease",
                    }}
                  >
                    {parseResult ? (
                      <>
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" style={{ margin: "0 auto 8px", color: "var(--green)", display: "block" }}>
                          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5" />
                          <path d="M8 12l3 3 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                        <p style={{ fontSize: "13px", fontWeight: 600, color: "var(--green)", marginBottom: "2px" }}>
                          Parsed {parseResult.holdings.length} position{parseResult.holdings.length !== 1 ? "s" : ""}
                        </p>
                        {parseResult.detectedBroker && (
                          <p style={{ fontSize: "11px", color: "var(--text-tertiary)" }}>
                            Detected: {parseResult.detectedBroker}
                          </p>
                        )}
                        {fileName && (
                          <p style={{ fontSize: "10px", color: "var(--text-muted)", marginTop: "4px" }}>{fileName}</p>
                        )}
                        {parseResult.cashDetected && (
                          <p style={{ fontSize: "10px", color: "var(--amber)", marginTop: "6px" }}>
                            Cash row detected — BuyTune cash balance will not be changed.
                          </p>
                        )}
                      </>
                    ) : (
                      <>
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" style={{ margin: "0 auto 10px", color: "var(--text-muted)", display: "block" }}>
                          <path d="M12 16V8M9 11l3-3 3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                          <path d="M20 16.5A4.5 4.5 0 0015.5 12H15a6 6 0 10-11.95 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                        </svg>
                        <p style={{ fontSize: "13px", fontWeight: 500, color: "var(--text-secondary)", marginBottom: "4px" }}>
                          {isDragging ? "Drop your CSV here" : "Drop CSV or click to browse"}
                        </p>
                        <p style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                          Robinhood: Account → Statements → Export holdings CSV
                        </p>
                      </>
                    )}
                  </div>
                </div>
              )}

              {/* Paste */}
              {method === "paste" && (
                <div>
                  <textarea
                    value={pasteText}
                    onChange={(e) => setPasteText(e.target.value)}
                    placeholder={"AAPL 12.53\nNVDA 8.91\nTSLA 4.12"}
                    rows={8}
                    style={{
                      width: "100%",
                      background: "var(--bg-overlay)",
                      border: `1px solid ${parseResult ? "var(--green)" : "var(--border)"}`,
                      borderRadius: "var(--radius-md)",
                      padding: "12px 14px",
                      fontSize: "13px",
                      fontFamily: "var(--font-mono)",
                      color: "var(--text-primary)",
                      resize: "vertical",
                      outline: "none",
                      transition: "border-color 0.15s ease",
                      boxSizing: "border-box",
                    }}
                    onFocus={(e) => {
                      if (!parseResult) e.currentTarget.style.borderColor = "rgba(37,99,235,0.5)";
                    }}
                    onBlur={(e) => {
                      if (!parseResult) e.currentTarget.style.borderColor = "var(--border)";
                    }}
                  />
                  {parseResult && pasteText.trim() && (
                    <p style={{ fontSize: "11px", color: "var(--green)", marginTop: "6px" }}>
                      Parsed {parseResult.holdings.length} position{parseResult.holdings.length !== 1 ? "s" : ""}
                    </p>
                  )}
                  <p style={{ fontSize: "10px", color: "var(--text-muted)", marginTop: "6px" }}>
                    One holding per line: AAPL 12.53 — commas also work (AAPL, 12.53)
                  </p>
                </div>
              )}

              {/* Parse error */}
              {parseError && (
                <div
                  style={{
                    marginTop: "12px",
                    padding: "10px 12px",
                    background: "var(--red-bg)",
                    border: "1px solid var(--red-border)",
                    borderRadius: "var(--radius-md)",
                    fontSize: "12px",
                    color: "var(--red)",
                  }}
                >
                  {parseError}
                </div>
              )}
            </div>

            <ModalFooter>
              <button onClick={resetAndClose} style={ghostBtnStyle}>
                Cancel
              </button>
              <button
                onClick={handleContinue}
                disabled={!parseResult}
                style={parseResult ? primaryBtnStyle : disabledBtnStyle}
              >
                Review changes
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d="M2.5 6h7M6 2.5L9.5 6 6 9.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </ModalFooter>
          </>
        )}

        {/* ── STEP 2: REVIEW ──────────────────────────────────────────────── */}
        {step === "review" && diff && (
          <>
            <ModalHeader
              title="Preview Changes"
              subtitle={
                meaningfulChanges === 0
                  ? "Holdings are in sync"
                  : `${meaningfulChanges} change${meaningfulChanges !== 1 ? "s" : ""} detected — review before applying`
              }
              step="2 of 3"
              onClose={resetAndClose}
            />

            <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px" }}>
              {meaningfulChanges === 0 ? (
                <div
                  style={{
                    textAlign: "center",
                    padding: "32px 20px",
                    color: "var(--text-tertiary)",
                  }}
                >
                  <svg width="32" height="32" viewBox="0 0 32 32" fill="none" style={{ margin: "0 auto 12px", display: "block", color: "var(--green)" }}>
                    <circle cx="16" cy="16" r="13" stroke="currentColor" strokeWidth="1.5" />
                    <path d="M10 16.5l4 4 8-8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <p style={{ fontSize: "14px", fontWeight: 500, color: "var(--text-secondary)" }}>
                    Your holdings are in sync.
                  </p>
                  <p style={{ fontSize: "12px", marginTop: "4px" }}>
                    No meaningful differences found{diff.ignored.length > 0 ? ` (${diff.ignored.length} trivial row${diff.ignored.length !== 1 ? "s" : ""} ignored)` : ""}.
                  </p>
                </div>
              ) : (
                <div className="bt-list-animate" style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                  {/* Select / deselect all */}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "6px 12px 10px",
                      borderBottom: "1px solid var(--border-subtle)",
                      marginBottom: "4px",
                    }}
                  >
                    <span style={{ fontSize: "11px", color: "var(--text-tertiary)" }}>
                      {selectedCount} of {meaningfulChanges} selected
                    </span>
                    <div style={{ display: "flex", gap: "8px" }}>
                      <button
                        onClick={() => {
                          const all = new Set<string>();
                          for (const item of [...diff.added, ...diff.changed, ...diff.removed]) {
                            all.add(`${item.action}:${item.ticker}`);
                          }
                          setSelected(all);
                        }}
                        style={tinyGhostStyle}
                      >
                        All
                      </button>
                      <button onClick={() => setSelected(new Set())} style={tinyGhostStyle}>
                        None
                      </button>
                    </div>
                  </div>

                  {diff.added.length > 0 && (
                    <div>
                      <SectionHeader label="Added" count={diff.added.length} color="var(--green)" />
                      <div style={{ marginBottom: "4px" }}>
                        <p style={{ fontSize: "10px", color: "var(--text-muted)", marginBottom: "6px", paddingLeft: "12px" }}>
                          Cost basis will be set to $0 — update after syncing.
                        </p>
                        {diff.added.map((item) => (
                          <DiffRow
                            key={item.ticker}
                            item={item}
                            selected={selected.has(`add:${item.ticker}`)}
                            onToggle={() => toggleChange(`add:${item.ticker}`)}
                          />
                        ))}
                      </div>
                    </div>
                  )}

                  {diff.changed.length > 0 && (
                    <div>
                      <SectionHeader label="Changed" count={diff.changed.length} color="var(--amber)" />
                      {diff.changed.map((item) => (
                        <DiffRow
                          key={item.ticker}
                          item={item}
                          selected={selected.has(`change:${item.ticker}`)}
                          onToggle={() => toggleChange(`change:${item.ticker}`)}
                        />
                      ))}
                    </div>
                  )}

                  {diff.removed.length > 0 && (
                    <div>
                      <SectionHeader label="Removed" count={diff.removed.length} color="var(--red)" />
                      {diff.removed.map((item) => (
                        <DiffRow
                          key={item.ticker}
                          item={item}
                          selected={selected.has(`remove:${item.ticker}`)}
                          onToggle={() => toggleChange(`remove:${item.ticker}`)}
                        />
                      ))}
                    </div>
                  )}

                  {diff.ignored.length > 0 && (
                    <div style={{ marginTop: "4px", opacity: 0.5 }}>
                      <SectionHeader label={`Ignored (< 0.01 shares)`} count={diff.ignored.length} color="var(--text-muted)" />
                      {diff.ignored.map((item) => (
                        <div
                          key={item.ticker}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "10px",
                            padding: "6px 12px",
                          }}
                        >
                          <span
                            style={{
                              fontFamily: "var(--font-mono)",
                              fontSize: "11px",
                              color: "var(--text-muted)",
                              background: "var(--bg-overlay)",
                              borderRadius: "var(--radius-sm)",
                              padding: "2px 7px",
                            }}
                          >
                            {item.ticker}
                          </span>
                          <span style={{ fontSize: "11px", fontFamily: "var(--font-mono)", color: "var(--text-muted)" }}>
                            {fmt(item.currentShares)} → {fmt(item.importedShares)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {applyError && (
                <div
                  style={{
                    marginTop: "12px",
                    padding: "10px 12px",
                    background: "var(--red-bg)",
                    border: "1px solid var(--red-border)",
                    borderRadius: "var(--radius-md)",
                    fontSize: "12px",
                    color: "var(--red)",
                  }}
                >
                  {applyError}
                </div>
              )}
            </div>

            <ModalFooter>
              <button onClick={() => { setStep("import"); setApplyError(null); }} style={ghostBtnStyle}>
                ← Back
              </button>
              {meaningfulChanges === 0 ? (
                <button onClick={resetAndClose} style={primaryBtnStyle}>
                  Done
                </button>
              ) : (
                <button
                  onClick={handleApply}
                  disabled={isPending || selectedCount === 0}
                  style={isPending || selectedCount === 0 ? disabledBtnStyle : primaryBtnStyle}
                >
                  {isPending ? (
                    <>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" style={{ animation: "spin 0.8s linear infinite" }}>
                        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeOpacity="0.25" />
                        <path d="M12 2a10 10 0 0110 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                      </svg>
                      Applying…
                    </>
                  ) : (
                    `Apply ${selectedCount} change${selectedCount !== 1 ? "s" : ""}`
                  )}
                </button>
              )}
            </ModalFooter>
          </>
        )}

        {/* ── STEP 3: SUCCESS ─────────────────────────────────────────────── */}
        {step === "success" && (
          <>
            <div
              style={{
                padding: "28px 24px 20px",
                textAlign: "center",
                animation: "bt-scale-in 0.25s ease both",
              }}
            >
              <div
                style={{
                  width: "48px",
                  height: "48px",
                  borderRadius: "50%",
                  background: "var(--green-bg)",
                  border: "1px solid var(--green-border)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  margin: "0 auto 14px",
                }}
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                  <path d="M5 12.5l5 5 9-9" stroke="var(--green)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <h2
                style={{
                  fontFamily: "var(--font-display)",
                  fontSize: "18px",
                  fontWeight: 600,
                  color: "var(--text-primary)",
                  letterSpacing: "-0.2px",
                  marginBottom: "4px",
                }}
              >
                Portfolio synced
              </h2>
              <p style={{ fontSize: "12px", color: "var(--text-tertiary)" }}>
                Your BuyTune holdings now match your imported positions.
              </p>
            </div>

            <div style={{ padding: "0 24px 20px", display: "flex", flexDirection: "column", gap: "6px" }}>
              {[
                ["Positions imported", importedCount],
                ["Changes applied", appliedCount],
                ["Minor drift ignored", ignoredCount],
              ].map(([label, value]) => (
                <div
                  key={label as string}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "9px 12px",
                    background: "var(--bg-overlay)",
                    border: "1px solid var(--border-subtle)",
                    borderRadius: "var(--radius-md)",
                  }}
                >
                  <span style={{ fontSize: "12px", color: "var(--text-secondary)" }}>{label}</span>
                  <span
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: "13px",
                      fontWeight: 500,
                      color: "var(--text-primary)",
                    }}
                  >
                    {value}
                  </span>
                </div>
              ))}
            </div>

            <ModalFooter>
              <button onClick={resetAndClose} style={primaryBtnStyle}>
                Done
              </button>
            </ModalFooter>
          </>
        )}
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function ModalHeader({
  title,
  subtitle,
  step,
  onClose,
}: {
  title: string;
  subtitle: string;
  step: string;
  onClose: () => void;
}) {
  return (
    <div
      style={{
        padding: "16px 20px 14px",
        borderBottom: "1px solid var(--border-subtle)",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "space-between",
        gap: "12px",
        flexShrink: 0,
      }}
    >
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "2px" }}>
          <h2
            style={{
              fontFamily: "var(--font-display)",
              fontSize: "15px",
              fontWeight: 600,
              color: "var(--text-primary)",
              letterSpacing: "-0.2px",
            }}
          >
            {title}
          </h2>
          <span
            style={{
              fontSize: "9px",
              fontWeight: 600,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "var(--text-muted)",
              fontFamily: "var(--font-body)",
              background: "var(--bg-overlay)",
              border: "1px solid var(--border-subtle)",
              borderRadius: "var(--radius-full)",
              padding: "2px 7px",
            }}
          >
            Step {step}
          </span>
        </div>
        <p style={{ fontSize: "11px", color: "var(--text-tertiary)" }}>{subtitle}</p>
      </div>
      <button
        onClick={onClose}
        style={{
          width: "26px",
          height: "26px",
          borderRadius: "var(--radius-sm)",
          background: "var(--card-bg)",
          border: "1px solid var(--card-border)",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--text-tertiary)",
          flexShrink: 0,
          transition: "color 0.12s ease, background 0.12s ease",
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLButtonElement).style.color = "var(--text-primary)";
          (e.currentTarget as HTMLButtonElement).style.background = "var(--card-hover)";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLButtonElement).style.color = "var(--text-tertiary)";
          (e.currentTarget as HTMLButtonElement).style.background = "var(--card-bg)";
        }}
      >
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
          <path d="M1 1l8 8M9 1L1 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}

function ModalFooter({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        padding: "14px 20px",
        borderTop: "1px solid var(--border-subtle)",
        display: "flex",
        alignItems: "center",
        justifyContent: "flex-end",
        gap: "8px",
        flexShrink: 0,
      }}
    >
      {children}
    </div>
  );
}

// ── Button style objects ──────────────────────────────────────────────────────

const primaryBtnStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "6px",
  padding: "8px 18px",
  fontSize: "13px",
  fontFamily: "var(--font-body)",
  fontWeight: 600,
  color: "#fff",
  background: "var(--brand-gradient)",
  border: "none",
  borderRadius: "var(--radius-md)",
  cursor: "pointer",
  boxShadow: "var(--shadow-brand)",
};

const ghostBtnStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "6px",
  padding: "8px 14px",
  fontSize: "13px",
  fontFamily: "var(--font-body)",
  fontWeight: 500,
  color: "var(--text-secondary)",
  background: "var(--card-bg)",
  border: "1px solid var(--card-border)",
  borderRadius: "var(--radius-md)",
  cursor: "pointer",
};

const disabledBtnStyle: React.CSSProperties = {
  ...primaryBtnStyle,
  opacity: 0.4,
  cursor: "not-allowed",
  boxShadow: "none",
};

const tinyGhostStyle: React.CSSProperties = {
  fontSize: "10px",
  fontFamily: "var(--font-body)",
  fontWeight: 500,
  color: "var(--text-muted)",
  background: "transparent",
  border: "none",
  cursor: "pointer",
  padding: "2px 6px",
};
