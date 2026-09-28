import type { CrudOperation, RouteInfo } from "./route-types";
import { extractPaginatedItemSchema, extractShape, unwrapArraySchema } from "./schema-introspect";

/* Record endpoints whose answer is one of the group's records, most telling first. */
const RECORD_OPERATIONS: readonly CrudOperation[] = [
  "get",
  "replace",
  "update",
  "create",
  "upsert",
];

/**
 * The schema each group's collection is seeded from, by group.
 *
 * A group with a list endpoint is seeded from the best one's items — even
 * one with no schema, whose records are then generated plainly. A group
 * without one is seeded from the record its record endpoints answer with,
 * or from the items a sub-path read lists (`findByStatus`), so a source
 * such as the Petstore, which lists nothing at its group roots, still starts
 * with records. A group with none of these is left out: its collection
 * starts empty.
 *
 * @param routes Every analyzed route of the source
 * @returns Each seeded group's item schema, `undefined` for a schemaless list
 * @example
 * ```ts
 * seedSources(analyzeRoutes(petstore)).get("pet"); // the Pet schema, from getPetById
 * ```
 */
export function seedSources(routes: RouteInfo[]): Map<string, unknown> {
  const sources = new Map<string, unknown>();
  for (const [group, route] of bestListEndpoints(routes)) {
    sources.set(group, itemSchemaOf(route.responseSchema));
  }
  for (const route of routes) {
    if (sources.has(route.group)) continue;
    const schema = recordSchemaOf(routes.filter((r) => r.group === route.group));
    if (schema !== undefined) sources.set(route.group, schema);
  }
  return sources;
}

/** A list response's item schema — of a direct array or a pagination wrapper */
export function itemSchemaOf(responseSchema: unknown): unknown {
  return (
    unwrapArraySchema(responseSchema) ??
    extractPaginatedItemSchema(responseSchema) ??
    responseSchema
  );
}

function recordSchemaOf(groupRoutes: RouteInfo[]): unknown {
  for (const operation of RECORD_OPERATIONS) {
    const route = groupRoutes.find(
      (r) => r.operation === operation && extractShape(r.responseSchema) !== undefined,
    );
    if (route) return route.responseSchema;
  }
  const listing = groupRoutes.find(
    (r) =>
      r.transport === "http" &&
      r.httpMethod === "GET" &&
      extractShape(unwrapArraySchema(r.responseSchema)) !== undefined,
  );
  return listing ? unwrapArraySchema(listing.responseSchema) : undefined;
}

/**
 * Select the best list endpoint per group for seeding.
 * Prefers: root-path direct arrays > root-path wrappers > sub-path arrays.
 */
function bestListEndpoints(routes: RouteInfo[]): Map<string, RouteInfo> {
  const best = new Map<string, RouteInfo>();
  for (const route of routes) {
    if (route.operation !== "list") continue;
    const existing = best.get(route.group);
    if (!existing || isBetterSeedSource(route, existing)) best.set(route.group, route);
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
