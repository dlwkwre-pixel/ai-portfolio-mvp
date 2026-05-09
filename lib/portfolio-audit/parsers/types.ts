export type ParsedHolding = {
  ticker: string;
  shares: number;
};

export type ParseResult = {
  holdings: ParsedHolding[];
  detectedBroker: string | null;
  cashDetected: boolean;
  errors: string[];
  ignoredRows: number;
};

export type DiffAction = "add" | "remove" | "change" | "ignore";

export type DiffItem = {
  ticker: string;
  currentShares: number | null;
  importedShares: number | null;
  delta: number;
  action: DiffAction;
};

export type DiffResult = {
  added: DiffItem[];
  changed: DiffItem[];
  removed: DiffItem[];
  ignored: DiffItem[];
};
