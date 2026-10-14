/**
 * What of an API a page's proxy client reaches: the endpoints its routes name.
 */

import type { GroupsOf } from "./endpoint-path-types";

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
