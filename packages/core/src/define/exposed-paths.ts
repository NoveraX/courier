/**
 * Which endpoints of an API a page may call, read from the API's own type by
 * the rule the proxy applies: the endpoint's `.expose()`, then the nearest
 * group's `expose`, then the API's, the nearest mark that says deciding,
 * and none keeping the endpoint the server's.
 *
 * Where the type cannot tell, it lets a page's client name the endpoint and
 * the routes built from the definition decide whether a call is sent: a
 * flag known only at run time may open, and a mark that may be left unset
 * leaves the decision to the level above as well.
 */

import type { Deeper, EndpointNamesAt, GroupsAt, MaxDepth } from "./group-path-types";
import type { AnyEndpoint, InferExpose } from "./marker";

/**
 * The `expose` a source or a group sets, or never where it sets none. One
 * whose call may have left it unset is kept as a mark that may be anything.
 */
type HolderMark<THolder> = THolder extends { options: { expose?: infer TMark } }
  ? Exclude<TMark, undefined>
  : never;

/** The mark that decides below a source or a group: its own where it sets one, else the one handed down. */
type Nearest<TOwn, TInherited> = [TOwn] extends [never] ? TInherited : TOwn;

/**
 * The mark that decides for an endpoint: its own, else the one handed down.
 * An endpoint whose type may or may not carry a mark — one branch of a
 * condition marks it, the other does not — leaves the decision to both.
 */
type Decided<TMark, TInherited> = undefined extends TMark
  ? Exclude<TMark, undefined> | TInherited
  : TMark;

/** Whether a deciding mark opens: `true`, or a flag that may be `true`; nothing set keeps it shut. */
type Opens<TMark> = 0 extends 1 & TMark
  ? true
  : [TMark] extends [never]
    ? false
    : [TMark] extends [false]
      ? false
      : true;

/** The paths of the holder's own endpoints the marks open, `TPrefix` before each. */
type OwnOpenPaths<THolder, TInherited, TPrefix extends string> = {
  [K in EndpointNamesAt<THolder>]: THolder[K] extends AnyEndpoint
    ? Opens<Decided<InferExpose<THolder[K]>, TInherited>> extends true
      ? `${TPrefix}${K}`
      : never
    : never;
}[EndpointNamesAt<THolder>];

/** The open paths of a holder and of every group inside it, as deep as the types follow groups. */
type OpenPathsIn<THolder, TInherited, TPrefix extends string, TDepth extends unknown[]> =
  | OwnOpenPaths<THolder, Nearest<HolderMark<THolder>, TInherited>, TPrefix>
  | (TDepth["length"] extends MaxDepth
      ? never
      : {
          [G in keyof GroupsAt<THolder> & string]: OpenPathsIn<
            GroupsAt<THolder>[G],
            Nearest<HolderMark<THolder>, TInherited>,
            `${TPrefix}${G}.`,
            Deeper<TDepth>
          >;
        }[keyof GroupsAt<THolder> & string]);

/* Written as a conditional on the API, so a generic API keeps this name where a
   declaration names the type, rather than the machinery behind it. */
/**
 * Every endpoint of an API a page may call through the proxy, by its path.
 *
 * @example
 * ```ts
 * const api = defineApi({
 *   expose: true,
 *   groups: { users: defineGroup({ endpoints: { list: endpoint.get("users"), purge: endpoint.del("users").expose(false) } }) },
 * });
 * type Open = ExposedPaths<typeof api>; // "users.list"
 * ```
 */
export type ExposedPaths<TApi> = [TApi] extends [unknown]
  ? OpenPathsIn<TApi, never, "", []>
  : never;
