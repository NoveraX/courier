/**
 * The routes a browser's proxy client takes: which endpoints of an API it
 * may call, and how it reaches each. They are written from the API's own
 * definition — by Studio as it is saved, and by `courier-cli routes` —
 * into a module the client imports, so the definition never becomes a
 * value in a page's bundle and the page learns nothing about the server's
 * side: no address, no middleware, no endpoint the browser may not call.
 */

import type { ExposablePath, WireShapeAt } from "./endpoint-path-types";
import type { ExposedPaths } from "./exposed-paths";

/**
 * How the browser reaches one endpoint: a read, sent as GET when it may be
 * cached and as POST otherwise, with whether a newer call of it cancels the
 * one in flight where the endpoint or its groups say; a write; a stream of
 * server-sent events; or a socket, which the caller may also send on when
 * it is bidirectional.
 */
export type RouteShape =
  | { readonly type: "query"; readonly get?: true; readonly cancelPrevious?: boolean }
  | { readonly type: "mutation" }
  | { readonly transport: "sse" }
  | { readonly transport: "ws"; readonly bidirectional?: true };

/** The shape the routes may give one endpoint of the API, as its definition declares it. */
export type RouteShapeAt<TApi, TPath extends string> =
  WireShapeAt<TApi, TPath> extends "query"
    ? { readonly type: "query"; readonly get?: true; readonly cancelPrevious?: boolean }
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
  /** Whether a newer call of a read cancels the one in flight, as the API's own `cancelPrevious` says. */
  readonly cancelPrevious?: boolean;
  /** Whether identical reads in flight together share one request, as the API's `coalesce` says. */
  readonly coalesce?: boolean;
}

/**
 * Whether an API's type names its endpoints one by one, rather than holding
 * any endpoint under any name — a source typed as `DefinedApi`, or `any`.
 */
export type NamesItsEndpoints<TApi> = 0 extends 1 & TApi
  ? false
  : string extends ExposablePath<TApi>
    ? false
    : `${string}.${string}` extends ExposablePath<TApi>
      ? false
      : true;

/** The endpoints a page may call, each reached as a route says; any name for an API typed to hold any endpoint. */
export type ExposedRouteMap<TApi> =
  NamesItsEndpoints<TApi> extends true
    ? { readonly [P in ExposedPaths<TApi>]: RouteShape }
    : Readonly<Record<string, RouteShape>>;

/**
 * The routes of an API as Courier's bundler plugin builds them from its
 * definition: every endpoint the marks open to a page, by the rule the
 * proxy applies. A client given them is typed with those endpoints alone;
 * for an API whose type names no endpoint in particular, with any.
 *
 * @example
 * ```ts
 * declare const shopRoutes: ExposedRoutes<typeof shop>;
 * const storefront = createProxyCaller(shopRoutes); // storefront.cart.add(…)
 * ```
 */
export type ExposedRoutes<TApi> = CourierRoutes<TApi, ExposedRouteMap<TApi>>;
