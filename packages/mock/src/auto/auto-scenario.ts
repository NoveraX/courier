import { MockHttpError } from "../server/errors";
import type { MockStore } from "../store";
import type { MockRequestContext, MockScenario, TypedMockFn } from "../types";
import { generateRecords } from "./data-generator";
import type { RouteInfo } from "./route-analyzer";
import { extractPaginatedItemSchema, unwrapArraySchema } from "./schema-introspect";

/** Options for auto-generated scenario */
export interface AutoScenarioOptions {
  /** Default number of seed records per collection (default: 20) */
  seedCount?: number;
  /** Per-group seed count overrides */
  seedOverrides?: Record<string, number>;
}

/** Auto-scenario with late-bound store */
export interface AutoMockScenario extends MockScenario {
  /** Bind the store after server creation */
  bindStore(store: MockStore): void;
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
 * Build a CRUD scenario from analyzed routes.
 * Handlers work with pre-seeded store (no lazy init).
 */
export function buildAutoScenario(routes: RouteInfo[]): AutoMockScenario {
  let boundStore: MockStore | undefined;

  const routesByGroup = groupRoutesByName(routes);

  return {
    name: "auto-generated",

    bindStore(store: MockStore) {
      boundStore = store;
    },

    apply(mock: TypedMockFn<any>) {
      if (!boundStore) {
        throw new Error("[nexus-mock] Auto-scenario store not bound.");
      }
      for (const [groupName, groupRoutes] of routesByGroup) {
        for (const route of groupRoutes) {
          const handler = createHandler(boundStore, groupName, route);
          if (handler) {
            (
              mock as (
                g: string,
                m: string,
              ) => { returns: (fn: (ctx: MockRequestContext) => unknown) => void }
            )(groupName, route.endpoint).returns(handler);
          }
        }
      }
    },
  };
}

/**
 * Register auto-CRUD handlers directly via the given mock function.
 * Use this to populate the base layer in createAutoMockServer so handlers
 * survive scenario switches.
 */
export function buildAutoHandlers(
  routes: RouteInfo[],
  store: MockStore,
  mock: TypedMockFn<any>,
): void {
  const routesByGroup = groupRoutesByName(routes);
  for (const [groupName, groupRoutes] of routesByGroup) {
    for (const route of groupRoutes) {
      const handler = createHandler(store, groupName, route);
      if (handler) {
        (
          mock as (
            g: string,
            m: string,
          ) => { returns: (fn: (ctx: MockRequestContext) => unknown) => void }
        )(groupName, route.endpoint).returns(handler);
      }
    }
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function groupRoutesByName(routes: RouteInfo[]): Map<string, RouteInfo[]> {
  const map = new Map<string, RouteInfo[]>();
  for (const route of routes) {
    const existing = map.get(route.group) ?? [];
    existing.push(route);
    map.set(route.group, existing);
  }
  return map;
}

function createHandler(
  store: MockStore,
  groupName: string,
  route: RouteInfo,
): ((ctx: MockRequestContext) => unknown) | undefined {
  switch (route.operation) {
    case "list":
      return () => store.collection(groupName).getAll();

    case "get":
      return (ctx) => {
        const id = extractId(ctx.variables);
        const record = store.collection(groupName).getById(id);
        if (!record) throw new MockHttpError(404, `${groupName} with id ${id} not found`);
        return record;
      };

    case "create": {
      const itemSchema = route.responseSchema
        ? (unwrapArraySchema(route.responseSchema) ?? route.responseSchema)
        : undefined;
      return (ctx) => {
        const col = store.collection(groupName);
        const vars = (ctx.variables ?? {}) as Record<string, unknown>;
        const id = vars.id ?? col.count() + 1;
        // Empty body + schema available → generate a realistic record rather than bare {id}
        const base =
          Object.keys(vars).length === 0 && itemSchema
            ? ((generateRecords(itemSchema, 1)[0] ?? {}) as Record<string, unknown>)
            : vars;
        return col.create({ ...base, id } as Record<string, unknown>);
      };
    }

    case "update":
      return (ctx) => {
        const id = extractId(ctx.variables);
        const vars = (ctx.variables ?? {}) as Record<string, unknown>;
        const { id: _id, ...data } = vars;
        const updated = store
          .collection(groupName)
          .update((q) => q.where({ id } as Record<string, unknown>), {
            data: data as Record<string, unknown>,
          });
        if (!updated) throw new MockHttpError(404, `${groupName} with id ${id} not found`);
        return updated;
      };

    case "replace":
    case "upsert":
      return (ctx) => {
        const id = extractId(ctx.variables);
        const vars = (ctx.variables ?? {}) as Record<string, unknown>;
        const col = store.collection(groupName);
        const existing = col.getById(id);
        if (existing) {
          col.update((q) => q.where({ id } as Record<string, unknown>), {
            data: vars as Record<string, unknown>,
          });
          return { ...existing, ...vars };
        }
        return col.create({ ...vars, id } as Record<string, unknown>);
      };

    case "delete":
      return (ctx) => {
        const id = extractId(ctx.variables);
        const deleted = store
          .collection(groupName)
          .delete((q) => q.where({ id } as Record<string, unknown>));
        if (!deleted) throw new MockHttpError(404, `${groupName} with id ${id} not found`);
        return { deleted: true, id };
      };

    case "deleteAll":
      return () => {
        const col = store.collection(groupName);
        const count = col.count();
        col.clear();
        return { deleted: count };
      };

    case "custom": {
      // Generate a response from schema for static sub-path endpoints (e.g. "browse", "categories").
      // Without this, requests hit the route but find no handler → 404.
      if (!route.responseSchema) return undefined;
      const schema = route.responseSchema;
      const isArray = !!unwrapArraySchema(schema);
      return () => {
        const records = generateRecords(schema, isArray ? 5 : 1);
        return isArray ? records : records[0];
      };
    }

    default:
      return undefined;
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

function extractId(variables: unknown): string | number {
  if (!variables || typeof variables !== "object") return 0;
  const vars = variables as Record<string, unknown>;
  const raw = vars.id ?? vars.ID ?? vars.Id;
  if (typeof raw === "number") return raw;
  if (typeof raw === "string") {
    const num = Number(raw);
    return Number.isNaN(num) ? raw : num;
  }
  return 0;
}
