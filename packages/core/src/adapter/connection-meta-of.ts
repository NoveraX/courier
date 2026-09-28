import { isRecord } from "../utils/is-record";

/**
 * The metadata a connection carries, from what a hook returned for it: the
 * object itself, or none for nothing. Anything else is a hook that does not
 * keep to its contract, refused as a throw from it is.
 *
 * @param result - What the hook returned, awaited
 * @param hook - The hook's name, for the error
 * @returns The connection's metadata
 * @throws TypeError when it returned something other than an object or nothing
 *
 * @example
 * ```ts
 * ctx.meta = connectionMetaOf(await onConnect({ connectionId, request }), "onConnect");
 * ```
 */
export function connectionMetaOf(result: unknown, hook: string): Record<string, unknown> {
  if (result === undefined || result === null) return {};
  if (isRecord(result)) return result;
  throw new TypeError(
    `${hook} returned ${describe(result)}; it returns the connection's metadata, an object`,
  );
}

function describe(value: unknown): string {
  return Array.isArray(value) ? "an array" : `a ${typeof value}`;
}
