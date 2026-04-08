import type { MockStore } from "../store";
import { generateRecords } from "./data-generator";
import type { RouteInfo } from "./route-analyzer";
import { extractPaginatedItemSchema, unwrapArraySchema } from "./schema-introspect";

/**
 * Eager seed-time helpers for the auto layer.
 *
 * Extracted from `auto-scenario.ts` because seeding has a clear, isolated
 * responsibility: pick the best `list` endpoint per group and populate the
 * store from its response schema. Keeping it separate from request-time
 * handler logic makes both halves easier to read and test.
 */

/** Options for auto-generated scenario */
export interface AutoScenarioOptions {
  /** Default number of seed records per collection (default: 20) */
  seedCount?: number;
  /** Per-group seed count overrides */
  seedOverrides?: Record<string, number>;
}

/**
 * Seed all collections eagerly at startup.
 * Selects the best "list" endpoint per group: prefers root-path direct arrays
 * over pagination wrappers, regardless of declaration order.
 */
export function seedAllCollections(
  routes: RouteInfo[],
  store: MockStore,
  options: AutoScenarioOptions = {},
): void {
  const { seedCount = 20, seedOverrides = {} } = options;
  const bestPerGroup = selectBestListEndpoints(routes);

  for (const [groupName, route] of bestPerGroup) {
    const count = seedOverrides[groupName] ?? seedCount;
    seedCollection(store, groupName, route.responseSchema, count);
  }

  // Groups without a list endpoint — create empty collection
  const seeded = new Set(bestPerGroup.keys());
  for (const route of routes) {
    if (!seeded.has(route.group)) {
      seeded.add(route.group);
      store.collection(route.group, { idField: "id" });
    }
  }
}

/**
 * Select the best list endpoint per group for seeding.
 * Prefers: root-path direct arrays > root-path wrappers > sub-path arrays.
 */
function selectBestListEndpoints(routes: RouteInfo[]): Map<string, RouteInfo> {
  const best = new Map<string, RouteInfo>();

  for (const route of routes) {
    if (route.operation !== "list") continue;
    const existing = best.get(route.group);
    if (!existing || isBetterSeedSource(route, existing)) {
      best.set(route.group, route);
    }
  }
  return best;
}

function isBetterSeedSource(candidate: RouteInfo, current: RouteInfo): boolean {
  // Prefer endpoint with schema over schemaless
  if (candidate.responseSchema && !current.responseSchema) return true;
  if (!candidate.responseSchema && current.responseSchema) return false;

  const candidateRoot = !candidate.path || candidate.path === "/";
  const currentRoot = !current.path || current.path === "/";

  // Prefer root path (group's base URL)
  if (candidateRoot && !currentRoot) return true;
  if (!candidateRoot && currentRoot) return false;

  // Prefer direct array response over pagination wrapper
  const candidateIsArray = !!unwrapArraySchema(candidate.responseSchema);
  const currentIsArray = !!unwrapArraySchema(current.responseSchema);
  return candidateIsArray && !currentIsArray;
}

function seedCollection(
  store: MockStore,
  groupName: string,
  responseSchema: unknown,
  count: number,
): void {
  const col = store.collection(groupName, { idField: "id" });
  const itemSchema =
    unwrapArraySchema(responseSchema) ??
    extractPaginatedItemSchema(responseSchema) ??
    responseSchema;
  const records = generateRecords(itemSchema, count);
  col.seed(records);
}
