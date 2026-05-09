import type { ParseResult } from "./types";

// Matches: AAPL 12.53 | AAPL,12.53 | AAPL: 12.53 | AAPL	12.53
const LINE_RE = /^([A-Za-z][A-Za-z0-9.]{0,5})\s*[,:;\t ]+\s*([0-9]+(?:\.[0-9]+)?)/;

export function parsePastedHoldings(text: string): ParseResult {
  const lines = text.split(/\r?\n/);
  const holdings: ParseResult["holdings"] = [];
  let ignoredRows = 0;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith("#") || line.startsWith("//")) continue;

    const match = line.match(LINE_RE);
    if (!match) { ignoredRows++; continue; }

    const ticker = match[1].toUpperCase();
    const shares = parseFloat(match[2]);

    if (!isFinite(shares) || shares <= 0) { ignoredRows++; continue; }
    if (holdings.some((h) => h.ticker === ticker)) { ignoredRows++; continue; }

    holdings.push({ ticker, shares });
  }

  if (holdings.length === 0 && lines.some((l) => l.trim())) {
    return {
      holdings: [],
      detectedBroker: null,
      cashDetected: false,
      errors: ["No valid holdings found. Use one per line: AAPL 12.53"],
      ignoredRows,
    };
  }

  return {
    holdings,
    detectedBroker: null,
    cashDetected: false,
    errors: [],
    ignoredRows,
  };
}
