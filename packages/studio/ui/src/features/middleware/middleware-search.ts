/** The Middleware page's two views: every middleware at once, or one request's chain. */
export type MiddlewareView = "overview" | "chain";

/** The Middleware page's own part of its address: each left out while it is the default. */
export interface MiddlewareSearch {
  /** The chain inspector, rather than the overview. */
  view?: "chain" | undefined;
  /** The request whose chain is traced — named apart from the inspector's `req`, which shares the address. */
  trace?: string | undefined;
}

/**
 * Read the Middleware page's parameters from its address: the chain view,
 * and the request it traces.
 *
 * @param raw - The address's parameters
 * @returns The page's parameters
 * @example
 * ```ts
 * validateMiddlewareSearch({ view: "chain", trace: "r1" }); // { view: "chain", trace: "r1" }
 * ```
 */
export function validateMiddlewareSearch(raw: Record<string, unknown>): MiddlewareSearch {
  const search: MiddlewareSearch = {};
  if (raw.view === "chain") search.view = "chain";
  if (typeof raw.trace === "string" && raw.trace) search.trace = raw.trace;
  return search;
}
