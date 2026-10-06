import type {
  AnyEndpoint,
  AnySource,
  GroupAtPath,
  GroupPaths,
  InferResponse,
  InferSend,
  InferVariables,
} from "@noverax/courier/define";
import type { MockFormFields } from "./form-fields";
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

/**
 * Variables type of an endpoint as a mock's handler receives them — a form
 * as its fields, which is how the mock reads one; `unknown` for anything else.
 */
export type ExtractVariables<TEndpoint> = TEndpoint extends AnyEndpoint
  ? InferVariables<TEndpoint> extends FormData
    ? MockFormFields
    : InferVariables<TEndpoint>
  : unknown;

/** What a client sends an endpoint's channel; `unknown` for anything else. */
export type ExtractSend<TEndpoint> = TEndpoint extends AnyEndpoint ? InferSend<TEndpoint> : unknown;

/**
 * Mocks an endpoint of a group, by the group's path and the endpoint's name:
 * `mock("users", "list")`, or `mock("billing.invoices", "list")` for a group
 * inside another.
 */
export type GroupedMockFn<TSource> = <
  TGroup extends GroupPaths<TSource>,
  TMethod extends EndpointKeys<GroupAtPath<TSource, TGroup>>,
>(
  group: TGroup,
  method: TMethod,
) => EnhancedMockBuilder<
  ExtractResponse<GroupAtPath<TSource, TGroup>[TMethod]>,
  ExtractVariables<GroupAtPath<TSource, TGroup>[TMethod]>,
  ExtractSend<GroupAtPath<TSource, TGroup>[TMethod]>
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
  ExtractVariables<TSource[TMethod & keyof TSource]>,
  ExtractSend<TSource[TMethod & keyof TSource]>
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
 * answers: `group.method` — `billing.invoices.list` for a group inside
 * another — or the method alone for one outside any group.
 * Any string for a source whose endpoints are unknown to the type system.
 */
export type EndpointName<TSource> =
  IsUntyped<TSource> extends true
    ? string
    :
        | {
            [TGroup in GroupPaths<TSource>]: `${TGroup}.${EndpointKeys<GroupAtPath<TSource, TGroup>>}`;
          }[GroupPaths<TSource>]
        | TopLevelKeys<TSource>;
