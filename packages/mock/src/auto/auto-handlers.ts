import { isRecord } from "../is-record";
import { MockHttpError } from "../server/errors";
import type { MockStore } from "../store";
import type { MockRequestContext } from "../types";
import { makeListHandler } from "./auto-list-handler";
import { makeCustomHandler } from "./custom-handler";
import { generateRecords } from "./data-generator";
import {
  findRecord,
  freshId,
  idOf,
  recordKey,
  recordNotFound,
  typedLike,
  unusedId,
} from "./record-ids";
import type { RouteInfo } from "./route-types";
import { unwrapArraySchema } from "./schema-introspect";

/**
 * Per-operation handler factories for the auto-CRUD scenario.
 *
 * Each branch returns a `MockRequestContext` handler bound to a single
 * group/operation pair, or `undefined` if the route should not produce
 * an automatic handler (e.g. SSE/WS).
 */

type Handler = (ctx: MockRequestContext) => unknown;

/**
 * Build the auto-CRUD handler for a single route, or return `undefined`
 * when the route is not eligible: a stream or a channel, which is mocked
 * with `.stream()` or `.channel()`.
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
      return makeListHandler(route, () => store.collection(groupName).getAll());
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
    const vars = fieldsOf(ctx);
    const given = vars[col.idField];
    if ((typeof given === "string" || typeof given === "number") && col.getById(given)) {
      throw new MockHttpError(409, `${groupName} with id ${given} already exists`);
    }
    /* The fields the body leaves out are generated from the schema, so the
       record answered — and stored — is a whole one that passes the
       endpoint's own response schema, not the partial body as it came. */
    const generated = itemSchema ? (generateRecords(itemSchema, 1, col.count() + 1)[0] ?? {}) : {};
    const { [col.idField]: generatedId, ...defaults } = generated;
    const { [col.idField]: _given, ...fields } = vars;
    const id = given ?? freshId(col) ?? unusedId(col, generatedId);
    return col.create({ ...defaults, ...fields, [col.idField]: id });
  };
}

function makeUpdateHandler(store: MockStore, groupName: string, route: RouteInfo): Handler {
  return (ctx) => {
    const col = store.collection(groupName);
    const key = recordKey(ctx.variables, col, route.idParam);
    const record = findRecord(col, key);
    const { [col.idField]: _id, ...data } = fieldsOf(ctx);
    const updated = record && col.updateById(idOf(col, record), data);
    if (!updated) throw recordNotFound(groupName, key);
    return updated;
  };
}

/**
 * PUT replaces the record, as a real API does: fields the body leaves out
 * are gone, not merged in like PATCH, so a client relying on PUT to clear a
 * field behaves against the mock as it does in production.
 */
function makeUpsertHandler(store: MockStore, groupName: string, route: RouteInfo): Handler {
  return (ctx) => {
    const col = store.collection(groupName);
    const key = recordKey(ctx.variables, col, route.idParam);
    if (!key) throw new MockHttpError(400, `${groupName}: PUT needs an id`);
    const { [col.idField]: _id, ...body } = fieldsOf(ctx);
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

/* The fields a call sends, when its variables are an object; none otherwise. */
function fieldsOf(ctx: MockRequestContext): Record<string, unknown> {
  return isRecord(ctx.variables) ? ctx.variables : {};
}
