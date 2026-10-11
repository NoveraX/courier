/* A namespace import, not named hooks: the package entry is reachable from
   Server Components, and Next.js refuses to build a server module that names
   a client-only hook such as useState among its imports. */
import * as React from "react";

type Callback = (...args: never[]) => unknown;

/**
 * A ref holding the latest value a component rendered with, set once that
 * render commits: never during render, which React may throw away and the
 * React Compiler may skip. For a value read by what runs outside an effect —
 * a query's function — where an effect event may not go.
 *
 * @param value - The value this render has
 * @returns The ref, the same one every render
 * @example
 * ```ts
 * const mapperRef = useLatest(options.mapper);
 * useQuery({ queryKey, queryFn: async () => mapperRef.current(await load()) });
 * ```
 */
export function useLatest<TValue>(value: TValue): { readonly current: TValue } {
  const ref = React.useRef(value);
  React.useInsertionEffect(() => {
    ref.current = value;
  });
  return ref;
}

/**
 * React's `useEffectEvent` for React before 19.2, which has none: a function
 * that calls the latest one the component rendered with, kept up to date as
 * each render commits.
 *
 * @param callback - What this render would call
 * @returns A function an effect's own callbacks call
 * @example
 * ```ts
 * const onMessage = useEffectEventFallback((message: string) => options.onData?.(message));
 * ```
 */
export function useEffectEventFallback<TCallback extends Callback>(callback: TCallback): TCallback {
  const latest = useLatest(callback);
  return React.useCallback(
    ((...args: Parameters<TCallback>) => latest.current(...args)) as TCallback,
    [latest],
  );
}

/* Looked up rather than named, so a bundler building for React 19.1 or earlier
   warns of no export that React does not have. */
const native: unknown = Reflect.get(React, "useEffectEvent");

/**
 * A function for an effect's own callbacks — a subscription's handlers — to
 * call with what the component last rendered, without the effect running
 * again when the function changes: React's `useEffectEvent` from 19.2, and
 * the same where React has none. It is called from those callbacks only,
 * never during render.
 *
 * @param callback - What this render would call
 * @returns A function an effect's own callbacks call
 * @example
 * ```ts
 * const onEvent = useEffectEvent((event: SSEEvent<T>) => options.onData?.(event));
 * React.useEffect(() => stream.on("data", onEvent), [stream]);
 * ```
 */
export const useEffectEvent: <TCallback extends Callback>(callback: TCallback) => TCallback =
  typeof native === "function"
    ? (native as <TCallback extends Callback>(callback: TCallback) => TCallback)
    : useEffectEventFallback;
