import type { AdapterHandler } from "../adapter/create-handler";

/** Where a server keeps the proxy its own proxy callers reach in process. */
export const IN_PROCESS_PROXY = Symbol.for("courier.inProcessProxy");

/**
 * The proxy of the process, as `registerSources` provides it on a server —
 * or `undefined` where nothing provided one, a browser above all.
 *
 * It is found on the global object rather than imported: a browser's bundle
 * of a proxy caller would otherwise carry the whole proxy handler, which it
 * never runs.
 *
 * @returns The handler, or `undefined`
 * @example
 * ```ts
 * const response = await inProcessProxy()?.handle(request);
 * ```
 */
export function inProcessProxy(): AdapterHandler | undefined {
  const provide: unknown = Reflect.get(globalThis, IN_PROCESS_PROXY);
  return typeof provide === "function" ? (provide as () => AdapterHandler)() : undefined;
}
