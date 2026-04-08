/**
 * Shared formatting helpers used by audit hint rule modules.
 *
 * Extracted from `rules-hints.ts` so each category file can import the
 * single source of truth for the `EndpointStats → AuditEndpoint` projection
 * without re-defining it.
 */

import type { AuditEndpoint, EndpointStats } from "./types";

/** Convert an `EndpointStats` row into the `AuditEndpoint` shape used by hint items. */
export function formatEndpoint(s: EndpointStats): AuditEndpoint {
  return {
    key: s.key,
    label: s.group ? `${s.source}.${s.group}.${s.method}` : `${s.source}.${s.method}`,
    requestIds: s.requestIds,
  };
}
