"use client";

import { useRef, useState, useTransition } from "react";
import { importHoldingsCSV, type ImportHoldingsResult } from "./actions";

type InputMode = "file" | "paste";

type EditableRow = {
  id: number;
  ticker: string;
  sharesRaw: string;
  costRaw: string;
  company_name: string;
  asset_type: string;
  notes: string;
  shares: number;
  average_cost_basis: number;
  error?: string;
};

const VALID_ASSET_TYPES = ["stock", "etf", "crypto", "bond", "option", "mutual_fund", "cash_equivalent", "other"];

function normalizeHeader(h: string): string {
  return h.toLowerCase().trim().replace(/[\s_-]+/g, "_");
}

type RowKey = "ticker" | "shares" | "average_cost_basis" | "company_name" | "asset_type" | "notes";

function mapHeader(h: string): RowKey | null {
  const n = normalizeHeader(h);
  if (["ticker", "symbol", "stock", "instrument", "security"].includes(n)) return "ticker";
  if (["shares", "quantity", "qty", "share_count", "num_shares", "units", "amount"].includes(n)) return "shares";
  if (["average_cost_basis", "avg_cost", "cost_basis", "avg_cost_basis", "cost", "average_cost", "price_paid", "avg_price", "purchase_price", "unit_cost", "book_value_per_share"].includes(n)) return "average_cost_basis";
  if (["company_name", "company", "name", "description", "security_name", "stock_name"].includes(n)) return "company_name";
  if (["asset_type", "type", "security_type", "instrument_type"].includes(n)) return "asset_type";
  if (["notes", "note", "comment", "comments"].includes(n)) return "notes";
  return null;
}

function validateRow(ticker: string, sharesRaw: string, costRaw: string): { error?: string; shares: number; average_cost_basis: number } {
  const t = ticker.trim().toUpperCase();
  const shares = parseFloat(sharesRaw);
  const cost = parseFloat(costRaw);
  if (!t || !/^[A-Z0-9.\-]{1,20}$/.test(t)) return { error: "Invalid ticker", shares: NaN, average_cost_basis: NaN };
  if (!Number.isFinite(shares) || shares <= 0) return { error: "Invalid shares", shares: NaN, average_cost_basis: cost };
  if (!Number.isFinite(cost) || cost < 0) return { error: "Invalid cost basis", shares, average_cost_basis: NaN };
  return { shares, average_cost_basis: cost };
}

let _rowIdCounter = 0;

