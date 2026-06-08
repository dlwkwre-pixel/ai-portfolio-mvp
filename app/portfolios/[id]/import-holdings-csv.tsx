"use client";

import { useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
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

type RowKey = "ticker" | "shares" | "average_cost_basis" | "company_name" | "asset_type" | "notes";

function mapHeader(h: string): RowKey | null {
  const n = h.toLowerCase().trim().replace(/[\s_-]+/g, "_");
  if (["ticker", "symbol", "stock", "instrument", "security"].includes(n)) return "ticker";
  if (["shares", "quantity", "qty", "share_count", "num_shares", "units", "amount"].includes(n)) return "shares";
  if (["average_cost_basis", "avg_cost", "cost_basis", "avg_cost_basis", "cost", "average_cost", "price_paid", "avg_price", "purchase_price", "unit_cost", "book_value_per_share"].includes(n)) return "average_cost_basis";
  if (["company_name", "company", "name", "description", "security_name", "stock_name"].includes(n)) return "company_name";
  if (["asset_type", "type", "security_type", "instrument_type"].includes(n)) return "asset_type";
  if (["notes", "note", "comment", "comments"].includes(n)) return "notes";
  return null;
}

function validateRow(ticker: string, sharesRaw: string, costRaw: string) {
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
  headers.forEach((h, i) => { const k = mapHeader(h); if (k) colMap.set(i, k); });

  return lines.slice(1).map((line, i) => {
    const cells = line.split(",").map(c => c.replace(/^["']|["']$/g, "").trim());
    const raw: Partial<Record<RowKey, string>> = {};
    colMap.forEach((key, idx) => { raw[key] = cells[idx] ?? ""; });
    const ticker = (raw.ticker || "").trim().toUpperCase();
    const sharesRaw = raw.shares || "";
    const costRaw = raw.average_cost_basis || "";
    const { error, shares, average_cost_basis } = validateRow(ticker, sharesRaw, costRaw);
    const assetType = VALID_ASSET_TYPES.includes(raw.asset_type || "") ? raw.asset_type! : "stock";
    return { id: ++_rowIdCounter, ticker, sharesRaw, costRaw, company_name: raw.company_name || "", asset_type: assetType, notes: raw.notes || "", shares, average_cost_basis, error };
  });
}

const TEMPLATE_CSV = `ticker,shares,average_cost_basis,company_name,asset_type
AAPL,10,180.50,Apple Inc.,stock
MSFT,5,350.00,Microsoft Corp.,stock
BTC-USD,0.25,42000.00,Bitcoin,crypto
VTI,20,220.00,Vanguard Total Market ETF,etf`;

function downloadTemplate() {
  const blob = new Blob([TEMPLATE_CSV], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = "holdings-template.csv"; a.click();
  URL.revokeObjectURL(url);
}

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

  function switchMode(next: InputMode) { setMode(next); reset(); }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) { setRows([]); setFileName(""); return; }
    setFileName(file.name); setResult(null);
    const reader = new FileReader();
    reader.onload = ev => setRows(parseCSVToEditable(String(ev.target?.result ?? "")));
    reader.readAsText(file);
  }

  function handlePasteChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const text = e.target.value;
    setPastedText(text); setResult(null);
    setRows(text.trim() ? parseCSVToEditable(text) : []);
  }

  function updateRowField(id: number, field: "ticker" | "sharesRaw" | "costRaw" | "company_name" | "asset_type" | "notes", value: string) {
    setRows(prev => prev.map(row => {
      if (row.id !== id) return row;
      const next = { ...row, [field]: value };
      if (field === "ticker") next.ticker = value.toUpperCase();
      const { error, shares, average_cost_basis } = validateRow(
        field === "ticker" ? value : row.ticker,
        field === "sharesRaw" ? value : row.sharesRaw,
        field === "costRaw" ? value : row.costRaw,
      );
      return { ...next, error, shares, average_cost_basis };
    }));
  }

  function removeRow(id: number) { setRows(prev => prev.filter(r => r.id !== id)); }

  function addBlankRow() {
    setRows(prev => [...prev, { id: ++_rowIdCounter, ticker: "", sharesRaw: "", costRaw: "", company_name: "", asset_type: "stock", notes: "", shares: NaN, average_cost_basis: NaN, error: "Invalid ticker" }]);
  }

  const validRows = rows.filter(r => !r.error);
  const invalidRows = rows.filter(r => r.error);
  const hasInput = mode === "file" ? !!fileName : !!pastedText.trim();

  function handleImport() {
    if (!validRows.length || isPending) return;
    setResult(null);
    startTransition(async () => {
      try {
        const res = await importHoldingsCSV(portfolioId, validRows.map(r => ({
          ticker: r.ticker, shares: r.shares, average_cost_basis: r.average_cost_basis,
          company_name: r.company_name || undefined, asset_type: r.asset_type || undefined, notes: r.notes || undefined,
        })));
        setResult(res);
        if (res.errors.length === 0) reset();
      } catch (err) {
        setResult({ imported: 0, updated: 0, errors: [{ row: -1, ticker: "", message: err instanceof Error ? err.message : "Import failed." }] });
      }
    });
  }

  const importLabel = isPending ? "Importing…"
    : validRows.length > 0 ? `Import ${validRows.length} holding${validRows.length !== 1 ? "s" : ""}${invalidRows.length > 0 ? ` — skip ${invalidRows.length}` : ""}`
    : hasInput ? "Fix errors to continue"
    : mode === "file" ? "Choose a file above" : "Paste CSV above";

  const inCell: React.CSSProperties = { background: "transparent", border: "none", outline: "none", color: "var(--text-primary)", fontFamily: "var(--font-body)", fontSize: "12px", width: "100%", padding: "1px 0" };
  const inMono: React.CSSProperties = { ...inCell, fontFamily: "var(--font-mono)" };

  const modal = open ? (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(0,0,0,0.65)", display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }}
      onClick={e => { if (e.target === e.currentTarget) { setOpen(false); reset(); } }}
    >
      <div style={{
        width: "100%", maxWidth: "660px", maxHeight: "90vh",
        background: "var(--bg-elevated)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-xl, 16px)",
        display: "flex", flexDirection: "column",
        boxShadow: "0 24px 64px rgba(0,0,0,0.5)",
        overflow: "hidden",
      }}>
        {/* Modal header */}
        <div style={{ padding: "20px 24px 0", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "16px" }}>
            <div>
              <div style={{ fontSize: "16px", fontWeight: 600, color: "var(--text-primary)", lineHeight: 1.3 }}>Import Holdings</div>
              <div style={{ fontSize: "12px", color: "var(--text-tertiary)", marginTop: "3px" }}>
                New tickers are added; existing tickers update shares and cost basis.
              </div>
            </div>
            <button type="button" onClick={() => { setOpen(false); reset(); }} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", padding: "4px", borderRadius: "6px", lineHeight: 1, marginTop: "2px" }}>
              <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
            </button>
          </div>

          {/* Tabs */}
          <div style={{ display: "flex", gap: "0", borderBottom: "1px solid var(--border-subtle)" }}>
            {(["file", "paste"] as InputMode[]).map(m => (
              <button key={m} type="button" onClick={() => switchMode(m)} style={{
                padding: "8px 18px", border: "none", background: "none", cursor: "pointer",
                fontSize: "13px", fontWeight: 500, fontFamily: "var(--font-body)",
                color: mode === m ? "var(--text-primary)" : "var(--text-muted)",
                borderBottom: mode === m ? "2px solid var(--brand-blue)" : "2px solid transparent",
                marginBottom: "-1px", transition: "color 0.15s, border-color 0.15s",
              }}>
                {m === "file" ? "Upload File" : "Paste CSV"}
              </button>
            ))}
          </div>
        </div>

        {/* Scrollable body */}
        <div style={{ padding: "18px 24px 20px", overflowY: "auto", flex: 1 }}>

          {/* Column guide */}
          <div style={{ marginBottom: "14px", display: "flex", alignItems: "center", flexWrap: "wrap", gap: "6px" }}>
            <span style={{ fontSize: "11px", color: "var(--text-muted)", marginRight: "2px" }}>Columns:</span>
            {[["ticker *", true], ["shares *", true], ["average_cost_basis *", true], ["company_name", false], ["asset_type", false]].map(([label, req]) => (
              <span key={label as string} style={{ fontFamily: "var(--font-mono)", fontSize: "10px", padding: "2px 8px", borderRadius: "999px", background: req ? "rgba(37,99,235,0.12)" : "var(--bg-surface)", color: req ? "var(--brand-blue)" : "var(--text-muted)", border: `1px solid ${req ? "rgba(37,99,235,0.25)" : "var(--border-subtle)"}` }}>
                {label as string}
              </span>
            ))}
            <button type="button" onClick={downloadTemplate} style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "3px", fontSize: "11px", color: "var(--text-tertiary)", background: "none", border: "1px solid var(--border-subtle)", borderRadius: "6px", padding: "2px 8px", cursor: "pointer" }}>
              <svg width="10" height="10" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
              Template
            </button>
          </div>

          {/* File input */}
          {mode === "file" && (
            <div style={{ marginBottom: "16px" }}>
              <div
                role="button" tabIndex={0}
                onClick={() => fileRef.current?.click()}
                onKeyDown={e => { if (e.key === "Enter" || e.key === " ") fileRef.current?.click(); }}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "center", gap: "10px",
                  padding: "28px 20px",
                  background: "var(--bg-surface)",
                  border: "1.5px dashed var(--border-strong)",
                  borderRadius: "var(--radius-md)",
                  cursor: "pointer", userSelect: "none",
                  transition: "border-color 0.15s, background 0.15s",
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--brand-blue)"; e.currentTarget.style.background = "rgba(37,99,235,0.04)"; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--border-strong)"; e.currentTarget.style.background = "var(--bg-surface)"; }}
              >
                <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" style={{ color: fileName ? "var(--brand-blue)" : "var(--text-muted)", flexShrink: 0 }}>
                  <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: "13px", fontWeight: 500, color: fileName ? "var(--text-primary)" : "var(--text-secondary)" }}>
                    {fileName || "Click to choose a .csv file"}
                  </div>
                  {!fileName && <div style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "2px" }}>or switch to Paste CSV to paste directly</div>}
                </div>
                {fileName && (
                  <button type="button" onClick={e => { e.stopPropagation(); reset(); }} style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", padding: "2px", borderRadius: "4px" }}>
                    <svg width="13" height="13" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                  </button>
                )}
              </div>
              <input ref={fileRef} type="file" accept=".csv,text/csv,text/plain" onChange={handleFile} style={{ display: "none" }} tabIndex={-1} />
              {fileName && rows.length === 0 && (
                <p style={{ fontSize: "11px", color: "var(--amber)", marginTop: "8px" }}>
                  File loaded but no rows detected. Make sure the first line is a header with at least: <span style={{ fontFamily: "var(--font-mono)" }}>ticker, shares, average_cost_basis</span>.
                </p>
              )}
            </div>
          )}

          {/* Paste textarea */}
          {mode === "paste" && (
            <div style={{ marginBottom: "16px" }}>
              <textarea
                value={pastedText}
                onChange={handlePasteChange}
                placeholder={"ticker,shares,average_cost_basis\nAAPL,10,180.50\nMSFT,5,350.00\nVTI,20,220.00"}
                rows={5}
                style={{
                  width: "100%", boxSizing: "border-box", padding: "12px 14px",
                  background: "var(--bg-surface)", border: "1.5px solid var(--border-strong)",
                  borderRadius: "var(--radius-md)", color: "var(--text-primary)",
                  fontFamily: "var(--font-mono)", fontSize: "12px", lineHeight: 1.6,
                  resize: "vertical", outline: "none",
                }}
                onFocus={e => (e.currentTarget.style.borderColor = "var(--brand-blue)")}
                onBlur={e => (e.currentTarget.style.borderColor = "var(--border-strong)")}
              />
              {pastedText.trim() && rows.length === 0 && (
                <p style={{ fontSize: "11px", color: "var(--amber)", marginTop: "6px" }}>
                  Could not detect rows. Make sure the first line is a header row (e.g. <span style={{ fontFamily: "var(--font-mono)" }}>ticker,shares,average_cost_basis</span>).
                </p>
              )}
              {/* PDF tip */}
              <div style={{ marginTop: "10px", padding: "10px 14px", background: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.15)", borderRadius: "var(--radius-sm)", display: "flex", gap: "8px" }}>
                <span style={{ fontSize: "12px", flexShrink: 0 }}>💡</span>
                <div style={{ fontSize: "11px", color: "var(--text-secondary)", lineHeight: 1.5 }}>
                  <strong style={{ color: "var(--text-primary)" }}>Got a PDF?</strong> Paste it into ChatGPT and ask:{" "}
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: "10px", color: "var(--text-tertiary)" }}>&ldquo;Convert my holdings to CSV: ticker, shares, average_cost_basis. CSV only.&rdquo;</span>{" "}
                  Then paste the result here.
                </div>
              </div>
            </div>
          )}

          {/* PDF tip for file mode */}
          {mode === "file" && rows.length === 0 && (
            <div style={{ marginBottom: "16px", padding: "10px 14px", background: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.15)", borderRadius: "var(--radius-sm)", display: "flex", gap: "8px" }}>
              <span style={{ fontSize: "12px", flexShrink: 0 }}>💡</span>
              <div style={{ fontSize: "11px", color: "var(--text-secondary)", lineHeight: 1.5 }}>
                <strong style={{ color: "var(--text-primary)" }}>Got a PDF from Edward Jones or another broker?</strong> Paste it into ChatGPT and ask:{" "}
                <span style={{ fontFamily: "var(--font-mono)", fontSize: "10px", color: "var(--text-tertiary)" }}>&ldquo;Convert my holdings to CSV: ticker, shares, average_cost_basis. CSV only.&rdquo;</span>{" "}
                Then use the <strong>Paste CSV</strong> tab.
              </div>
            </div>
          )}

          {/* Editable preview table */}
          {rows.length > 0 && (
            <div style={{ marginBottom: "6px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
                <div style={{ fontSize: "12px", fontWeight: 500, color: "var(--text-secondary)" }}>
                  {validRows.length > 0
                    ? <><span style={{ color: "var(--green)" }}>{validRows.length} ready</span>{invalidRows.length > 0 && <span style={{ color: "var(--red)", marginLeft: "8px" }}>{invalidRows.length} need fixing</span>}</>
                    : <span style={{ color: "var(--red)" }}>All rows have errors — edit below to fix</span>
                  }
                </div>
                <span style={{ fontSize: "10px", color: "var(--text-muted)" }}>Click any cell to edit</span>
              </div>
              <div style={{ borderRadius: "var(--radius-md)", border: "1px solid var(--border-subtle)", overflow: "hidden" }}>
                <div style={{ maxHeight: "240px", overflowY: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
                    <thead>
                      <tr style={{ background: "var(--bg-surface)" }}>
                        {["Ticker", "Shares", "Avg Cost", "Company", "Type", ""].map(h => (
                          <th key={h} style={{ padding: "8px 10px", textAlign: "left", fontWeight: 600, color: "var(--text-tertiary)", fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.06em", borderBottom: "1px solid var(--border-subtle)", whiteSpace: "nowrap" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map(row => {
                        const err = row.error;
                        return (
                          <tr key={row.id} style={{ background: err ? "rgba(239,68,68,0.04)" : "transparent", borderBottom: "1px solid var(--border-subtle)" }}>
                            <td style={{ padding: "5px 8px", minWidth: "70px" }}>
                              <input style={{ ...inMono, fontWeight: 600, color: err === "Invalid ticker" ? "var(--red)" : "var(--text-primary)", textTransform: "uppercase" }}
                                value={row.ticker} onChange={e => updateRowField(row.id, "ticker", e.target.value)} placeholder="AAPL" spellCheck={false} />
                            </td>
                            <td style={{ padding: "5px 8px", minWidth: "64px" }}>
                              <input style={{ ...inMono, color: err === "Invalid shares" ? "var(--red)" : "var(--text-secondary)" }}
                                value={row.sharesRaw} onChange={e => updateRowField(row.id, "sharesRaw", e.target.value)} placeholder="0" inputMode="decimal" />
                            </td>
                            <td style={{ padding: "5px 8px", minWidth: "74px" }}>
                              <input style={{ ...inMono, color: err === "Invalid cost basis" ? "var(--red)" : "var(--text-secondary)" }}
                                value={row.costRaw} onChange={e => updateRowField(row.id, "costRaw", e.target.value)} placeholder="0.00" inputMode="decimal" />
                            </td>
                            <td style={{ padding: "5px 8px", minWidth: "100px" }}>
                              <input style={{ ...inCell, color: "var(--text-muted)" }} value={row.company_name} onChange={e => updateRowField(row.id, "company_name", e.target.value)} placeholder="Optional" />
                            </td>
                            <td style={{ padding: "5px 8px", minWidth: "88px" }}>
                              <select value={row.asset_type} onChange={e => updateRowField(row.id, "asset_type", e.target.value)}
                                style={{ background: "transparent", border: "none", outline: "none", color: "var(--text-muted)", fontFamily: "var(--font-body)", fontSize: "12px", cursor: "pointer", width: "100%", padding: 0 }}>
                                {VALID_ASSET_TYPES.map(t => <option key={t} value={t} style={{ background: "var(--bg-elevated)" }}>{t}</option>)}
                              </select>
                            </td>
                            <td style={{ padding: "5px 8px", width: "48px" }}>
                              <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                                {err
                                  ? <span title={err} style={{ fontSize: "10px", color: "var(--red)" }}>⚠</span>
                                  : <svg width="11" height="11" viewBox="0 0 20 20" fill="var(--green)"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
                                }
                                <button type="button" onClick={() => removeRow(row.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", padding: "1px", opacity: 0.5, lineHeight: 1 }}
                                  onMouseEnter={e => (e.currentTarget.style.opacity = "1")} onMouseLeave={e => (e.currentTarget.style.opacity = "0.5")}>
                                  <svg width="11" height="11" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
              <button type="button" onClick={addBlankRow} style={{ marginTop: "8px", display: "inline-flex", alignItems: "center", gap: "4px", fontSize: "11px", color: "var(--text-muted)", background: "none", border: "none", cursor: "pointer", padding: "2px 0" }}
                onMouseEnter={e => (e.currentTarget.style.color = "var(--text-secondary)")} onMouseLeave={e => (e.currentTarget.style.color = "var(--text-muted)")}>
                <svg width="11" height="11" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" /></svg>
                Add row manually
              </button>
            </div>
          )}

          {/* Result banner */}
          {result && (
            <div style={{ marginTop: "12px", padding: "12px 14px", borderRadius: "var(--radius-sm)", background: result.errors.length > 0 ? "rgba(245,158,11,0.06)" : "rgba(0,211,149,0.06)", border: `1px solid ${result.errors.length > 0 ? "rgba(245,158,11,0.2)" : "rgba(0,211,149,0.2)"}` }}>
              <div style={{ fontSize: "13px", fontWeight: 500, color: result.errors.length > 0 ? "var(--amber)" : "var(--green)", marginBottom: result.errors.length > 0 ? "6px" : 0 }}>
                {result.imported > 0 && `${result.imported} holding${result.imported !== 1 ? "s" : ""} added`}
                {result.imported > 0 && result.updated > 0 && ", "}
                {result.updated > 0 && `${result.updated} updated`}
                {result.imported === 0 && result.updated === 0 && "No changes made"}
              </div>
              {result.errors.map((e, i) => <div key={i} style={{ fontSize: "11px", color: "var(--red)", marginTop: "3px" }}>{e.ticker ? `${e.ticker}: ` : ""}{e.message}</div>)}
            </div>
          )}
        </div>

        {/* Sticky footer */}
        <div style={{ padding: "14px 24px", borderTop: "1px solid var(--border-subtle)", display: "flex", gap: "10px", flexShrink: 0, background: "var(--bg-elevated)" }}>
          <button type="button" onClick={handleImport} disabled={validRows.length === 0 || isPending}
            style={{
              flex: 1, padding: "10px 0", borderRadius: "var(--radius-md)", border: "none",
              background: validRows.length > 0 ? "var(--brand-blue)" : "var(--bg-surface)",
              color: validRows.length > 0 ? "#fff" : "var(--text-muted)",
              fontSize: "13px", fontWeight: 600, cursor: validRows.length > 0 && !isPending ? "pointer" : "not-allowed",
              fontFamily: "var(--font-body)", opacity: isPending ? 0.7 : 1, transition: "opacity 0.15s",
            }}>
            {importLabel}
          </button>
          <button type="button" onClick={() => { setOpen(false); reset(); }}
            style={{ padding: "10px 20px", borderRadius: "var(--radius-md)", border: "1px solid var(--border)", background: "transparent", color: "var(--text-tertiary)", fontSize: "13px", cursor: "pointer", fontFamily: "var(--font-body)" }}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  ) : null;

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="bt-btn bt-btn-ghost bt-btn-sm" style={{ gap: "5px" }}>
        <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
        </svg>
        Import CSV
      </button>
      {typeof document !== "undefined" && modal ? createPortal(modal, document.body) : null}
    </>
  );
}
