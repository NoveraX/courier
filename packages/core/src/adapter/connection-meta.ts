/**
 * What a connect hook — a WebSocket handler's `onConnect`, an SSE stream's
 * `onSSEConnect` — may return: the connection's metadata, an object, or
 * nothing for a connection that carries none, or a promise of either.
 */
// biome-ignore lint/suspicious/noConfusingVoidType: a connect hook with no return statement returns `void`, which `undefined` does not take
export type ConnectResult = object | undefined | void;

/** The metadata of a connection its connect hook returned nothing for: it has no fields. */
export interface NoConnectionMeta {
  readonly [key: string]: undefined;
}

/**
 * The metadata a connection carries, typed from what its connect hook
 * returns: `meta.userId` is a string where `onConnect` returned `{ userId }`.
 * For a connection the hook returned nothing for, it has no fields. Without
 * a connect hook its fields are not known: a WebSocket connection's may come
 * from `onTokenRefresh` alone.
 *
 * @example
 * ```ts
 * type Meta = ConnectionMeta<Promise<{ userId: string }>>; // { userId: string }
 * type None = ConnectionMeta<void>; // NoConnectionMeta
 * type Unknown = ConnectionMeta<ConnectResult>; // Record<string, unknown>
 * ```
 */
export type ConnectionMeta<TConnect> = [ConnectResult] extends [TConnect]
  ? Record<string, unknown>
  : Awaited<TConnect> extends infer TMeta
    ? TMeta extends object
      ? TMeta
      : NoConnectionMeta
    : never;
