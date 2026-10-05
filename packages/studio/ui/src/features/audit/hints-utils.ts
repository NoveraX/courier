/**
 * Formatting helpers the audit hint rule modules share, such as the
 * `EndpointStats → AuditEndpoint` projection.
 */

import type { RequestEntry } from "@/store/types-request";
import type { AuditEndpoint, EndpointStats } from "./types";

/** Convert an `EndpointStats` row into the `AuditEndpoint` shape used by hint items. */
export function formatEndpoint(s: EndpointStats): AuditEndpoint {
  return { key: s.key, label: labelOf(s), requestIds: s.requestIds };
}

/**
 * An endpoint's full name, as a finding names it: its source, its group
 * when it has one, and its method.
 *
 * @param e - The endpoint, or a request to it
 * @returns The name, e.g. `api.users.getById`
 *
 * @example
 * ```ts
 * labelOf({ source: "api", group: undefined, method: "health" }); // "api.health"
 * ```
 */
export function labelOf(e: Pick<RequestEntry, "source" | "group" | "method">): string {
  return e.group ? `${e.source}.${e.group}.${e.method}` : `${e.source}.${e.method}`;
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
