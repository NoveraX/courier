/**
 * What of an API a page's proxy client reaches: the endpoints its routes name,
 * each answering with what the proxy sends of what it gives.
 */

import type { ChannelEndpoint, HttpEndpoint, StreamEndpoint } from "./call-shapes";
import type { GroupsOf } from "./endpoint-path-types";
import type {
  AnyEndpoint,
  InferExpose,
  InferKind,
  InferResponse,
  InferSend,
  InferVariables,
  InferVariablesOut,
} from "./marker";
import type { Proxied } from "./proxied";

/**
 * The paths inside group `G`, its name taken off: `invoices.list` of `billing.invoices.list`;
 * every path, where the paths are any at all.
 */
type PathsIn<TPaths extends string, G extends string> = string extends TPaths
  ? string
  : TPaths extends `${G}.${infer TRest}`
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
    : ReachedEndpoint<TGroup[K]>;
};

type ExposedOptions<TOptions, TPaths extends string> = TOptions extends { groups: infer TGroups }
  ? Omit<TOptions, "groups"> & { groups: ExposedGroups<TGroups, TPaths> }
  : TOptions;

/* The API's own endpoints the paths name: all of them, where the paths are any at all. */
type FlatNamed<TApi, TPaths extends string> = string extends TPaths
  ? Exclude<keyof TApi, "options">
  : Extract<TPaths, Exclude<keyof TApi, "options">>;

/* An endpoint as a page reaches it: what it answers is what the proxy sends of what it gives.
   Named by the endpoint types the package exports, so a project that emits declarations
   can write a page's client out. */
type ReachedEndpoint<TEndpoint> = TEndpoint extends AnyEndpoint
  ? InferKind<TEndpoint> extends "stream"
    ? StreamEndpoint<
        Proxied<InferResponse<TEndpoint>>,
        InferVariables<TEndpoint>,
        InferVariablesOut<TEndpoint>,
        InferExpose<TEndpoint>
      >
    : InferKind<TEndpoint> extends "channel"
      ? ChannelEndpoint<
          Proxied<InferResponse<TEndpoint>>,
          InferVariables<TEndpoint>,
          InferSend<TEndpoint>,
          InferVariablesOut<TEndpoint>,
          InferExpose<TEndpoint>
        >
      : HttpEndpoint<
          Proxied<InferResponse<TEndpoint>>,
          InferVariables<TEndpoint>,
          Extract<InferKind<TEndpoint>, "query" | "mutation">,
          InferVariablesOut<TEndpoint>,
          InferExpose<TEndpoint>
        >
  : TEndpoint;

/**
 * An API as a page reaches it through the proxy: the endpoints the paths
 * name alone — in its groups and among its own endpoints, every one where
 * the paths are any at all — each answering with what the proxy sends of
 * what it gives, as {@link Proxied} says.
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
    } & { [K in FlatNamed<TApi, TPaths>]: ReachedEndpoint<TApi[K]> }
  : TApi;

/**
 * The API a proxy client given routes reaches: the endpoints the routes
 * name, or all of it where their type names no endpoint in particular,
 * each answering with what the proxy sends of what it gives.
 * @example
 * ```ts
 * type Reached = RoutedApi<typeof api, { "posts.list": { type: "query" } }>; // posts.list alone
 * ```
 */
export type RoutedApi<TApi, TEndpoints> =
  TEndpoints extends Readonly<Record<infer TPath, unknown>>
    ? ExposedApi<TApi, TPath & string>
    : ExposedApi<TApi, string>;
