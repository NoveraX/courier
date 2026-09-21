/**
 * Declare what a browser may call through the proxy.
 *
 * The proxy addresses endpoints by name, and resolves that name against every
 * source the application declared — including the ones only server code was
 * meant to call. A boundary is where an application says which of them the
 * browser is allowed to reach, once, in a place a reviewer can read.
 *
 * The same declaration does both halves of the job. The server refuses
 * anything it does not name, answering exactly as it answers an unknown name.
 * The browser receives it *instead of* the source object, so the bundle
 * carries the names that were opened and nothing else — no upstream host, no
 * middleware, no path of an endpoint that was kept back.
 *
 * It is checked by the compiler rather than generated, so there is no build
 * step to run and nothing to drift: renaming an endpoint breaks the boundary
 * that still names the old one.
 */

import type { ExposablePath, ExposedEndpoint, ProxyBoundary } from "./boundary-types";
import { ENDPOINT_SCHEMA } from "./marker";

export interface BoundaryConfig<TApi> {
  /** The source's name in the registry, as `courier.config.ts` keys it. */
  source: string;
  /** Every endpoint the browser may call. Anything absent is refused. */
  expose: ReadonlyArray<ExposablePath<TApi>>;
}

/**
 * Declare the proxy boundary for one source.
 *
 * @param api - The source itself, for the compiler to check names against
 * @param config - The source's registry name and the endpoints to expose
 * @returns The descriptor the server gates on and the browser receives
 *
 * @example
 * ```ts
 * export const boundary = defineBoundary(api, {
 *   source: "api",
 *   expose: ["posts.list", "posts.feed"],
 * });
 * // "posts.lsit" — compile error. "admin.purge" — refused at runtime.
 * ```
 */
export function defineBoundary<TApi extends object>(
  api: TApi,
  config: BoundaryConfig<TApi>,
): ProxyBoundary {
  const endpoints: Record<string, ExposedEndpoint> = {};

  for (const path of config.expose) {
    const shape = wireShapeOf(api, String(path));
    if (shape) endpoints[String(path)] = shape;
  }

  return { source: config.source, endpoints };
}

/**
 * Read what the client needs to reach an endpoint, off the source at runtime.
 *
 * The compiler already proved the path exists, so a miss here means the value
 * did not match its own type — a hand-written object, a stale build. It is
 * dropped rather than guessed at: an endpoint the boundary cannot describe is
 * one the browser should not be told how to call.
 */
function wireShapeOf(api: object, path: string): ExposedEndpoint | undefined {
  const [head, tail] = path.split(".");
  if (!head) return undefined;

  const options = (api as { options?: { groups?: Record<string, unknown> } }).options;
  const holder = tail === undefined ? api : options?.groups?.[head];
  const name = tail ?? head;
  const endpoint = (holder as Record<string, unknown> | undefined)?.[name];
  if (!endpoint || typeof endpoint !== "object") return undefined;

  const schema = (endpoint as Record<symbol, WireSchema | undefined>)[ENDPOINT_SCHEMA];
  if (!schema) return undefined;

  if (schema.transport === "sse") return { transport: "sse" };
  if (schema.transport === "ws") {
    const bidirectional = schema.bidirectional === true || schema.receive !== undefined;
    return bidirectional ? { transport: "ws", bidirectional: true } : { transport: "ws" };
  }
  return {};
}

/** The parts of an endpoint's stamped metadata a boundary reads. */
interface WireSchema {
  transport?: "sse" | "ws";
  bidirectional?: boolean;
  receive?: unknown;
}
