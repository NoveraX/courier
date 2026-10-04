import { pathShape } from "../server/path-shape";
import type { MockStore } from "../store";
import { generateRecords } from "./data-generator";
import type { RouteInfo } from "./route-types";
import { extractShape } from "./schema-introspect";
import { itemSchemaOf, seedSources } from "./seed-sources";

/**
 * Eager seed-time helpers for the auto layer: populate each group's
 * collection from the schema its endpoints answer with (see `seedSources`),
 * before any request is handled.
 */

/** Options for auto-generated scenario */
export interface AutoScenarioOptions {
  /** Default number of seed records per collection (default: 20) */
  seedCount?: number;
  /** Per-group seed count overrides */
  seedOverrides?: Record<string, number>;
}

/**
 * Seed all collections eagerly at startup: each group's collection gets
 * `seedCount` records — or its own count — generated from the schema
 * `seedSources` picks for it. A group with no schema to seed from gets an
 * empty collection.
 *
 * @param routes  Every analyzed route of the source
 * @param store   The store to seed
 * @param options How many records each collection starts with
 * @returns Nothing; the store's collections are seeded
 * @example
 * ```ts
 * seedAllCollections(analyzeRoutes(api), server.store, { seedCount: 5 });
 * ```
 */
export function seedAllCollections(
  routes: RouteInfo[],
  store: MockStore,
  options: AutoScenarioOptions = {},
): void {
  const { seedCount = 20, seedOverrides = {} } = options;
  const sources = seedSources(routes);

  for (const [groupName, itemSchema] of sources) {
    const count = seedOverrides[groupName] ?? seedCount;
    const col = collectionFor(store, groupName, itemSchema, routes);
    col.seed(generateRecords(itemSchema, count));
  }

  for (const route of routes) {
    if (sources.has(route.group) || store.has(route.group)) continue;
    collectionFor(store, route.group, itemSchemaOf(route.responseSchema), routes);
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
