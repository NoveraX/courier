import { TRANSPORT_KEYS } from "../http-client/transport-options";
import type { GroupOptions, PathOptions } from "../http-client/types";
import { pathJoin } from "../utils/path-join";
import type { GroupNode } from "./group-tree";

/**
 * The settings a group's endpoints take from it and every group above it:
 * the prefixes joined in order, each group's path options merged over the
 * ones above it, the nearest `expose` and `cancelPrevious` that are set —
 * and, one by one, the nearest `fetch`, `webSocket`, `dispatcher`, `proxy`,
 * `tls` and `client` that are set.
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
  return {
    prefix: pathJoin(options.map((o) => o.prefix ?? "")),
    ...(pathOptions.length > 0 && { pathOptions: mergedPathOptions(pathOptions) }),
    ...nearestSettings(options),
  };
}

/* The settings a lower group's own replace rather than add to. */
const NEAREST_KEYS = ["expose", "cancelPrevious", ...TRANSPORT_KEYS] as const;

/* Each such setting from the nearest group that sets it. */
function nearestSettings(options: readonly GroupOptions[]): GroupOptions {
  const nearest: Record<string, unknown> = {};
  for (const key of NEAREST_KEYS) {
    const value = options.findLast((o) => o[key] !== undefined)?.[key];
    if (value !== undefined) nearest[key] = value;
  }
  return nearest as GroupOptions;
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
