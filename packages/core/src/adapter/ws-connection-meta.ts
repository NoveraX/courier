/**
 * What a WebSocket handler's `onConnect` may return: the connection's
 * metadata — an object — or nothing, for a connection that carries none, or
 * a promise of either.
 */
// biome-ignore lint/suspicious/noConfusingVoidType: an onConnect with no return statement returns `void`, which `undefined` does not take
export type WSConnectResult = object | undefined | void;

/** The metadata of a connection whose `onConnect` returned nothing: it has no fields. */
export interface WSNoMeta {
  readonly [key: string]: undefined;
}

/**
 * The metadata a WebSocket connection carries, typed from what its handler's
 * `onConnect` returns: `meta.userId` is a string where `onConnect` returned
 * `{ userId }`. For a connection `onConnect` returned nothing for, it has no
 * fields. A handler with no `onConnect` gets its metadata from
 * `onTokenRefresh` alone, so its fields are not known.
 *
 * @example
 * ```ts
 * type Meta = WSConnectionMeta<Promise<{ userId: string }>>; // { userId: string }
 * type None = WSConnectionMeta<void>; // WSNoMeta
 * type Unknown = WSConnectionMeta<WSConnectResult>; // Record<string, unknown>
 * ```
 */
export type WSConnectionMeta<TConnect> = [WSConnectResult] extends [TConnect]
  ? Record<string, unknown>
  : Awaited<TConnect> extends infer TMeta
    ? TMeta extends object
      ? TMeta
      : WSNoMeta
    : never;
