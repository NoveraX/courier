import type { InspectorSearch } from "./inspector-search";

/**
 * The inspector's part of an address — the request open, its tab, and a
 * request a mock answered — which a page keeps when it changes its own.
 *
 * @param search - The address's parameters
 * @returns The inspector's, alone
 * @example
 * ```ts
 * navigate({ search: (prev) => ({ ...inspectorOf(prev), q: "users" }) });
 * ```
 */
export function inspectorOf(search: InspectorSearch): InspectorSearch {
  return { req: search.req, tab: search.tab, mreq: search.mreq };
}
