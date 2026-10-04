import type { PrefixMapping } from "../server/prefix-route-types";
import type { RouteInfo } from "./route-types";

/**
 * Prefix-mapping construction and seed-config parsing.
 *
 * Extracted from `create-auto-server.ts` because both helpers operate purely
 * on declarative inputs (analyzed routes, source options, user seed config)
 * with no dependency on the running server. Keeping them out of the main
 * factory makes the orchestration in `createAutoMockServer` easier to follow.
 */

/** Seed data configuration */
export interface SeedConfig {
  /** Default records per collection (default: 20) */
  count?: number;
  /** Per-group overrides: `{ products: { count: 100 } }` */
  [groupName: string]: { count: number } | number | undefined;
}

/**
 * Build PrefixMappings from analyzed routes and source structure.
 * Includes httpMethod on each MappedEndpoint so static sub-paths
 * can be registered with the correct HTTP verb.
 */
export function buildPrefixMappings(
  source: Record<string, unknown>,
  routes: RouteInfo[],
): PrefixMapping[] {
  const opts = source.options as
    | { groups?: Record<string, { options?: { prefix?: string } }> }
    | undefined;
  const groups = opts?.groups ?? {};
  const groupNames = new Set(Object.keys(groups).filter((k) => k !== "options"));

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
    const existing = byGroup.get(route.group);
    if (existing) {
      existing.methods.push(route.endpoint);
      existing.endpoints?.push(ep);
      continue;
    }

    const isGrouped = groupNames.has(route.group);
    const prefix = isGrouped
      ? (groups[route.group]?.options?.prefix ?? `/${route.group}`)
      : `/${route.group}`;

    const mapping: PrefixMapping = {
      prefix,
      group: route.group,
      methods: [route.endpoint],
      endpoints: [ep],
    };
    byGroup.set(route.group, mapping);
    mappings.push(mapping);
  }

  return mappings;
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
