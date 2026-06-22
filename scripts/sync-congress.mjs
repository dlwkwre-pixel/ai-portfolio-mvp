// Fetch the public House/Senate STOCK Act disclosures and write a trimmed, normalized
// snapshot to lib/market-data/congress-data.json. Run by .github/workflows/congress-sync.yml
// on a schedule (and on demand). Running from a GitHub Actions runner — a different network
// than Vercel's serverless functions, which the Stock Watcher S3 buckets were blocking.
//
// No API key, no secrets: just fetch + normalize + write a small JSON the app reads.

import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, "..", "lib", "market-data", "congress-data.json");

const SOURCES = [
  { chamber: "senate", url: "https://senate-stock-watcher-data.s3-us-west-2.amazonaws.com/aggregate/all_transactions.json", referer: "https://senatestockwatcher.com/" },
  { chamber: "house", url: "https://house-stock-watcher-data.s3-us-west-2.amazonaws.com/data/all_transactions.json", referer: "https://housestockwatcher.com/" },
];

const LOOKBACK_DAYS = 220;
const MAX_TRADES = 600;
const VALID_TICKER = /^[A-Z][A-Z.]{0,5}$/;

function amountMidpoint(raw) {
  if (!raw) return 0;
  const nums = String(raw).replace(/[$,]/g, "").match(/\d+(?:\.\d+)?/g);
  if (!nums) return 0;
  const vals = nums.map(Number).filter((n) => Number.isFinite(n));
  if (vals.length === 0) return 0;
  return vals.length === 1 ? vals[0] : (vals[0] + vals[1]) / 2;
}
function toIsoDate(raw) {
  if (!raw) return "";
  const s = String(raw).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
}
function normalizeType(raw) {
  const t = String(raw || "").toLowerCase();
  if (t.includes("purchase") || t === "buy") return "buy";
  if (t.includes("sale") || t.includes("sold") || t === "sell") return "sell";
  if (t.includes("exchange")) return "exchange";
  return null;
}
function cleanTicker(raw) {
  if (typeof raw !== "string") return null;
  const t = raw.trim().toUpperCase();
  if (!t || t === "--" || t === "N/A" || t.includes("<")) return null;
  return VALID_TICKER.test(t) ? t : null;
}

async function fetchArray(url, referer) {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
      Accept: "application/json,text/plain,*/*",
      Referer: referer,
      Origin: referer.replace(/\/$/, ""),
    },
  });
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  const data = await res.json();
  if (!Array.isArray(data)) throw new Error(`${url} -> not an array`);
  return data;
}

function normalize(chamber, rows) {
  const out = [];
  for (const r of rows) {
    const ticker = cleanTicker(r.ticker);
    const txType = normalizeType(r.type);
    if (!ticker || !txType) continue;
    const amountRange = String(r.amount ?? "").trim();
    const person = chamber === "house"
      ? String(r.representative ?? "").replace(/^Hon\.\s*/i, "").trim()
      : String(r.senator ?? "").trim();
    out.push({
      chamber,
      person: person || "Unknown",
      ticker,
      assetName: String(r.asset_description ?? "").trim().slice(0, 80),
      txType,
      amountRange,
      amountMid: amountMidpoint(amountRange),
      transactionDate: toIsoDate(r.transaction_date),
      disclosureDate: toIsoDate(r.disclosure_date),
      ptrLink: typeof r.ptr_link === "string" ? r.ptr_link : null,
    });
  }
  return out;
}

async function main() {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - LOOKBACK_DAYS);
  const cutoffIso = cutoff.toISOString().slice(0, 10);

  let all = [];
  let anyOk = false;
  for (const src of SOURCES) {
    try {
      const rows = await fetchArray(src.url, src.referer);
      const norm = normalize(src.chamber, rows);
      all = all.concat(norm);
      anyOk = true;
      console.log(`${src.chamber}: ${rows.length} rows -> ${norm.length} normalized`);
    } catch (e) {
      console.error(`${src.chamber} FAILED: ${e.message}`);
    }
  }

  if (!anyOk) {
    console.error("All sources failed — leaving existing data untouched.");
    process.exit(1);
  }

  const trades = all
    .filter((t) => t.transactionDate && t.transactionDate >= cutoffIso)
    .sort((a, b) => (a.transactionDate < b.transactionDate ? 1 : a.transactionDate > b.transactionDate ? -1 : 0))
    .slice(0, MAX_TRADES);

  const payload = { trades, updatedAt: new Date().toISOString() };
  await writeFile(OUT, JSON.stringify(payload, null, 0) + "\n");
  console.log(`Wrote ${trades.length} trades (since ${cutoffIso}) to ${OUT}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
