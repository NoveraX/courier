/**
 * Turn the routes of an API into what a proxy client reads of it.
 *
 * `composeBackend` asks the source object one question per call — is this
 * endpoint a stream, a channel, or an ordinary request — and the routes
 * answer exactly that. Handing it a stand-in built from them, rather than
 * the API, is what keeps the upstream host, the middleware and the
 * endpoints no mark opens out of the browser: they were never in the
 * routes to begin with.
 *
 * The stand-in carries an inert `probe`, because the resolver recognises an
 * endpoint by having one. Proxy mode never calls it — the backend discards
 * the endpoint and dispatches on the schema alone.
 */

import { GROUP_PATH_SEPARATOR } from "../define/group-tree";
import type { CourierRoutes, RouteShape } from "../define/routes";
import { ENDPOINT_SCHEMA } from "../validation";
import type { ProxyEndpointKind } from "./types";

/** Recognised as an endpoint, and never invoked in proxy mode. */
const INERT = (): never => {
  throw new Error("[courier] a route describes an endpoint; it cannot execute one");
};

/**
 * Turn routes into the shape the client's transport picker reads: a
 * stand-in for the API whose endpoints carry only how each is reached.
 *
 * @param routes - The routes of the API, from the module written for them
 * @returns The stand-in, its endpoints' schemas set and nothing else
 * @example
 * ```ts
 * composeBackend(sourceFromRoutes(apiRoutes), http, streaming);
 * ```
 */
export function sourceFromRoutes(routes: CourierRoutes): Record<string, unknown> {
  const root = newLevel();
  for (const [path, shape] of Object.entries(routes.endpoints)) {
    const names = path.split(GROUP_PATH_SEPARATOR);
    const method = names.pop() ?? path;
    const level = names.reduce(levelBelow, root);
    level.endpoints[method] = { probe: INERT, [ENDPOINT_SCHEMA]: schemaOf(shape) };
  }
  return sourceOf(root);
}

/**
 * What the routes say of an HTTP endpoint: a read that may be cached, any
 * other read, or a write — or nothing, for a path they do not name or one
 * reached by a stream or a socket.
 *
 * @param routes - The routes of the API
 * @param group - The endpoint's group path, `""` for one at the top
 * @param method - The endpoint's name in its group
 * @returns Its kind, or `undefined`
 * @example
 * ```ts
 * routeKindOf(apiRoutes, "users", "list"); // → "cached-read" for { type: "query", get: true }
 * ```
 */
export function routeKindOf(
  routes: CourierRoutes,
  group: string,
  method: string,
): ProxyEndpointKind | undefined {
  const path = group ? `${group}.${method}` : method;
  const shape = Object.hasOwn(routes.endpoints, path) ? routes.endpoints[path] : undefined;
  if (shape === undefined || !("type" in shape)) return undefined;
  if (shape.type === "mutation") return "mutation";
  return "get" in shape && shape.get === true ? "cached-read" : "read";
}

/* What the transport picker reads of an endpoint: its kind of call, or the transport it opens. */
function schemaOf(shape: RouteShape): Record<string, unknown> {
  if ("type" in shape) return { type: shape.type };
  return shape.transport === "ws" && shape.bidirectional === true
    ? { transport: "ws", bidirectional: true }
    : { transport: shape.transport };
}

/* The endpoints at one level of the routes, and the groups below it. A Map,
   not an object: a group named `valueOf` found Object's own method already
   there, and its endpoints were written onto that. */
interface Level {
  endpoints: Record<string, unknown>;
  groups: Map<string, Level>;
}

function newLevel(): Level {
  return { endpoints: {}, groups: new Map() };
}

function levelBelow(level: Level, name: string): Level {
  const below = level.groups.get(name) ?? newLevel();
  level.groups.set(name, below);
  return below;
}

/* A level written as a source or a group writes it: its endpoints, and its groups under `options`. */
function sourceOf(level: Level): Record<string, unknown> {
  const groups = Object.fromEntries(
    [...level.groups].map(([name, below]) => [name, sourceOf(below)]),
  );
  return { ...level.endpoints, options: { groups } };
}
