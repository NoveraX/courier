import { TRANSPORT_KEYS, type TransportOptions } from "../http-client/transport-options";
import type { GroupOptions, PathOptions } from "../http-client/types";
import { pathJoin } from "../utils/path-join";
import type { GroupNode } from "./group-tree";

/**
 * The settings a group's endpoints take from it and every group above it:
 * the prefixes joined in order, each group's path options merged over the
 * ones above it, and the nearest `expose` that is set — and, one by one,
 * the nearest `fetch`, `webSocket`, `dispatcher`, `proxy`, `tls` and
 * `client` that are set.
 *
 * @param chain - The groups from the top one down
 * @returns The settings, as one group's
 * @example
 * ```ts
 * groupOptionsOf(groupChain(api, "billing.invoices") ?? []).prefix; // → "billing/invoices"
 * ```
 */
export function groupOptionsOf(chain: readonly GroupNode[]): GroupOptions {
  if (chain.length <= 1) return chain[0]?.options ?? {};
  const options = chain.map((group) => group.options ?? {});
  const pathOptions = options.flatMap((o) => (o.pathOptions ? [o.pathOptions] : []));
  const expose = options.findLast((o) => o.expose !== undefined)?.expose;
  return {
    prefix: pathJoin(options.map((o) => o.prefix ?? "")),
    ...(pathOptions.length > 0 && { pathOptions: mergedPathOptions(pathOptions) }),
    ...(expose !== undefined && { expose }),
    ...nearestTransport(options),
  };
}

/* Each transport option from the nearest group that sets it. */
function nearestTransport(options: readonly GroupOptions[]): TransportOptions {
  const transport: Record<string, unknown> = {};
  for (const key of TRANSPORT_KEYS) {
    const value = options.findLast((o) => o[key] !== undefined)?.[key];
    if (value !== undefined) transport[key] = value;
  }
  return transport as TransportOptions;
}

/* Each group's path options in turn, a lower group's values over a higher one's. */
function mergedPathOptions(all: readonly PathOptions[]): PathOptions {
  if (all.length === 1 && all[0]) return all[0];
  return async (request) => {
    const merged: Record<string, boolean | number | string | null | undefined> = {};
    for (const pathOptions of all) Object.assign(merged, await pathOptions(request));
    return merged;
  };
}
