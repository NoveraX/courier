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
  : MayOmitVariables<TVariables> extends true
    ? { variables?: TVariables }
    : { variables: TVariables };

/**
 * Whether a call may leave its variables out: where every field is optional,
 * or where they may be undefined — a body the operation does not require.
 */
export type MayOmitVariables<TVariables> = {} extends TVariables
  ? true
  : undefined extends TVariables
    ? true
    : false;

/**
 * Resolve TVariables for react-query mutations: void when no args needed,
 * so `mutate()` may be called without arguments.
 */
export type MutationVariables<TVariables> = [TVariables] extends [undefined | NoArguments]
  ? NoArguments
  : MayOmitVariables<TVariables> extends true
    ? NoArguments | TVariables
    : TVariables;

/**
 * What a call without variables takes: nothing. TypeScript lets a parameter
 * be left out only when its type is `void`; typed `undefined`, react-query's
 * `mutate()` and a query hook would each demand an argument.
 */
// biome-ignore lint/suspicious/noConfusingVoidType: `void` is the one type a parameter may be left out for
export type NoArguments = void;

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
