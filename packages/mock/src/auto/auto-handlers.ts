import { MockHttpError } from "../server/errors";
import type { MockStore } from "../store";
import type { MockRequestContext } from "../types";
import { makeListHandler } from "./auto-list-handler";
import { generateRecords } from "./data-generator";
import { findRecord, freshId, idOf, recordKey, recordNotFound, typedLike } from "./record-ids";
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
      return makeListHandler(store, groupName, route);
    case "get":
      return makeGetHandler(store, groupName, route);
    case "create":
      return makeCreateHandler(store, groupName, route);
    case "update":
      return makeUpdateHandler(store, groupName, route);
    case "replace":
    case "upsert":
      return makeUpsertHandler(store, groupName, route);
    case "delete":
      return makeDeleteHandler(store, groupName, route);
    case "deleteAll":
      return makeDeleteAllHandler(store, groupName);
    case "custom":
      return makeCustomHandler(route);
    default:
      return undefined;
  }
}

function makeGetHandler(store: MockStore, groupName: string, route: RouteInfo): Handler {
  return (ctx) => {
    const col = store.collection(groupName);
    const key = recordKey(ctx.variables, col, route.idParam);
    const record = findRecord(col, key);
    if (!record) throw recordNotFound(groupName, key);
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
    const given = vars[col.idField];
    if ((typeof given === "string" || typeof given === "number") && col.getById(given)) {
      throw new MockHttpError(409, `${groupName} with id ${given} already exists`);
    }
    // Empty body + schema available → generate a realistic record rather than bare {id}
    const base =
      Object.keys(vars).length === 0 && itemSchema
        ? ((generateRecords(itemSchema, 1)[0] ?? {}) as Record<string, unknown>)
        : vars;
    const { [col.idField]: _generated, ...fields } = base;
    return col.create({ ...fields, [col.idField]: given ?? freshId(col) });
  };
}

function makeUpdateHandler(store: MockStore, groupName: string, route: RouteInfo): Handler {
  return (ctx) => {
    const col = store.collection(groupName);
    const key = recordKey(ctx.variables, col, route.idParam);
    const record = findRecord(col, key);
    const { [col.idField]: _id, ...data } = (ctx.variables ?? {}) as Record<string, unknown>;
    const updated = record && col.updateById(idOf(col, record), data);
    if (!updated) throw recordNotFound(groupName, key);
    return updated;
  };
}

/**
 * PUT replaces the record, as a real API does: fields the body leaves out
 * are gone. It used to merge like PATCH, so a client relying on PUT to clear
 * a field passed against the mock and failed in production.
 */
function makeUpsertHandler(store: MockStore, groupName: string, route: RouteInfo): Handler {
  return (ctx) => {
    const col = store.collection(groupName);
    const key = recordKey(ctx.variables, col, route.idParam);
    if (!key) throw new MockHttpError(400, `${groupName}: PUT needs an id`);
    const { [col.idField]: _id, ...body } = (ctx.variables ?? {}) as Record<string, unknown>;
    const record = findRecord(col, key);
    if (record) return col.replace(idOf(col, record), body);
    const id = key.field === col.idField ? typedLike(col, key.value) : freshId(col);
    return col.create({ ...body, [col.idField]: id });
  };
}

function makeDeleteHandler(store: MockStore, groupName: string, route: RouteInfo): Handler {
  return (ctx) => {
    const col = store.collection(groupName);
    const key = recordKey(ctx.variables, col, route.idParam);
    const record = findRecord(col, key);
    if (!record) throw recordNotFound(groupName, key);
    const id = idOf(col, record);
    col.deleteById(id);
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
