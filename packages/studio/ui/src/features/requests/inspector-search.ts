import type { InspectorTab } from "./inspector-tabs";
import { isInspectorTab } from "./inspector-tabs";

/** What an address under the new shell says of the inspector: the request open in it, and its tab. */
export interface InspectorSearch {
  req?: string | undefined;
  tab?: InspectorTab | undefined;
  /** A request a mock answered, open in its own sheet in place of the inspector. */
  mreq?: string | undefined;
}

/**
 * Read the inspector's part of an address: a request id, a tab when it is
 * one of the inspector's, and the id of a request a mock answered.
 *
 * @param raw - The address's search parameters
 * @returns The inspector's parameters
 * @example
 * ```ts
 * validateInspectorSearch({ req: "r1", tab: "timing" }); // { req: "r1", tab: "timing" }
 * ```
 */
export function validateInspectorSearch(raw: Record<string, unknown>): InspectorSearch {
  const search: InspectorSearch = {};
  if (typeof raw.req === "string" && raw.req !== "") search.req = raw.req;
  if (isInspectorTab(raw.tab)) search.tab = raw.tab;
  if (typeof raw.mreq === "string" && raw.mreq !== "") search.mreq = raw.mreq;
  return search;
}
