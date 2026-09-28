import { pathShape } from "../server/path-shape";
import type { MockStore } from "../store";
import { generateRecords } from "./data-generator";
import type { RouteInfo } from "./route-analyzer";
import { extractPaginatedItemSchema, extractShape, unwrapArraySchema } from "./schema-introspect";

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
    const itemSchema = itemSchemaOf(route.responseSchema);
    const col = collectionFor(store, groupName, itemSchema, routes);
    col.seed(generateRecords(itemSchema, count));
  }

  // Groups without a list endpoint — create empty collection
  const seeded = new Set(bestPerGroup.keys());
  for (const route of routes) {
    if (!seeded.has(route.group)) {
      seeded.add(route.group);
      collectionFor(store, route.group, itemSchemaOf(route.responseSchema), routes);
    }
  }
}

/**
 * The group's collection, created keyed by the field its records are named
 * by. A collection that exists keeps its key: one set in `overrides` must
 * survive a reset or a reseed.
 */
function collectionFor(
  store: MockStore,
  groupName: string,
  itemSchema: unknown,
  routes: RouteInfo[],
): ReturnType<MockStore["collection"]> {
  if (store.has(groupName)) return store.collection(groupName);
  return store.collection(groupName, { idField: idFieldOf(groupName, itemSchema, routes) });
}

/**
 * The field records are keyed by: `id` when they have one, otherwise the
 * parameter of the group's by-id route (`get(":petId")` → `petId`) when
 * the records carry it.
 */
function idFieldOf(groupName: string, itemSchema: unknown, routes: RouteInfo[]): string {
  const fields = new Set(Object.keys(extractShape(itemSchema) ?? {}));
  if (fields.has("id")) return "id";
  const param = routes.find(
    (route) =>
      route.group === groupName &&
      route.idParam !== undefined &&
      pathShape(route.path) === "record" &&
      fields.has(route.idParam),
  )?.idParam;
  return param ?? "id";
}

function itemSchemaOf(responseSchema: unknown): unknown {
  return (
    unwrapArraySchema(responseSchema) ??
    extractPaginatedItemSchema(responseSchema) ??
    responseSchema
  );
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
