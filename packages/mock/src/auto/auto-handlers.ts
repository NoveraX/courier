import { MockHttpError } from "../server/errors";
import type { MockStore } from "../store";
import type { MockRequestContext } from "../types";
import { generateRecords } from "./data-generator";
import type { RouteInfo } from "./route-analyzer";
import { unwrapArraySchema } from "./schema-introspect";

/**
 * Per-operation handler factories for the auto-CRUD scenario.
 *
 * Extracted from `auto-scenario.ts` so the dispatch switch — by far the
 * largest piece of behaviour in the auto layer — lives in its own file.
 * Each branch returns a `MockRequestContext` handler bound to a single
 * group/operation pair, or `undefined` if the route should not produce
 * an automatic handler (e.g. SSE/WS).
 */

type Handler = (ctx: MockRequestContext) => unknown;

/**
 * Build the auto-CRUD handler for a single route, or return `undefined`
 * when the route is not eligible (SSE/WS transport, or `custom` op
 * without an introspectable response schema).
 */
export function createHandler(
  store: MockStore,
  groupName: string,
  route: RouteInfo,
): Handler | undefined {
  // SSE/WS endpoints have no auto-CRUD handler — they require an explicit
  // override via mock("group", "method").stream() or .channel().
  if (route.transport === "sse" || route.transport === "ws") {
    return undefined;
  }

  switch (route.operation) {
    case "list":
      return () => store.collection(groupName).getAll();
    case "get":
      return makeGetHandler(store, groupName);
    case "create":
      return makeCreateHandler(store, groupName, route);
    case "update":
      return makeUpdateHandler(store, groupName);
    case "replace":
    case "upsert":
      return makeUpsertHandler(store, groupName);
    case "delete":
      return makeDeleteHandler(store, groupName);
    case "deleteAll":
      return makeDeleteAllHandler(store, groupName);
    case "custom":
      return makeCustomHandler(route);
    default:
      return undefined;
  }
}

function makeGetHandler(store: MockStore, groupName: string): Handler {
  return (ctx) => {
    const id = extractId(ctx.variables);
    const record = store.collection(groupName).getById(id);
    if (!record) throw new MockHttpError(404, `${groupName} with id ${id} not found`);
    return record;
  };
}

function makeCreateHandler(store: MockStore, groupName: string, route: RouteInfo): Handler {
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

function makeUpdateHandler(store: MockStore, groupName: string): Handler {
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
}

function makeUpsertHandler(store: MockStore, groupName: string): Handler {
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
}

function makeDeleteHandler(store: MockStore, groupName: string): Handler {
  return (ctx) => {
    const id = extractId(ctx.variables);
    const deleted = store
      .collection(groupName)
      .delete((q) => q.where({ id } as Record<string, unknown>));
    if (!deleted) throw new MockHttpError(404, `${groupName} with id ${id} not found`);
    return { deleted: true, id };
  };
}

function makeDeleteAllHandler(store: MockStore, groupName: string): Handler {
  return () => {
    const col = store.collection(groupName);
    const count = col.count();
    col.clear();
    return { deleted: count };
  };
}

function makeCustomHandler(route: RouteInfo): Handler | undefined {
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

/** Extract a record id from request variables, coercing numeric strings */
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
