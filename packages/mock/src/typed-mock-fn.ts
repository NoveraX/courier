import type {
  AnyEndpoint,
  AnySource,
  InferResponse,
  InferVariables,
} from "@noverax/courier/define";
import type { EnhancedMockBuilder, UntypedMockFn } from "./types";

/** The groups a source declares, by name; none for a source without groups. */
export type ApiGroups<TSource> = TSource extends { options: { groups: infer TGroups } }
  ? TGroups
  : Record<never, never>;

/** The names under which a record holds endpoints, leaving out `options`. */
export type EndpointKeys<TRecord> = {
  [TKey in keyof TRecord]: TRecord[TKey] extends AnyEndpoint ? TKey : never;
}[keyof TRecord] &
  string;

/** The names of the endpoints a source declares outside any group. */
export type TopLevelKeys<TSource> = EndpointKeys<Omit<TSource, "options">>;

/** Response type of an endpoint; `unknown` for anything else. */
export type ExtractResponse<TEndpoint> = TEndpoint extends AnyEndpoint
  ? InferResponse<TEndpoint>
  : unknown;

/** Variables type of an endpoint; `unknown` for anything else. */
export type ExtractVariables<TEndpoint> = TEndpoint extends AnyEndpoint
  ? InferVariables<TEndpoint>
  : unknown;

/** Mocks an endpoint of a group, by the group's name and the endpoint's. */
export type GroupedMockFn<TSource> = <
  TGroup extends keyof ApiGroups<TSource> & string,
  TMethod extends EndpointKeys<ApiGroups<TSource>[TGroup]>,
>(
  group: TGroup,
  method: TMethod,
) => EnhancedMockBuilder<
  ExtractResponse<ApiGroups<TSource>[TGroup][TMethod]>,
  ExtractVariables<ApiGroups<TSource>[TGroup][TMethod]>
>;

/**
 * Mocks an endpoint a source declares outside any group.
 *
 * The mock server files such an endpoint under the collection its path starts
 * with — `listUsers` at `users/:id` is `mock("users", "listUsers")` — which
 * the path's type does not carry, so the collection is not checked.
 */
export type TopLevelMockFn<TSource> = <TMethod extends TopLevelKeys<TSource>>(
  collection: string,
  method: TMethod,
) => EnhancedMockBuilder<
  ExtractResponse<TSource[TMethod & keyof TSource]>,
  ExtractVariables<TSource[TMethod & keyof TSource]>
>;

/** Whether a source's endpoints are unknown to the type system. */
type IsUntyped<TSource> = string extends keyof ApiGroups<TSource>
  ? true
  : [keyof ApiGroups<TSource> | TopLevelKeys<TSource>] extends [never]
    ? true
    : false;

/**
 * Type-safe `mock` for a source: group and endpoint names, and the response
 * and variables each endpoint takes, are checked against the source.
 */
export type TypedMockFn<TSource extends AnySource> =
  IsUntyped<TSource> extends true
    ? UntypedMockFn
    : ([keyof ApiGroups<TSource>] extends [never] ? unknown : GroupedMockFn<TSource>) &
        ([TopLevelKeys<TSource>] extends [never] ? unknown : TopLevelMockFn<TSource>);

/**
 * An endpoint of a source by name, as a mock lists the endpoints it
 * answers: `group.method`, or the method alone for one outside any group.
 * Any string for a source whose endpoints are unknown to the type system.
 */
export type EndpointName<TSource> =
  IsUntyped<TSource> extends true
    ? string
    :
        | {
            [TGroup in keyof ApiGroups<TSource> &
              string]: `${TGroup}.${EndpointKeys<ApiGroups<TSource>[TGroup]>}`;
          }[keyof ApiGroups<TSource> & string]
        | TopLevelKeys<TSource>;
