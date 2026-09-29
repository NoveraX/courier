import type { CompareTab } from "./types";

/** URL search params shape for /compare */
export interface CompareSearchParams {
  left?: string;
  right?: string;
  tab?: CompareTab;
}

const VALID_TABS = new Set<CompareTab>(["payload", "response", "headers", "timing"]);

export function validateCompareSearch(raw: Record<string, unknown>): CompareSearchParams {
  return {
    left: parseString(raw.left),
    right: parseString(raw.right),
    tab: parseTab(raw.tab),
  };
}

function parseString(v: unknown): string | undefined {
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

function parseTab(v: unknown): CompareTab | undefined {
  return typeof v === "string" && VALID_TABS.has(v as CompareTab) ? (v as CompareTab) : undefined;
}
