import type { PrefixMapping } from "../server/prefix-route-types";
import type { RouteInfo } from "./route-types";

/**
 * Prefix-mapping construction and seed-config parsing: both work on
 * declarative inputs alone — analyzed routes, source options, the user's seed
 * config — with no dependency on the running server.
 */

/** Seed data configuration */
export interface SeedConfig {
  /** Default records per collection (default: 20) */
  count?: number | undefined;
  /** Per-group overrides: `{ products: { count: 100 } }` */
  [groupName: string]: { count: number } | number | undefined;
}

/**
 * Build PrefixMappings from analyzed routes: one for each group at each
 * prefix its routes stand at. Includes httpMethod on each MappedEndpoint so
 * static sub-paths can be registered with the correct HTTP verb.
 *
 * The mappings come most specific first — more segments, then a fixed one
 * before a parameter — so a group inside another, `/billing/invoices`, is
 * registered before its outer group's `/billing/:id` could take it.
 */
export function buildPrefixMappings(
  _source: Record<string, unknown>,
  routes: RouteInfo[],
): PrefixMapping[] {
  const mappings: PrefixMapping[] = [];
  const byGroup = new Map<string, PrefixMapping>();

  for (const route of routes) {
    const ep = {
      name: route.endpoint,
      operation: route.operation,
      path: route.path,
      httpMethod: route.httpMethod,
      transport: route.transport,
      isChannel: route.isChannel,
      ...(route.channel && { channel: route.channel }),
    };
    const key = `${route.group}\u0000${route.prefix}`;
    const existing = byGroup.get(key);
    if (existing) {
      existing.methods.push(route.endpoint);
      existing.endpoints?.push(ep);
      continue;
    }

    const mapping: PrefixMapping = {
      prefix: route.prefix,
      group: route.group,
      methods: [route.endpoint],
      endpoints: [ep],
      ...(route.exact && { exact: true }),
    };
    byGroup.set(key, mapping);
    mappings.push(mapping);
  }

  return mappings.sort(byPrefixSpecificity);
}

/* More segments first, then position by position a fixed segment before a parameter. */
function byPrefixSpecificity(a: PrefixMapping, b: PrefixMapping): number {
  const segments = (prefix: string) => prefix.split("/").filter(Boolean);
  const [left, right] = [segments(a.prefix), segments(b.prefix)];
  if (left.length !== right.length) return right.length - left.length;
  const rank = (parts: string[]) =>
    parts.map((part) => (part.startsWith(":") ? "1" : "0")).join("");
  return rank(left).localeCompare(rank(right));
}

/** Flatten user-supplied seed config into a `{ groupName: count }` map */
export function parseSeedConfig(seed?: SeedConfig): Record<string, number> {
  if (!seed) return {};

  const overrides: Record<string, number> = {};
  for (const [key, value] of Object.entries(seed)) {
    if (key === "count") continue;
    if (typeof value === "number") {
      overrides[key] = value;
    } else if (value && typeof value === "object" && "count" in value) {
      overrides[key] = value.count;
    }
  }
  return overrides;
}
