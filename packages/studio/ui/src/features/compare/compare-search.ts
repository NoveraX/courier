/** What Compare shows of the two requests. */
export const COMPARE_TABS = ["response", "headers", "timing", "variables"] as const;
export type CompareTab = (typeof COMPARE_TABS)[number];

/** Compare's own part of its address: the two requests and what is shown, each left out while unset. */
export interface CompareSearch {
  /** The request on the left. */
  a?: string | undefined;
  /** The request on the right. */
  b?: string | undefined;
  /** What is shown — named apart from the inspector's `tab`, which shares the address. */
  show?: CompareTab | undefined;
}

/**
 * Read Compare's parameters from its address: the two requests' ids, and
 * what is shown when it is not the response.
 *
 * @param raw - The address's parameters
 * @returns Compare's parameters
 * @example
 * ```ts
 * validateCompareSearch({ a: "r1", b: "r2", show: "response" }); // { a: "r1", b: "r2" }
 * ```
 */
export function validateCompareSearch(raw: Record<string, unknown>): CompareSearch {
  const search: CompareSearch = {};
  if (typeof raw.a === "string" && raw.a) search.a = raw.a;
  if (typeof raw.b === "string" && raw.b) search.b = raw.b;
  const show = COMPARE_TABS.find((t) => t === raw.show);
  if (show && show !== "response") search.show = show;
  return search;
}
