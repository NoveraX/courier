/**
 * The type side of groups inside groups: every group's path, the group a
 * path names, and the endpoints a group holds — at any depth, for a source
 * and a group alike, each holding its groups under `options.groups`.
 */

/**
 * How many groups deep the types follow a path. The runtime follows any
 * depth; the compiler needs a bound to stop at, and ten levels of groups
 * inside groups is beyond any API's need.
 */
type MaxDepth = 10;

/** One level deeper. */
type Deeper<TDepth extends unknown[]> = [...TDepth, unknown];

/** The groups a source or a group holds, by name; none for one that holds none. */
export type GroupsAt<THolder> = THolder extends { options: { groups: infer TGroups } }
  ? TGroups
  : Record<never, never>;

/**
 * Every group's path in a source or a group, its sub-groups' after it.
 *
 * @example
 * ```ts
 * type Paths = GroupPaths<typeof api>; // "billing" | "billing.invoices" | "users"
 * ```
 */
export type GroupPaths<
  THolder,
  TPrefix extends string = "",
  TDepth extends unknown[] = [],
> = TDepth["length"] extends MaxDepth
  ? never
  : {
      [G in keyof GroupsAt<THolder> & string]:
        | `${TPrefix}${G}`
        | GroupPaths<GroupsAt<THolder>[G], `${TPrefix}${G}.`, Deeper<TDepth>>;
    }[keyof GroupsAt<THolder> & string];

/**
 * The group a path names, or never when it names none.
 *
 * @example
 * ```ts
 * type Invoices = GroupAtPath<typeof api, "billing.invoices">;
 * ```
 */
export type GroupAtPath<THolder, TPath extends string> = TPath extends `${infer G}.${infer TRest}`
  ? G extends keyof GroupsAt<THolder>
    ? GroupAtPath<GroupsAt<THolder>[G], TRest>
    : never
  : TPath extends keyof GroupsAt<THolder>
    ? GroupsAt<THolder>[TPath]
    : never;

/** The names of the endpoints a source or a group holds itself, its settings set aside. */
export type EndpointNamesAt<THolder> = Exclude<keyof THolder, "options"> & string;

/**
 * `"group.method"` for every endpoint inside a group, at any depth:
 * `"billing.invoices.list"`.
 *
 * @example
 * ```ts
 * type Grouped = GroupedEndpointPaths<typeof api>; // "users.list" | "billing.invoices.list"
 * ```
 */
export type GroupedEndpointPaths<
  THolder,
  TPrefix extends string = "",
  TDepth extends unknown[] = [],
> = TDepth["length"] extends MaxDepth
  ? never
  : {
      [G in keyof GroupsAt<THolder> & string]:
        | `${TPrefix}${G}.${EndpointNamesAt<GroupsAt<THolder>[G]>}`
        | GroupedEndpointPaths<GroupsAt<THolder>[G], `${TPrefix}${G}.`, Deeper<TDepth>>;
    }[keyof GroupsAt<THolder> & string];

/**
 * The endpoint a path names in a source or a group — `"list"` among its own
 * endpoints, `"billing.invoices.list"` in its groups — or never.
 */
export type EndpointAtPath<
  THolder,
  TPath extends string,
> = TPath extends `${infer G}.${infer TRest}`
  ? G extends keyof GroupsAt<THolder>
    ? EndpointAtPath<GroupsAt<THolder>[G], TRest>
    : never
  : TPath extends keyof THolder
    ? TPath extends "options"
      ? never
      : THolder[TPath]
    : never;
