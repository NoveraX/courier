/**
 * Internal type helpers shared by Courier react-query option types.
 *
 * Not part of the public API and should not be re-exported from the
 * package entry point.
 */

import type { AnyEndpoint, EndpointKind, InferKind } from "@noverax/courier/define";

/**
 * Resolve the `variables` field for hook option objects:
 *  - no variables → optional, must be absent
 *  - empty-object variables → optional
 *  - required variables → mandatory
 *
 * An endpoint that never named its variables carries `void`, so the first
 * branch admits it alongside `undefined`; otherwise every option object for
 * such an endpoint would still demand a `variables` field.
 */
// biome-ignore lint/suspicious/noConfusingVoidType: void is the builder's sentinel for an endpoint that takes no variables
export type WithVariables<TVariables> = [TVariables] extends [undefined | void]
  ? { variables?: undefined }
  : {} extends TVariables
    ? { variables?: TVariables }
    : { variables: TVariables };

/**
 * Resolve TVariables for react-query mutations: void when no args needed,
 * so `mutate()` may be called without arguments.
 */
// biome-ignore lint/suspicious/noConfusingVoidType: void is required for react-query's mutate() to accept zero arguments
export type MutationVariables<TVariables> = [TVariables] extends [undefined | void]
  ? void
  : {} extends TVariables
    ? void | TVariables
    : TVariables;

/** All method keys of a group, excluding the reserved `options` field. */
export type GroupMethodKeys<TGroup> = Exclude<keyof TGroup, "options"> & string;

/**
 * The method keys of a group whose endpoints were built from a given head.
 *
 * A hook only makes sense for the kind it was written for — a stream has no
 * promise to await and a mutation is not something to keep fresh — so each one
 * offers the names it can actually serve rather than every name in the group.
 */
export type MethodsOfKind<TGroup, TKind extends EndpointKind> = {
  [TKey in GroupMethodKeys<TGroup>]: TGroup[TKey] extends AnyEndpoint
    ? InferKind<TGroup[TKey]> extends TKind
      ? TKey
      : never
    : never;
}[GroupMethodKeys<TGroup>];