function parseCSVToEditable(text: string): EditableRow[] {
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n").filter(l => l.trim());
  if (lines.length < 2) return [];

  const headers = lines[0].split(",").map(h => h.replace(/^["']|["']$/g, "").trim());
  const colMap = new Map<number, RowKey>();
  headers.forEach((h, i) => {
    const key = mapHeader(h);
    if (key) colMap.set(i, key);
  });

  const rows: EditableRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split(",").map(c => c.replace(/^["']|["']$/g, "").trim());
    const raw: Partial<Record<RowKey, string>> = {};
    colMap.forEach((key, idx) => { raw[key] = cells[idx] ?? ""; });

    const ticker = (raw.ticker || "").trim().toUpperCase();
    const sharesRaw = raw.shares || "";
    const costRaw = raw.average_cost_basis || "";
    const { error, shares, average_cost_basis } = validateRow(ticker, sharesRaw, costRaw);
    const assetType = VALID_ASSET_TYPES.includes(raw.asset_type || "") ? raw.asset_type! : "stock";

    rows.push({
      id: ++_rowIdCounter,
      ticker,
      sharesRaw,
      costRaw,
      company_name: raw.company_name || "",
      asset_type: assetType,
      notes: raw.notes || "",
      shares,
      average_cost_basis,
      error,
    });
  }
  return rows;
}

const TEMPLATE_CSV = `ticker,shares,average_cost_basis,company_name,asset_type
AAPL,10,180.50,Apple Inc.,stock
MSFT,5,350.00,Microsoft Corp.,stock
BTC-USD,0.25,42000.00,Bitcoin,crypto
VTI,20,220.00,Vanguard Total Market ETF,etf`;

function downloadTemplate() {
  const blob = new Blob([TEMPLATE_CSV], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = "holdings-template.csv"; a.click();
  URL.revokeObjectURL(url);
}

const inputBase: React.CSSProperties = {
  background: "transparent",
  border: "none",
  outline: "none",
  color: "var(--text-primary)",
  fontFamily: "var(--font-body)",
  fontSize: "11px",
  width: "100%",
  padding: "1px 0",
};

const monoInput: React.CSSProperties = { ...inputBase, fontFamily: "var(--font-mono)" };

export default function ImportHoldingsCSV({ portfolioId }: { portfolioId: string }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<InputMode>("file");
  const [rows, setRows] = useState<EditableRow[]>([]);
  const [fileName, setFileName] = useState("");
  const [pastedText, setPastedText] = useState("");
  const [result, setResult] = useState<ImportHoldingsResult | null>(null);
  const [isPending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  function reset() {
    setRows([]); setFileName(""); setPastedText(""); setResult(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  function applyParsed(text: string) {
    setResult(null);
    setRows(text.trim() ? parseCSVToEditable(text) : []);
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) { setRows([]); setFileName(""); return; }
    setFileName(file.name);
    setResult(null);
    const reader = new FileReader();
    reader.onload = ev => applyParsed(String(ev.target?.result ?? ""));
    reader.readAsText(file);
  }

  function handlePasteChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setPastedText(e.target.value);
    applyParsed(e.target.value);
  }

  function switchMode(next: InputMode) {
    setMode(next);
    reset();
  }

  function updateRowField(id: number, field: "ticker" | "sharesRaw" | "costRaw" | "company_name" | "asset_type" | "notes", value: string) {
    setRows(prev => prev.map(row => {
      if (row.id !== id) return row;
      const next = { ...row, [field]: value };
      const { error, shares, average_cost_basis } = validateRow(
        field === "ticker" ? value : row.ticker,
        field === "sharesRaw" ? value : row.sharesRaw,
        field === "costRaw" ? value : row.costRaw,
      );
      // Normalize ticker to uppercase
      if (field === "ticker") next.ticker = value.toUpperCase();
      return { ...next, error, shares, average_cost_basis };
    }));
  }

  function removeRow(id: number) {
    setRows(prev => prev.filter(r => r.id !== id));
  }

  function addBlankRow() {
    setRows(prev => [...prev, {
      id: ++_rowIdCounter,
      ticker: "", sharesRaw: "", costRaw: "", company_name: "", asset_type: "stock", notes: "",
      shares: NaN, average_cost_basis: NaN, error: "Invalid ticker",
    }]);
  }

  const validRows = rows.filter(r => !r.error);
  const invalidRows = rows.filter(r => r.error);
  const hasInput = mode === "file" ? !!fileName : !!pastedText.trim();

  function handleImport() {
    if (!validRows.length || isPending) return;
    setResult(null);
    startTransition(async () => {
      try {
        const res = await importHoldingsCSV(
          portfolioId,
          validRows.map(r => ({
            ticker: r.ticker,
            shares: r.shares,
            average_cost_basis: r.average_cost_basis,
            company_name: r.company_name || undefined,
            asset_type: r.asset_type || undefined,
            notes: r.notes || undefined,
          }))
        );
        setResult(res);
        if (res.errors.length === 0) reset();
      } catch (err) {
        setResult({ imported: 0, updated: 0, errors: [{ row: -1, ticker: "", message: err instanceof Error ? err.message : "Import failed." }] });
      }
    });
  }

  const buttonLabel = isPending
    ? "Importing..."
    : validRows.length > 0
    ? `Import ${validRows.length} holding${validRows.length !== 1 ? "s" : ""}${invalidRows.length > 0 ? ` (${invalidRows.length} skipped)` : ""}`
    : hasInput
    ? "Fix errors above first"
    : mode === "file" ? "Select a file first" : "Paste CSV above first";

  const cellStyle: React.CSSProperties = {
    padding: "4px 8px",
    borderBottom: "1px solid var(--border-subtle)",
    verticalAlign: "middle",
  };

  return (
    <div>
      <button
        type="button"
        onClick={() => { setOpen(p => !p); reset(); }}
        className="bt-btn bt-btn-ghost bt-btn-sm"
        style={{ gap: "5px" }}
      >
        <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
        </svg>
        Import CSV
      </button>

      {open && (
        <div style={{
          marginTop: "12px",
          padding: "16px 18px",
          background: "var(--bg-elevated)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-lg)",
        }}>
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "14px" }}>
            <div>
              <div style={{ fontSize: "13px", fontWeight: 500, color: "var(--text-primary)" }}>Import Holdings</div>
              <div style={{ fontSize: "11px", color: "var(--text-tertiary)", marginTop: "2px" }}>Review and edit each row before importing</div>
            </div>
            <button type="button" onClick={() => { setOpen(false); reset(); }} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", padding: "2px" }}>
              <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
            </button>
          </div>

          {/* Mode tabs */}
          <div style={{ display: "flex", gap: "4px", marginBottom: "14px", background: "var(--bg-surface)", padding: "3px", borderRadius: "var(--radius-md)", border: "1px solid var(--border-subtle)" }}>
            {(["file", "paste"] as InputMode[]).map(m => (
              <button
                key={m}
                type="button"
                onClick={() => switchMode(m)}
                style={{
                  flex: 1, padding: "5px 10px", borderRadius: "calc(var(--radius-md) - 2px)",
                  border: "none", cursor: "pointer", fontSize: "11px", fontWeight: 500,
                  fontFamily: "var(--font-body)", transition: "all 0.15s",
                  background: mode === m ? "var(--bg-elevated)" : "transparent",
                  color: mode === m ? "var(--text-primary)" : "var(--text-muted)",
                  boxShadow: mode === m ? "0 1px 3px rgba(0,0,0,0.2)" : "none",
                }}
              >
                {m === "file" ? "Upload File" : "Paste CSV"}
              </button>
            ))}
          </div>

          {/* Format hint */}
          <div style={{ marginBottom: "14px", padding: "10px 12px", background: "var(--bg-surface)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-sm)" }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "4px", alignItems: "center" }}>
              <span style={{ fontSize: "10px", color: "var(--text-tertiary)", marginRight: "4px" }}>Required:</span>
              {["ticker", "shares", "average_cost_basis"].map(l => (
                <span key={l} style={{ fontFamily: "var(--font-mono)", fontSize: "10px", padding: "1px 7px", borderRadius: "var(--radius-full)", background: "rgba(37,99,235,0.1)", color: "var(--brand-blue)", border: "1px solid rgba(37,99,235,0.2)" }}>{l}</span>
              ))}
              <span style={{ fontSize: "10px", color: "var(--text-tertiary)", marginLeft: "6px", marginRight: "4px" }}>Optional:</span>
              {["company_name", "asset_type", "notes"].map(l => (
                <span key={l} style={{ fontFamily: "var(--font-mono)", fontSize: "10px", padding: "1px 7px", borderRadius: "var(--radius-full)", background: "var(--bg-elevated)", color: "var(--text-muted)", border: "1px solid var(--border-subtle)" }}>{l}</span>
              ))}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "12px", marginTop: "8px" }}>
              <span style={{ fontSize: "10px", color: "var(--text-muted)" }}>Also accepts: symbol, quantity, cost_basis, avg_price, name</span>
              <button type="button" onClick={downloadTemplate} style={{ display: "inline-flex", alignItems: "center", gap: "3px", fontSize: "10px", color: "var(--brand-blue)", background: "none", border: "none", cursor: "pointer", padding: 0, marginLeft: "auto" }}>
                <svg width="9" height="9" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                Template
              </button>
            </div>
          </div>

          {/* PDF / non-CSV tip */}
          <div style={{
            marginBottom: "14px",
            padding: "9px 12px",
            background: "rgba(245,158,11,0.05)",
            border: "1px solid rgba(245,158,11,0.15)",
            borderRadius: "var(--radius-sm)",
            display: "flex",
            gap: "9px",
            alignItems: "flex-start",
          }}>
            <span style={{ fontSize: "13px", lineHeight: 1, marginTop: "1px", flexShrink: 0 }}>💡</span>
            <div>
              <div style={{ fontSize: "11px", color: "var(--text-secondary)", lineHeight: 1.5 }}>
                <strong style={{ color: "var(--text-primary)", fontWeight: 600 }}>Got a PDF from your brokerage?</strong>{" "}
                Some brokerages (like Edward Jones) only export a large PDF. Open ChatGPT, paste your statement, and ask:
              </div>
              <div style={{
                marginTop: "6px",
                padding: "6px 10px",
                background: "var(--bg-surface)",
                borderRadius: "var(--radius-sm)",
                fontFamily: "var(--font-mono)",
                fontSize: "10px",
                color: "var(--text-tertiary)",
                lineHeight: 1.5,
              }}>
                &ldquo;Convert my holdings to a CSV with columns: ticker, shares, average_cost_basis. Return only the CSV, no explanation.&rdquo;
              </div>
              <div style={{ fontSize: "10px", color: "var(--text-muted)", marginTop: "5px" }}>
                Then paste the result into the <strong style={{ color: "var(--text-secondary)" }}>Paste CSV</strong> tab above.
              </div>
            </div>
          </div>

          {/* File input — plain div + hidden input; no <label> wrapper to avoid double-open */}
          {mode === "file" && (
            <div style={{ marginBottom: "12px" }}>
              <div style={{ fontSize: "10px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--text-tertiary)", marginBottom: "5px" }}>Select CSV file</div>
              <div
                role="button"
                tabIndex={0}
                style={{ display: "flex", alignItems: "center", gap: "10px", padding: "9px 12px", background: "var(--bg-surface)", border: "1px solid var(--border-strong)", borderRadius: "var(--radius-sm)", cursor: "pointer", userSelect: "none" }}
                onClick={() => fileRef.current?.click()}
                onKeyDown={e => { if (e.key === "Enter" || e.key === " ") fileRef.current?.click(); }}
              >
                <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor" style={{ color: "var(--text-muted)", flexShrink: 0 }}>
                  <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
                <span style={{ fontSize: "12px", color: fileName ? "var(--text-primary)" : "var(--text-muted)" }}>
                  {fileName || "Click to choose .csv file"}
                </span>
                {fileName && (
                  <button type="button" onClick={e => { e.stopPropagation(); reset(); }} style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", padding: "1px" }}>
                    <svg width="11" height="11" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                  </button>
                )}
              </div>
              {/* Hidden file input — not inside a label so clicking the div above is the only trigger */}
              <input ref={fileRef} type="file" accept=".csv,text/csv,text/plain" onChange={handleFile} style={{ display: "none" }} tabIndex={-1} />
              {fileName && rows.length === 0 && (
                <p style={{ fontSize: "10px", color: "var(--amber)", marginTop: "5px" }}>
                  File loaded but no rows detected. Check that your CSV has a header row with at least: <span style={{ fontFamily: "var(--font-mono)" }}>ticker, shares, average_cost_basis</span>.
                </p>
              )}
            </div>
          )}

          {/* Paste textarea */}
          {mode === "paste" && (
            <div style={{ marginBottom: "12px" }}>
              <div style={{ fontSize: "10px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--text-tertiary)", marginBottom: "5px" }}>Paste CSV contents</div>
              <textarea
                value={pastedText}
                onChange={handlePasteChange}
                placeholder={"ticker,shares,average_cost_basis\nAAPL,10,180.50\nMSFT,5,350.00"}
                rows={5}
                style={{
                  width: "100%", boxSizing: "border-box",
                  padding: "10px 12px",
                  background: "var(--bg-surface)",
                  border: "1px solid var(--border-strong)",
                  borderRadius: "var(--radius-sm)",
                  color: "var(--text-primary)",
                  fontFamily: "var(--font-mono)",
                  fontSize: "11px",
                  lineHeight: 1.6,
                  resize: "vertical",
                  outline: "none",
                }}
              />
              {pastedText.trim() && rows.length === 0 && (
                <p style={{ fontSize: "10px", color: "var(--amber)", marginTop: "4px" }}>
                  Could not detect rows. Make sure the first line is a header (e.g. ticker,shares,average_cost_basis).
                </p>
              )}
            </div>
          )}

          {/* Editable preview table */}
          {rows.length > 0 && (
            <div style={{ marginBottom: "12px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6px" }}>
                <div style={{ fontSize: "10px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--text-tertiary)" }}>
                  {validRows.length} ready{invalidRows.length > 0 ? `, ${invalidRows.length} need fixing` : ""}
                </div>
                <span style={{ fontSize: "10px", color: "var(--text-muted)" }}>Click any cell to edit</span>
              </div>
              <div style={{ maxHeight: "280px", overflowY: "auto", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-subtle)" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11px" }}>
                  <thead>
                    <tr style={{ background: "var(--bg-surface)", position: "sticky", top: 0, zIndex: 1 }}>
                      {["Ticker *", "Shares *", "Avg Cost *", "Company", "Type", ""].map(h => (
                        <th key={h} style={{ padding: "6px 8px", textAlign: "left", fontWeight: 600, color: "var(--text-tertiary)", fontSize: "9px", textTransform: "uppercase", letterSpacing: "0.06em", borderBottom: "1px solid var(--border-subtle)", whiteSpace: "nowrap" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => {
                      const hasError = !!row.error;
                      const rowBg = hasError ? "rgba(239,68,68,0.04)" : "transparent";
                      return (
                        <tr key={row.id} style={{ background: rowBg, borderBottom: "1px solid var(--border-subtle)" }}>
                          {/* Ticker */}
                          <td style={{ ...cellStyle, minWidth: "70px" }}>
                            <div style={{
                              borderRadius: "3px",
                              border: `1px solid ${hasError && row.error === "Invalid ticker" ? "rgba(239,68,68,0.4)" : "transparent"}`,
                              padding: "2px 4px",
                              transition: "border-color 0.1s",
                            }}
                              onFocus={e => (e.currentTarget.style.borderColor = "var(--border-strong)")}
                              onBlur={e => (e.currentTarget.style.borderColor = hasError && row.error === "Invalid ticker" ? "rgba(239,68,68,0.4)" : "transparent")}
                            >
                              <input
                                style={{ ...monoInput, fontWeight: 600, color: hasError && row.error === "Invalid ticker" ? "var(--red)" : "var(--text-primary)", textTransform: "uppercase" }}
                                value={row.ticker}
                                onChange={e => updateRowField(row.id, "ticker", e.target.value)}
                                placeholder="AAPL"
                                spellCheck={false}
                              />
                            </div>
                          </td>
                          {/* Shares */}
                          <td style={{ ...cellStyle, minWidth: "60px" }}>
                            <div style={{
                              borderRadius: "3px",
                              border: `1px solid ${hasError && row.error === "Invalid shares" ? "rgba(239,68,68,0.4)" : "transparent"}`,
                              padding: "2px 4px",
                            }}
                              onFocus={e => (e.currentTarget.style.borderColor = "var(--border-strong)")}
                              onBlur={e => (e.currentTarget.style.borderColor = hasError && row.error === "Invalid shares" ? "rgba(239,68,68,0.4)" : "transparent")}
                            >
                              <input
                                style={{ ...monoInput, color: hasError && row.error === "Invalid shares" ? "var(--red)" : "var(--text-secondary)" }}
                                value={row.sharesRaw}
                                onChange={e => updateRowField(row.id, "sharesRaw", e.target.value)}
                                placeholder="0"
                                inputMode="decimal"
                              />
                            </div>
                          </td>
                          {/* Cost */}
                          <td style={{ ...cellStyle, minWidth: "70px" }}>
                            <div style={{
                              borderRadius: "3px",
                              border: `1px solid ${hasError && row.error === "Invalid cost basis" ? "rgba(239,68,68,0.4)" : "transparent"}`,
                              padding: "2px 4px",
                            }}
                              onFocus={e => (e.currentTarget.style.borderColor = "var(--border-strong)")}
                              onBlur={e => (e.currentTarget.style.borderColor = hasError && row.error === "Invalid cost basis" ? "rgba(239,68,68,0.4)" : "transparent")}
                            >
                              <input
                                style={{ ...monoInput, color: hasError && row.error === "Invalid cost basis" ? "var(--red)" : "var(--text-secondary)" }}
                                value={row.costRaw}
                                onChange={e => updateRowField(row.id, "costRaw", e.target.value)}
                                placeholder="0.00"
                                inputMode="decimal"
                              />
                            </div>
                          </td>
                          {/* Company */}
                          <td style={{ ...cellStyle, minWidth: "90px" }}>
                            <input
                              style={{ ...inputBase, color: "var(--text-muted)" }}
                              value={row.company_name}
                              onChange={e => updateRowField(row.id, "company_name", e.target.value)}
                              placeholder="Optional"
                            />
                          </td>
                          {/* Asset type */}
                          <td style={{ ...cellStyle, minWidth: "80px" }}>
                            <select
                              value={row.asset_type}
                              onChange={e => updateRowField(row.id, "asset_type", e.target.value)}
                              style={{
                                background: "transparent",
                                border: "none",
                                outline: "none",
                                color: "var(--text-muted)",
                                fontFamily: "var(--font-body)",
                                fontSize: "11px",
                                cursor: "pointer",
                                padding: 0,
                                width: "100%",
                              }}
                            >
                              {VALID_ASSET_TYPES.map(t => <option key={t} value={t} style={{ background: "var(--bg-elevated)" }}>{t}</option>)}
                            </select>
                          </td>
                          {/* Status + remove */}
                          <td style={{ ...cellStyle, width: "40px", whiteSpace: "nowrap" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                              {hasError
                                ? <span title={row.error} style={{ fontSize: "9px", color: "var(--red)", cursor: "help" }}>⚠ {row.error}</span>
                                : <svg width="10" height="10" viewBox="0 0 20 20" fill="var(--green)"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
                              }
                              <button
                                type="button"
                                onClick={() => removeRow(row.id)}
                                title="Remove row"
                                style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", padding: "1px", lineHeight: 1, opacity: 0.5 }}
                                onMouseEnter={e => (e.currentTarget.style.opacity = "1")}
                                onMouseLeave={e => (e.currentTarget.style.opacity = "0.5")}
                              >
                                <svg width="10" height="10" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <button
                type="button"
                onClick={addBlankRow}
                style={{
                  marginTop: "6px", display: "inline-flex", alignItems: "center", gap: "4px",
                  fontSize: "10px", color: "var(--text-muted)", background: "none", border: "none",
                  cursor: "pointer", padding: "2px 0",
                }}
                onMouseEnter={e => (e.currentTarget.style.color = "var(--text-secondary)")}
                onMouseLeave={e => (e.currentTarget.style.color = "var(--text-muted)")}
              >
                <svg width="10" height="10" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" /></svg>
                Add row manually
              </button>
            </div>
          )}

          {/* Result banner */}
          {result && (
            <div style={{
              marginBottom: "12px", padding: "10px 12px", borderRadius: "var(--radius-sm)",
              background: result.errors.length > 0 ? "rgba(245,158,11,0.06)" : "rgba(0,211,149,0.06)",
              border: `1px solid ${result.errors.length > 0 ? "rgba(245,158,11,0.2)" : "rgba(0,211,149,0.2)"}`,
            }}>
              <div style={{ fontSize: "12px", fontWeight: 500, color: result.errors.length > 0 ? "var(--amber)" : "var(--green)", marginBottom: result.errors.length > 0 ? "6px" : 0 }}>
                {result.imported > 0 && `${result.imported} holding${result.imported !== 1 ? "s" : ""} added`}
                {result.imported > 0 && result.updated > 0 && ", "}
                {result.updated > 0 && `${result.updated} updated`}
                {result.imported === 0 && result.updated === 0 && "No changes made"}
              </div>
              {result.errors.map((e, i) => (
                <div key={i} style={{ fontSize: "11px", color: "var(--red)", marginTop: "3px" }}>
                  {e.ticker ? `${e.ticker}: ` : ""}{e.message}
                </div>
              ))}
            </div>
          )}

          {/* Action buttons */}
          <div style={{ display: "flex", gap: "8px" }}>
            <button
              type="button"
              onClick={handleImport}
              disabled={validRows.length === 0 || isPending}
              style={{
                padding: "8px 16px", borderRadius: "var(--radius-md)", border: "none",
                background: validRows.length > 0 ? "var(--brand-blue)" : "var(--bg-surface)",
                color: validRows.length > 0 ? "#fff" : "var(--text-muted)",
                fontSize: "13px", fontWeight: 600,
                cursor: validRows.length > 0 && !isPending ? "pointer" : "not-allowed",
                fontFamily: "var(--font-body)", opacity: isPending ? 0.7 : 1, transition: "all 0.15s",
              }}
            >
              {buttonLabel}
            </button>
            <button type="button" onClick={() => { setOpen(false); reset(); }} style={{ padding: "8px 12px", borderRadius: "var(--radius-md)", border: "1px solid var(--border)", background: "transparent", color: "var(--text-tertiary)", fontSize: "13px", cursor: "pointer", fontFamily: "var(--font-body)" }}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
