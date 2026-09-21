/**
 * The type machinery behind a proxy boundary.
 *
 * A boundary names the endpoints a browser may call. Writing that list by hand
 * only works if the compiler checks it, so these derive the legal names from
 * the API itself: a typo is an error, and renaming an endpoint breaks the
 * boundary that still names the old one rather than silently widening or
 * narrowing what the browser can reach.
 *
 * The transport is derived rather than declared. A developer who had to repeat
 * "this one is a stream" would eventually repeat it wrongly, and the type
 * already knows.
 */

import type { AnyEndpoint, InferKind, InferSend } from "./marker";

/** The groups an API declares, or never for one that declares none. */
type GroupsOf<TApi> = TApi extends { options: { groups: infer TGroups } } ? TGroups : never;

/** A group's endpoints, with its own options set aside. */
type EndpointsOf<TGroups> = {
  [G in keyof TGroups]: TGroups[G] extends { options: unknown }
    ? Omit<TGroups[G], "options">
    : TGroups[G];
};

/** Endpoints declared on the source itself rather than inside a group. */
type FlatOf<TApi> = Omit<TApi, "options">;

/** `"group.method"` for every endpoint inside a group. */
type GroupedPaths<TApi> = {
  [G in keyof EndpointsOf<GroupsOf<TApi>> & string]: {
    [M in keyof EndpointsOf<GroupsOf<TApi>>[G] & string]: `${G}.${M}`;
  }[keyof EndpointsOf<GroupsOf<TApi>>[G] & string];
}[keyof EndpointsOf<GroupsOf<TApi>> & string];

/** `"method"` for every endpoint declared without a group. */
type FlatPaths<TApi> = keyof FlatOf<TApi> & string;

/**
 * Every endpoint name a boundary may legally name.
 *
 * @example
 * ```ts
 * type Names = ExposablePath<typeof api>; // "posts.list" | "admin.purge" | …
 * ```
 */
export type ExposablePath<TApi> = GroupedPaths<TApi> | FlatPaths<TApi>;

/** The endpoint a path points at, or never when it points at nothing. */
type EndpointAt<TApi, TPath extends string> = TPath extends `${infer G}.${infer M}`
  ? G extends keyof EndpointsOf<GroupsOf<TApi>>
    ? M extends keyof EndpointsOf<GroupsOf<TApi>>[G]
      ? EndpointsOf<GroupsOf<TApi>>[G][M]
      : never
    : never
  : TPath extends keyof FlatOf<TApi>
    ? FlatOf<TApi>[TPath]
    : never;

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
 * What the browser is told about one endpoint — exactly what its client reads
 * to pick a transport, and nothing that would describe the server's own side.
 */
export interface ExposedEndpoint {
  /** Absent for an ordinary HTTP endpoint. */
  transport?: "sse" | "ws";
  /** True for a socket the caller may also send on. */
  bidirectional?: boolean;
}

/** The descriptor a boundary produces — the only thing the browser receives. */
export interface ProxyBoundary {
  /** Source this boundary belongs to, as the registry names it. */
  source: string;
  /** Endpoint path to its kind, for every endpoint the browser may call. */
  endpoints: Readonly<Record<string, ExposedEndpoint>>;
}

/**
 * How the browser must reach one endpoint, read from the API's own type.
 *
 * A boundary is written by hand so that the API itself never becomes a runtime
 * value in the browser — the moment it does, the whole definition follows it
 * into the bundle. What the developer writes is therefore checked rather than
 * derived: naming the wrong shape does not compile.
 */
export type WireShapeAt<TApi, TPath extends string> =
  EndpointAt<TApi, TPath> extends AnyEndpoint
    ? InferKind<EndpointAt<TApi, TPath>> extends "stream"
      ? "stream"
      : InferKind<EndpointAt<TApi, TPath>> extends "channel"
        ? [InferSend<EndpointAt<TApi, TPath>>] extends [never]
          ? "channel"
          : "duplex"
        : "request"
    : never;

/** What a boundary declares: every endpoint the browser may call, and its shape. */
export type ExposureMap<TApi> = {
  [P in ExposablePath<TApi>]?: WireShapeAt<TApi, P>;
};
