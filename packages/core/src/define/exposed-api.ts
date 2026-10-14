/**
 * What of an API a browser reaches, when the API holds a boundary.
 */

import type {
  ExposablePath,
  Exposure,
  ExposureMap,
  GroupsOf,
  ProxyBoundary,
} from "./boundary-types";

/** The paths inside group `G`, its name taken off: `invoices.list` of `billing.invoices.list`. */
type PathsIn<TPaths extends string, G extends string> = TPaths extends `${G}.${infer TRest}`
  ? TRest
  : never;

/** The paths that name an endpoint of this level itself, not one in a group below it. */
type OwnNamed<TPaths extends string> = TPaths extends `${string}.${string}` ? never : TPaths;

/**
 * Each group with only what the paths name in it — its endpoints, and its
 * groups cut the same way; a group they name nothing in is gone.
 */
type ExposedGroups<TGroups, TPaths extends string> = {
  [G in keyof TGroups & string as [PathsIn<TPaths, G>] extends [never] ? never : G]: ExposedGroup<
    TGroups[G],
    PathsIn<TPaths, G>
  >;
};

type ExposedGroup<TGroup, TPaths extends string> = {
  [K in keyof TGroup as K extends "options" | OwnNamed<TPaths> ? K : never]: K extends "options"
    ? ExposedOptions<TGroup[K], TPaths>
    : TGroup[K];
};

type ExposedOptions<TOptions, TPaths extends string> = TOptions extends { groups: infer TGroups }
  ? Omit<TOptions, "groups"> & { groups: ExposedGroups<TGroups, TPaths> }
  : TOptions;

/**
 * An API with only the endpoints the paths name: its groups keep those
 * endpoints alone, and so do its flat endpoints.
 *
 * @example
 * ```ts
 * type Public = ExposedApi<typeof api, "posts.list">; // posts.list alone
 * ```
 */
export type ExposedApi<TApi, TPaths extends string> = TApi extends { options: infer TOptions }
  ? {
      options: [GroupsOf<TApi>] extends [never]
        ? TOptions
        : Omit<TOptions, "groups"> & { groups: ExposedGroups<GroupsOf<TApi>, TPaths> };
    } & Pick<TApi, Extract<TPaths, Exclude<keyof TApi, "options">>>
  : TApi;

/**
 * The API a browser client of `TApi` reaches: all of it, or — when the API
 * holds a boundary — the endpoints the boundary exposes. A proxy client is
 * typed from it, so an endpoint the boundary leaves out does not compile.
 *
 * @example
 * ```ts
 * const client = createProxyCaller<typeof api>("api", { boundary });
 * client.admin.purge(); // error: the boundary does not expose admin.purge
 * ```
 */
export type BrowserApi<TApi> = TApi extends {
  options: { boundary: ProxyBoundary<infer TExposure> };
}
  ? string extends keyof TExposure
    ? TApi
    : ExposedApi<TApi, keyof TExposure & string>
  : TApi;

/**
 * The API a proxy client given routes reaches: the endpoints the routes
 * name, or all of it where their type names no endpoint in particular.
 * @example
 * ```ts
 * type Reached = RoutedApi<typeof api, { "posts.list": { type: "query" } }>; // posts.list alone
 * ```
 */
export type RoutedApi<TApi, TEndpoints> =
  TEndpoints extends Readonly<Record<infer TPath, unknown>>
    ? string extends TPath
      ? TApi
      : ExposedApi<TApi, TPath & string>
    : TApi;

/**
 * The boundary an API may hold: one whose every path names an endpoint of the
 * API, in the shape the API declares it. A misspelt path, or a stream exposed
 * as a query, fails where the API takes the boundary.
 */
export type BoundaryOf<TApi, TBoundary> =
  TBoundary extends ProxyBoundary<infer TExposure>
    ? ProxyBoundary<
        ExposureMap<TApi> & { [P in Exclude<keyof TExposure, ExposablePath<TApi>>]: never }
      >
    : ProxyBoundary<Exposure>;

/**
 * An API with the boundary it holds kept at its own type, replacing the
 * option's general one, for the clients typed from the API.
 */
export type WithBoundary<TApi extends { options: object }, TBoundary> = [TBoundary] extends [
  undefined,
]
  ? TApi
  : Omit<TApi, "options"> & {
      options: Omit<TApi["options"], "boundary"> & { boundary: TBoundary };
    };
