/**
 * Internal type helpers shared by Courier react-query option types.
 *
 * Not part of the public API and should not be re-exported from the
 * package entry point.
 */

/**
 * Resolve the `variables` field for hook option objects:
 *  - `undefined` variables → optional, must be `undefined`
 *  - empty-object variables → optional
 *  - required variables → mandatory
 */
export type WithVariables<TVariables> = [TVariables] extends [undefined]
  ? { variables?: undefined }
  : {} extends TVariables
    ? { variables?: TVariables }
    : { variables: TVariables };

/**
 * Resolve TVariables for react-query mutations: void when no args needed,
 * so `mutate()` may be called without arguments.
 */
// biome-ignore lint/suspicious/noConfusingVoidType: void is required for react-query's mutate() to accept zero arguments
export type MutationVariables<TVariables> = [TVariables] extends [undefined]
  ? void
  : {} extends TVariables
    ? void | TVariables
    : TVariables;

/** All method keys of a group, excluding the reserved `options` field. */
export type GroupMethodKeys<TGroup> = Exclude<keyof TGroup, "options"> & string;
