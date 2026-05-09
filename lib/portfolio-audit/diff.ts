import type { DiffItem, DiffResult, ParsedHolding } from "./parsers/types";

// Differences smaller than this are treated as noise and ignored
const SHARE_THRESHOLD = 0.01;

export function computeDiff(
  currentHoldings: Array<{ ticker: string; shares: number }>,
  importedHoldings: ParsedHolding[],
): DiffResult {
  const currentMap = new Map<string, number>();
  for (const h of currentHoldings) {
    currentMap.set(h.ticker.toUpperCase(), Number(h.shares));
  }

  const importedMap = new Map<string, number>();
  for (const h of importedHoldings) {
    importedMap.set(h.ticker.toUpperCase(), h.shares);
  }

  const allTickers = new Set([...currentMap.keys(), ...importedMap.keys()]);
  const result: DiffResult = { added: [], changed: [], removed: [], ignored: [] };

  for (const ticker of allTickers) {
    const current = currentMap.has(ticker) ? currentMap.get(ticker)! : null;
    const imported = importedMap.has(ticker) ? importedMap.get(ticker)! : null;

    if (current === null && imported !== null) {
      result.added.push({
        ticker,
        currentShares: null,
        importedShares: imported,
        delta: imported,
        action: "add",
      });
    } else if (current !== null && imported === null) {
      result.removed.push({
        ticker,
        currentShares: current,
        importedShares: null,
        delta: -current,
        action: "remove",
      });
    } else if (current !== null && imported !== null) {
      const delta = imported - current;
      if (Math.abs(delta) < SHARE_THRESHOLD) {
        result.ignored.push({
          ticker,
          currentShares: current,
          importedShares: imported,
          delta,
          action: "ignore",
        });
      } else {
        result.changed.push({
          ticker,
          currentShares: current,
          importedShares: imported,
          delta,
          action: "change",
        });
      }
    }
  }

  const byTicker = (a: DiffItem, b: DiffItem) => a.ticker.localeCompare(b.ticker);
  result.added.sort(byTicker);
  result.changed.sort(byTicker);
  result.removed.sort(byTicker);
  result.ignored.sort(byTicker);

  return result;
}

export function countMeaningfulChanges(diff: DiffResult): number {
  return diff.added.length + diff.changed.length + diff.removed.length;
}
