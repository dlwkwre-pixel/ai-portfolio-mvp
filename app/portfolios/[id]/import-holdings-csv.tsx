"use client";

import { useRef, useState, useTransition } from "react";
import { importHoldingsCSV, type CSVHoldingRow, type ImportHoldingsResult } from "./actions";

type ParsedRow = CSVHoldingRow & { _rowNum: number; _error?: string };
type InputMode = "file" | "paste";

const VALID_ASSET_TYPES = ["stock", "etf", "crypto", "bond", "option", "mutual_fund", "cash_equivalent", "other"];

function normalizeHeader(h: string): string {
  return h.toLowerCase().trim().replace(/[\s_-]+/g, "_");
}

function mapHeader(h: string): keyof CSVHoldingRow | null {
  const n = normalizeHeader(h);
  if (["ticker", "symbol", "stock", "instrument", "security"].includes(n)) return "ticker";
  if (["shares", "quantity", "qty", "share_count", "num_shares", "units", "amount"].includes(n)) return "shares";
  if (["average_cost_basis", "avg_cost", "cost_basis", "avg_cost_basis", "cost", "average_cost", "price_paid", "avg_price", "purchase_price", "unit_cost", "book_value_per_share"].includes(n)) return "average_cost_basis";
  if (["company_name", "company", "name", "description", "security_name", "stock_name"].includes(n)) return "company_name";
  if (["asset_type", "type", "security_type", "instrument_type"].includes(n)) return "asset_type";
  if (["notes", "note", "comment", "comments"].includes(n)) return "notes";
  return null;
}

