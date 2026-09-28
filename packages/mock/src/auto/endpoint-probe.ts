import { logger } from "@noverax/courier";
import type { SchemaMetadata } from "./route-types";
import { prop } from "./schema-introspect/prop";
import { schemaMetadataOf } from "./schema-metadata";

/**
 * Endpoint introspection helpers.
 *
 * Extracted from `route-analyzer.ts` to isolate the side-effecting probing
 * logic (calling endpoint functions with a Proxy `http` to capture method/path)
 * and the symbol-based schema metadata extraction. Keeps the analyzer focused
 * on traversal and assembly.
 */

const ENDPOINT_SCHEMA = Symbol.for("courier.endpoint.schema");

/**
 * Recover an endpoint's HTTP method and path.
 *
 * A descriptor already captured both when it was defined, so it answers
 * directly rather than running user code a second time.
 */
export function probeEndpoint(fn: unknown): {
  method?: string;
  path?: string;
} {
  if (typeof fn === "object" && fn !== null) {
    const method: unknown = Reflect.get(fn, "method");
    const path: unknown = Reflect.get(fn, "path");
    if (typeof method === "string") return { method, ...(typeof path === "string" && { path }) };
  }
  return probeCallable(fn);
}

function probeCallable(fn: unknown): {
  method?: string;
  path?: string;
} {
  if (typeof fn !== "function") return {};
  let method: string | undefined;
  let path: string | undefined;

  const handler: ProxyHandler<object> = {
    get: (_target, prop) => {
      if (typeof prop === "string") {
        method = prop;
      }
      return (...args: unknown[]) => {
        if (typeof args[0] === "string") path = args[0];
        return Promise.resolve({});
      };
    },
  };

  const mockHttp = new Proxy({}, handler);

  try {
    Reflect.apply(fn, undefined, [mockHttp, {}]);
  } catch (error) {
    /* The closure may throw on the stand-in it is probed with; the call it
       began has been read by then. */
    logger.debug("MockProbe", "An endpoint threw while it was probed", error);
  }

  return { method, path: path || undefined };
}

/**
 * The path a stream or channel is reached at, relative to its group: the
 * one its descriptor declares, which a direct client builds its URL from,
 * or its name when it declares none.
 *
 * @param endpoint The endpoint's descriptor
 * @param name     The endpoint's name in its group
 * @returns The group-relative path, without leading or trailing slashes
 * @example
 * ```ts
 * realtimePath(stream.get("ws-room"), "room"); // "ws-room"
 * ```
 */
export function realtimePath(endpoint: unknown, name: string): string {
  const declared = typeof endpoint === "object" && endpoint !== null ? prop(endpoint, "path") : "";
  const path = typeof declared === "string" ? declared.split("/").filter(Boolean).join("/") : "";
  return path || name;
}

/** Read the schema metadata symbol attached to an endpoint function */
export function extractSchema(fn: unknown): SchemaMetadata | undefined {
  if (fn === null || (typeof fn !== "function" && typeof fn !== "object")) return undefined;
  return schemaMetadataOf(Reflect.get(fn, ENDPOINT_SCHEMA));
}

/**
 * Recognise a value held by a source or group as an endpoint.
 *
 * A descriptor is identified by the wire closure it carries rather than by
 * being callable itself.
 */
export function isEndpoint(value: unknown): boolean {
  if (typeof value !== "object" || value === null) return false;
  return typeof Reflect.get(value, "probe") === "function";
}

/** Normalize a group prefix string: ensure leading "/" and no trailing "/" */
export function normalizePrefix(prefix: string): string {
  const trimmed = prefix.startsWith("/") ? prefix : `/${prefix}`;
  return trimmed.endsWith("/") ? trimmed.slice(0, -1) : trimmed;
}
