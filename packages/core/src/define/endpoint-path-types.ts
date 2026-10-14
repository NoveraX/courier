/**
 * The type machinery that names an API's endpoints by their paths.
 *
 * A routes module names the endpoints a page may call by their paths, and
 * how each is reached. These derive the legal paths and shapes from the API
 * itself, so a module the API no longer matches — a path it does not
 * define, a stream named as a read — does not compile, rather than widening
 * or narrowing in silence what a page can reach.
 */

import type { EndpointAtPath, GroupedEndpointPaths } from "./group-path-types";
import type { AnyEndpoint, InferKind, InferSend } from "./marker";

/** The groups an API declares, or never for one that declares none. */
export type GroupsOf<TApi> = TApi extends { options: { groups: infer TGroups } } ? TGroups : never;

/** Endpoints declared on the source itself rather than inside a group. */
type FlatOf<TApi> = Omit<TApi, "options">;

/** `"method"` for every endpoint declared without a group. */
type FlatPaths<TApi> = keyof FlatOf<TApi> & string;

/**
 * Every endpoint of an API, by its path.
 *
 * @example
 * ```ts
 * type Names = ExposablePath<typeof api>; // "posts.list" | "admin.purge" | "billing.invoices.list" | …
 * ```
 */
export type ExposablePath<TApi> = GroupedEndpointPaths<TApi> | FlatPaths<TApi>;

/** The endpoint a path points at — in a group at any depth — or never when it points at nothing. */
type EndpointAt<TApi, TPath extends string> = EndpointAtPath<TApi, TPath>;

/**
 * What kind of endpoint a path names, read from the API's own type.
 *
 * @example
 * ```ts
 * type K = KindAt<typeof api, "posts.feed">; // "stream"
 * ```
 */
export type KindAt<TApi, TPath extends string> =
  EndpointAt<TApi, TPath> extends AnyEndpoint ? InferKind<EndpointAt<TApi, TPath>> : never;

/**
 * How a page reaches one endpoint, read from the API's own type: a read, a
 * write, a stream, a channel it only listens on, or one it also sends on.
 *
 * @example
 * ```ts
 * type S = WireShapeAt<typeof api, "live.chat">; // "duplex"
 * ```
 */
export type WireShapeAt<TApi, TPath extends string> =
  EndpointAt<TApi, TPath> extends AnyEndpoint
    ? InferKind<EndpointAt<TApi, TPath>> extends "stream"
      ? "stream"
      : InferKind<EndpointAt<TApi, TPath>> extends "channel"
        ? [InferSend<EndpointAt<TApi, TPath>>] extends [never]
          ? "channel"
          : "duplex"
        : InferKind<EndpointAt<TApi, TPath>>
    : never;
