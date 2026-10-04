/**
 * Formatting helpers the audit hint rule modules share, such as the
 * `EndpointStats → AuditEndpoint` projection.
 */

import type { RequestEntry } from "../../store/types-request";
import type { AuditEndpoint, EndpointStats } from "./types";

/** Convert an `EndpointStats` row into the `AuditEndpoint` shape used by hint items. */
export function formatEndpoint(s: EndpointStats): AuditEndpoint {
  return {
    key: s.key,
    label: s.group ? `${s.source}.${s.group}.${s.method}` : `${s.source}.${s.method}`,
    requestIds: s.requestIds,
  };
}

/**
 * The call a request made, as the app's caller spells it.
 *
 * @param r - The request
 * @returns The call, e.g. `client.users.list()`
 *
 * @example
 * ```ts
 * callOf({ group: undefined, method: "health" }); // "client.health()"
 * ```
 */
export function callOf(r: Pick<RequestEntry, "group" | "method">): string {
  return `client.${r.group ? `${r.group}.` : ""}${r.method}()`;
}
