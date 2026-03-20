import type { MockStore } from "../store";
import type { MockRequestContext, MockScenario, TypedMockFn } from "../types";
import { generateRecords } from "./data-generator";
import type { RouteInfo } from "./route-analyzer";

/** Options for auto-generated scenario */
export interface AutoScenarioOptions {
  /** Default number of seed records per collection (default: 20) */
  seedCount?: number;
  /** Per-group seed count overrides */
  seedOverrides?: Record<string, number>;
}

/**
 * Build a CRUD scenario from analyzed routes.
 *
 * Lazily seeds collections on first access — important for 300+ endpoints.
 * Each group gets its own collection in the store, with handlers for
 * list/get/create/update/delete operations.
 */
export function buildAutoScenario(
  routes: RouteInfo[],
  store: MockStore,
  options: AutoScenarioOptions = {},
): MockScenario {
  const { seedCount = 20, seedOverrides = {} } = options;
  const seededGroups = new Set<string>();

  // Group routes by group name
  const routesByGroup = new Map<string, RouteInfo[]>();
  for (const route of routes) {
    const existing = routesByGroup.get(route.group) ?? [];
    existing.push(route);
    routesByGroup.set(route.group, existing);
  }

  return {
    name: "auto-generated",
    apply(mock: TypedMockFn<any>) {
      for (const [groupName, groupRoutes] of routesByGroup) {
        registerGroupHandlers(
          mock,
          store,
          groupName,
          groupRoutes,
          seededGroups,
          seedOverrides[groupName] ?? seedCount,
        );
      }
    },
  };
}

function registerGroupHandlers(
  mock: TypedMockFn<any>,
  store: MockStore,
  groupName: string,
  routes: RouteInfo[],
  seededGroups: Set<string>,
  seedCount: number,
): void {
  for (const route of routes) {
    const handler = createHandler(store, groupName, route, seededGroups, seedCount);
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

function createHandler(
  store: MockStore,
  groupName: string,
  route: RouteInfo,
  seededGroups: Set<string>,
  seedCount: number,
): ((ctx: MockRequestContext) => unknown) | undefined {
  const ensureSeeded = () => {
    if (seededGroups.has(groupName)) return;
    seededGroups.add(groupName);
    seedCollection(store, groupName, route.responseSchema, seedCount);
  };

  switch (route.operation) {
    case "list":
      return () => {
        ensureSeeded();
        return store.collection(groupName).getAll();
      };

    case "get":
      return (ctx) => {
        ensureSeeded();
        const id = extractId(ctx.variables);
        const record = store.collection(groupName).getById(id);
        if (!record) throw new Error(`${groupName} with id ${id} not found`);
        return record;
      };

    case "create":
      return (ctx) => {
        ensureSeeded();
        const col = store.collection(groupName);
        const vars = (ctx.variables ?? {}) as Record<string, unknown>;
        const id = vars.id ?? col.count() + 1;
        return col.create({ ...vars, id } as Record<string, unknown>);
      };

    case "update":
      return (ctx) => {
        ensureSeeded();
        const id = extractId(ctx.variables);
        const vars = (ctx.variables ?? {}) as Record<string, unknown>;
        const { id: _id, ...data } = vars;
        const col = store.collection(groupName);
        const updated = col.update((q) => q.where({ id } as Record<string, unknown>), {
          data: data as Record<string, unknown>,
        });
        if (!updated) throw new Error(`${groupName} with id ${id} not found`);
        return updated;
      };

    case "replace":
    case "upsert":
      return (ctx) => {
        ensureSeeded();
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
        ensureSeeded();
        const id = extractId(ctx.variables);
        const deleted = store
          .collection(groupName)
          .delete((q) => q.where({ id } as Record<string, unknown>));
        if (!deleted) throw new Error(`${groupName} with id ${id} not found`);
        return { deleted: true, id };
      };

    case "deleteAll":
      return () => {
        const col = store.collection(groupName);
        const count = col.count();
        col.clear();
        return { deleted: count };
      };

    default:
      return undefined;
  }
}

/** Seed a collection with generated data from schema */
function seedCollection(
  store: MockStore,
  groupName: string,
  responseSchema: unknown,
  count: number,
): void {
  const col = store.collection(groupName, { idField: "id" });

  // Try to extract inner item schema from array schema
  const itemSchema = unwrapArraySchema(responseSchema) ?? responseSchema;
  const records = generateRecords(itemSchema, count);
  col.seed(records);
}

/** If schema is an array type, extract the inner element schema */
function unwrapArraySchema(schema: unknown): unknown {
  if (!schema || typeof schema !== "object") return undefined;

  // Zod v3: _def.typeName === "ZodArray" → _def.type (inner)
  const v3Def = (schema as { _def?: { typeName?: string; type?: unknown } })._def;
  if (v3Def?.typeName === "ZodArray") return v3Def.type;

  // Zod v4: _zod.def.type === "array" → _zod.def.element
  const v4Def = (schema as { _zod?: { def?: { type?: string; element?: unknown } } })._zod?.def;
  if (v4Def?.type === "array") return v4Def.element;

  // Valibot: type === "array" → item
  const valibotSchema = schema as { type?: string; item?: unknown };
  if (valibotSchema.type === "array") return valibotSchema.item;

  return undefined;
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
