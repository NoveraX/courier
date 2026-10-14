/**
 * The routes a browser's proxy client takes: which endpoints of an API it
 * may call, and how it reaches each. They are written from the API's own
 * definition — by Studio as it is saved, and by `courier-cli routes` —
 * into a module the client imports, so the definition never becomes a
 * value in a page's bundle and the page learns nothing about the server's
 * side: no address, no middleware, no endpoint the browser may not call.
 */

import type { ExposablePath, WireShapeAt } from "./endpoint-path-types";

/**
 * How the browser reaches one endpoint: a read, sent as GET when it may be
 * cached and as POST otherwise; a write; a stream of server-sent events; or
 * a socket, which the caller may also send on when it is bidirectional.
 */
export type RouteShape =
  | { readonly type: "query"; readonly get?: true }
  | { readonly type: "mutation" }
  | { readonly transport: "sse" }
  | { readonly transport: "ws"; readonly bidirectional?: true };

/** The shape the routes may give one endpoint of the API, as its definition declares it. */
export type RouteShapeAt<TApi, TPath extends string> =
  WireShapeAt<TApi, TPath> extends "query"
    ? { readonly type: "query"; readonly get?: true }
    : WireShapeAt<TApi, TPath> extends "mutation"
      ? { readonly type: "mutation" }
      : WireShapeAt<TApi, TPath> extends "stream"
        ? { readonly transport: "sse" }
        : WireShapeAt<TApi, TPath> extends "duplex"
          ? { readonly transport: "ws"; readonly bidirectional: true }
          : WireShapeAt<TApi, TPath> extends "channel"
            ? { readonly transport: "ws" }
            : never;

/**
 * The endpoints routes may name for an API, each in the shape the API
 * declares it: a path the API does not define, or a stream given as a
 * read, does not compile.
 *
 * @example
 * ```ts
 * const endpoints = { "users.list": { type: "query" } } as const satisfies RouteMap<typeof api>;
 * ```
 */
export type RouteMap<TApi> = {
  readonly [P in ExposablePath<TApi>]?: RouteShapeAt<TApi, P>;
};

/** Carries the API the routes were written from; never set at runtime. */
declare const API: unique symbol;

/**
 * The routes of one API, as its proxy client takes them: the source the
 * application registered it as, and every endpoint a browser may call. A
 * client given them is typed from the API with those endpoints alone.
 *
 * @example
 * ```ts
 * export const apiRoutes: CourierRoutes<typeof api, typeof endpoints> = { source: "api", endpoints };
 * ```
 */
export interface CourierRoutes<
  TApi = unknown,
  TEndpoints extends object = Readonly<Record<string, RouteShape>>,
> {
  readonly [API]?: TApi;
  /** The name the application registered the API under. */
  readonly source: string;
  /** Each endpoint a browser may call, by its path, and how it is reached. */
  readonly endpoints: TEndpoints;
  /** The reads a newer call cancels while they are in flight, as the API's `cancelPrevious` names them. */
  readonly cancelPrevious?: readonly string[];
  /** Whether identical reads in flight together share one request, as the API's `coalesce` says. */
  readonly coalesce?: boolean;
}
