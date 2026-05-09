import type { ParseResult } from "./types";

// Column names that indicate a ticker/symbol
const TICKER_COLS = ["symbol", "instrument", "ticker", "sym", "stock"];
// Column names that indicate share quantity
const SHARES_COLS = ["quantity", "shares", "qty", "units", "amount"];

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      result.push(current.trim().replace(/^"|"$/g, ""));
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current.trim().replace(/^"|"$/g, ""));
  return result;
}

function normalizeHeader(h: string): string {
  return h.toLowerCase().replace(/[^a-z]/g, "");
}

function findColIdx(headers: string[], candidates: string[]): number {
  for (const candidate of candidates) {
    const idx = headers.findIndex((h) => normalizeHeader(h) === candidate);
    if (idx !== -1) return idx;
  }
  return -1;
}

function detectBroker(headers: string[]): string | null {
  const norm = headers.map(normalizeHeader);
  // "instrument" is a Robinhood-specific column name for the symbol
  if (norm.includes("instrument")) return "Robinhood";
  // Robinhood also exports with "averagecost" alongside quantity
  if (
    (norm.includes("symbol") || norm.includes("ticker")) &&
    norm.includes("quantity") &&
    (norm.includes("averagecost") || norm.includes("avgcost") || norm.includes("averagebuyingprice"))
  ) return "Robinhood";
  return null;
}

const CASH_TICKERS = new Set(["CASH", "USD", "CASHANDCASHEQUIVALENTS", "CASHMANAGEMENT", "MMFUNDS"]);
const SKIP_PREFIXES = ["TOTAL", "SUBTOTAL", "GRAND", "SUMMARY"];

export function parseRobinhoodCsv(text: string): ParseResult {
  const rawLines = text.split(/\r?\n/);

  // Find the first line that looks like a CSV header (has a comma and recognizable columns)
  let headerLineIdx = -1;
  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i].trim();
    if (!line || !line.includes(",")) continue;
    const cells = parseCSVLine(line);
    const norms = cells.map(normalizeHeader);
    if (
      norms.some((n) => TICKER_COLS.includes(n)) &&
      norms.some((n) => SHARES_COLS.includes(n))
    ) {
      headerLineIdx = i;
      break;
    }
  }

  if (headerLineIdx === -1) {
    return {
      holdings: [],
      detectedBroker: null,
      cashDetected: false,
      errors: [
        "Could not find ticker and shares columns. Expected columns like: Symbol/Instrument and Quantity/Shares.",
      ],
      ignoredRows: 0,
    };
  }

  const headers = parseCSVLine(rawLines[headerLineIdx]);
  const tickerIdx = findColIdx(headers, TICKER_COLS);
  const sharesIdx = findColIdx(headers, SHARES_COLS);
  const detectedBroker = detectBroker(headers);

  const holdings: ParseResult["holdings"] = [];
  let cashDetected = false;
  let ignoredRows = 0;

  for (let i = headerLineIdx + 1; i < rawLines.length; i++) {
    const line = rawLines[i].trim();
    if (!line) continue;

    const cells = parseCSVLine(line);
    const rawTicker = (cells[tickerIdx] ?? "")
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9./-]/g, "");

    if (!rawTicker) { ignoredRows++; continue; }

    // Cash row — skip but flag it
    if (CASH_TICKERS.has(rawTicker) || rawTicker.startsWith("CASH")) {
      cashDetected = true;
      continue;
    }

    // Summary / total rows
    if (SKIP_PREFIXES.some((p) => rawTicker.startsWith(p))) {
      ignoredRows++;
      continue;
    }

    // Sanity: real tickers are 1–6 chars (NYSE/NASDAQ rules)
    if (rawTicker.length > 6) { ignoredRows++; continue; }

    const rawShares = (cells[sharesIdx] ?? "").trim().replace(/[$,\s]/g, "");
    const shares = parseFloat(rawShares);

    if (!isFinite(shares) || shares <= 0) { ignoredRows++; continue; }

    // Deduplicate (keep first occurrence)
    if (holdings.some((h) => h.ticker === rawTicker)) { ignoredRows++; continue; }

    holdings.push({ ticker: rawTicker, shares });
  }

  if (holdings.length === 0) {
    return {
      holdings: [],
      detectedBroker,
      cashDetected,
      errors: ["No valid holdings found in the file. Check that the CSV contains ticker symbols and share quantities."],
      ignoredRows,
    };
  }

  return { holdings, detectedBroker, cashDetected, errors: [], ignoredRows };
}