function parseCSV(text: string): ParsedRow[] {
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n").filter(l => l.trim());
  if (lines.length < 2) return [];

  const headers = lines[0].split(",").map(h => h.replace(/^["']|["']$/g, "").trim());
  const colMap = new Map<number, keyof CSVHoldingRow>();
  headers.forEach((h, i) => {
    const key = mapHeader(h);
    if (key) colMap.set(i, key);
  });

  const rows: ParsedRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split(",").map(c => c.replace(/^["']|["']$/g, "").trim());
    const raw: Partial<Record<keyof CSVHoldingRow, string>> = {};
    colMap.forEach((key, idx) => { raw[key] = cells[idx] ?? ""; });

    const ticker = (raw.ticker || "").trim().toUpperCase();
    const sharesNum = parseFloat(raw.shares || "");
    const costNum = parseFloat(raw.average_cost_basis || "");
    const assetType = VALID_ASSET_TYPES.includes(raw.asset_type || "") ? raw.asset_type! : "stock";

    let error: string | undefined;
    if (!ticker || !/^[A-Z0-9.\-]{1,20}$/.test(ticker)) error = "Invalid ticker";
    else if (!Number.isFinite(sharesNum) || sharesNum <= 0) error = "Invalid shares";
    else if (!Number.isFinite(costNum) || costNum < 0) error = "Invalid cost basis";

    rows.push({
      _rowNum: i,
      _error: error,
      ticker,
      shares: sharesNum,
      average_cost_basis: costNum,
      company_name: raw.company_name || undefined,
      asset_type: assetType,
      notes: raw.notes || undefined,
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

export default function ImportHoldingsCSV({ portfolioId }: { portfolioId: string }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<InputMode>("file");
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [fileName, setFileName] = useState("");
  const [pastedText, setPastedText] = useState("");
  const [result, setResult] = useState<ImportHoldingsResult | null>(null);
  const [isPending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  function reset() {
    setRows([]); setFileName(""); setPastedText(""); setResult(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    setResult(null);
    const file = e.target.files?.[0];
    if (!file) { setRows([]); setFileName(""); return; }
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = ev => setRows(parseCSV(String(ev.target?.result ?? "")));
    reader.readAsText(file);
  }

  function handlePasteChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const text = e.target.value;
    setPastedText(text);
    setResult(null);
    if (text.trim()) {
      setRows(parseCSV(text));
    } else {
      setRows([]);
    }
  }

  function switchMode(next: InputMode) {
    setMode(next);
    reset();
  }

  const validRows = rows.filter(r => !r._error);
  const invalidRows = rows.filter(r => r._error);

  function handleImport() {
    if (!validRows.length || isPending) return;
    setResult(null);
    startTransition(async () => {
      try {
        const res = await importHoldingsCSV(
          portfolioId,
          validRows.map(({ ticker, shares, average_cost_basis, company_name, asset_type, notes }) => ({
            ticker, shares, average_cost_basis, company_name, asset_type, notes,
          }))
        );
        setResult(res);
        if (res.errors.length === 0) reset();
      } catch (err) {
        setResult({ imported: 0, updated: 0, errors: [{ row: -1, ticker: "", message: err instanceof Error ? err.message : "Import failed." }] });
      }
    });
  }

  const hasText = mode === "file" ? !!fileName : !!pastedText.trim();
  const buttonLabel = isPending
    ? "Importing..."
    : validRows.length > 0
    ? `Import ${validRows.length} holding${validRows.length !== 1 ? "s" : ""}`
    : hasText
    ? "No valid rows found"
    : mode === "file"
    ? "Select a file first"
    : "Paste CSV above first";

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
              <div style={{ fontSize: "13px", fontWeight: 500, color: "var(--text-primary)" }}>Import Holdings from CSV</div>
              <div style={{ fontSize: "11px", color: "var(--text-tertiary)", marginTop: "2px" }}>Existing tickers will be updated with new shares and cost basis</div>
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

          {/* Format info */}
          <div style={{ marginBottom: "14px", padding: "10px 12px", background: "var(--bg-surface)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-sm)" }}>
            <div style={{ fontSize: "10px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--text-tertiary)", marginBottom: "6px" }}>Expected columns</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
              {[
                { label: "ticker", req: true },
                { label: "shares", req: true },
                { label: "average_cost_basis", req: true },
                { label: "company_name", req: false },
                { label: "asset_type", req: false },
                { label: "notes", req: false },
              ].map(({ label, req }) => (
                <span key={label} style={{ fontFamily: "var(--font-mono)", fontSize: "10px", padding: "1px 7px", borderRadius: "var(--radius-full)", background: req ? "rgba(37,99,235,0.1)" : "var(--bg-elevated)", color: req ? "var(--brand-blue)" : "var(--text-muted)", border: `1px solid ${req ? "rgba(37,99,235,0.2)" : "var(--border-subtle)"}` }}>
                  {label}{req ? " *" : ""}
                </span>
              ))}
            </div>
            <div style={{ marginTop: "8px", fontSize: "10px", color: "var(--text-muted)" }}>
              Also accepts: symbol, quantity, cost_basis, avg_price, name, description
            </div>
            <button type="button" onClick={downloadTemplate} style={{ marginTop: "8px", display: "inline-flex", alignItems: "center", gap: "4px", fontSize: "10px", color: "var(--brand-blue)", background: "none", border: "none", cursor: "pointer", padding: 0 }}>
              <svg width="10" height="10" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
              Download template
            </button>
          </div>

          {/* File input */}
          {mode === "file" && (
            <label style={{ display: "block", marginBottom: "12px" }}>
              <div style={{ fontSize: "10px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--text-tertiary)", marginBottom: "5px" }}>Select CSV file</div>
              <div style={{
                display: "flex", alignItems: "center", gap: "10px",
                padding: "9px 12px",
                background: "var(--bg-surface)",
                border: "1px solid var(--border-strong)",
                borderRadius: "var(--radius-sm)",
                cursor: "pointer",
              }}
                onClick={() => fileRef.current?.click()}
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
              <input ref={fileRef} type="file" accept=".csv,text/csv" onChange={handleFile} style={{ display: "none" }} />
            </label>
          )}

          {/* Paste textarea */}
          {mode === "paste" && (
            <div style={{ marginBottom: "12px" }}>
              <div style={{ fontSize: "10px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--text-tertiary)", marginBottom: "5px" }}>Paste CSV contents</div>
              <textarea
                value={pastedText}
                onChange={handlePasteChange}
                placeholder={"ticker,shares,average_cost_basis\nAAPL,10,180.50\nMSFT,5,350.00"}
                rows={6}
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
                  Could not detect valid rows. Make sure the first line is a header row (e.g. ticker,shares,average_cost_basis).
                </p>
              )}
            </div>
          )}

          {/* Preview */}
          {rows.length > 0 && (
            <div style={{ marginBottom: "12px" }}>
              <div style={{ fontSize: "10px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--text-tertiary)", marginBottom: "6px" }}>
                Preview — {validRows.length} valid, {invalidRows.length} error{invalidRows.length !== 1 ? "s" : ""}
              </div>
              {validRows.length === 0 && (
                <div style={{ padding: "10px 12px", background: "rgba(239,68,68,0.05)", border: "1px solid rgba(239,68,68,0.15)", borderRadius: "var(--radius-sm)", fontSize: "11px", color: "var(--red)", marginBottom: "8px" }}>
                  All rows have errors. Check that your CSV includes the required columns: <span style={{ fontFamily: "var(--font-mono)" }}>ticker, shares, average_cost_basis</span>.
                </div>
              )}
              <div style={{ maxHeight: "220px", overflowY: "auto", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-subtle)" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11px" }}>
                  <thead>
                    <tr style={{ background: "var(--bg-surface)" }}>
                      {["Ticker", "Shares", "Avg Cost", "Company", "Type", ""].map(h => (
                        <th key={h} style={{ padding: "6px 10px", textAlign: "left", fontWeight: 600, color: "var(--text-tertiary)", fontSize: "9px", textTransform: "uppercase", letterSpacing: "0.06em", borderBottom: "1px solid var(--border-subtle)", whiteSpace: "nowrap" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, i) => (
                      <tr key={i} style={{ background: row._error ? "rgba(239,68,68,0.04)" : (i % 2 === 0 ? "transparent" : "var(--bg-elevated)"), borderBottom: "1px solid var(--border-subtle)" }}>
                        <td style={{ padding: "5px 10px", fontFamily: "var(--font-mono)", fontWeight: 600, color: row._error ? "var(--red)" : "var(--text-primary)" }}>{row.ticker || "—"}</td>
                        <td style={{ padding: "5px 10px", fontFamily: "var(--font-mono)", color: "var(--text-secondary)" }}>{Number.isFinite(row.shares) ? row.shares : "—"}</td>
                        <td style={{ padding: "5px 10px", fontFamily: "var(--font-mono)", color: "var(--text-secondary)" }}>{Number.isFinite(row.average_cost_basis) ? `$${row.average_cost_basis}` : "—"}</td>
                        <td style={{ padding: "5px 10px", color: "var(--text-muted)" }}>{row.company_name || "—"}</td>
                        <td style={{ padding: "5px 10px", color: "var(--text-muted)" }}>{row.asset_type || "stock"}</td>
                        <td style={{ padding: "5px 10px" }}>
                          {row._error
                            ? <span style={{ fontSize: "9px", color: "var(--red)" }}>{row._error}</span>
                            : <svg width="10" height="10" viewBox="0 0 20 20" fill="var(--green)"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
                          }
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {invalidRows.length > 0 && validRows.length > 0 && (
                <p style={{ fontSize: "10px", color: "var(--text-muted)", marginTop: "5px" }}>
                  {invalidRows.length} row{invalidRows.length !== 1 ? "s" : ""} with errors will be skipped.
                </p>
              )}
            </div>
          )}

          {/* Result banner */}
          {result && (
            <div style={{
              marginBottom: "12px",
              padding: "10px 12px",
              borderRadius: "var(--radius-sm)",
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
                padding: "8px 16px",
                borderRadius: "var(--radius-md)",
                border: "none",
                background: validRows.length > 0 ? "var(--brand-blue)" : "var(--bg-surface)",
                color: validRows.length > 0 ? "#fff" : "var(--text-muted)",
                fontSize: "13px",
                fontWeight: 600,
                cursor: validRows.length > 0 && !isPending ? "pointer" : "not-allowed",
                fontFamily: "var(--font-body)",
                opacity: isPending ? 0.7 : 1,
                transition: "all 0.15s",
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
