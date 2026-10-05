import type { PairPreset } from "./compare-pairs";

/** What Compare shows of the two requests. */
export const COMPARE_TABS = ["response", "headers", "timing", "variables"] as const;
export type CompareTab = (typeof COMPARE_TABS)[number];

const PAIR_PRESETS: readonly PairPreset[] = ["failure", "slow", "latest"];

/** Compare's own part of its address: the two requests and what is shown, each left out while unset. */
export interface CompareSearch {
  /** The request on the left. */
  a?: string | undefined;
  /** The request on the right. */
  b?: string | undefined;
  /** What is shown — named apart from the inspector's `tab`, which shares the address. */
  show?: CompareTab | undefined;
  /** The ready-made pair last chosen; it stays chosen while a side is picked by hand. */
  pair?: PairPreset | undefined;
}

/**
 * Read Compare's parameters from its address: the two requests' ids, what
 * is shown when it is not the response, and the ready-made pair chosen.
 *
 * @param raw - The address's parameters
 * @returns Compare's parameters
 * @example
 * ```ts
 * validateCompareSearch({ a: "r1", b: "r2", show: "response", pair: "slow" }); // { a: "r1", b: "r2", pair: "slow" }
 * ```
 */
export function validateCompareSearch(raw: Record<string, unknown>): CompareSearch {
  const search: CompareSearch = {};
  if (typeof raw.a === "string" && raw.a) search.a = raw.a;
  if (typeof raw.b === "string" && raw.b) search.b = raw.b;
  const show = COMPARE_TABS.find((t) => t === raw.show);
  if (show && show !== "response") search.show = show;
  const pair = PAIR_PRESETS.find((p) => p === raw.pair);
  if (pair) search.pair = pair;
  return search;
}
