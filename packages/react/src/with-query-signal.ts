import type { CallOptions } from "@noverax/courier";
import { anySignal } from "@noverax/courier/internal";

/**
 * Per-request options that also carry the query's own abort signal.
 *
 * TanStack Query aborts that signal when the last component reading the
 * query unmounts and when `cancelQueries` reaches it, so a request made
 * without it ran to completion only for its answer to be thrown away. A
 * signal the caller passed in `requestOptions` keeps aborting the request
 * as well: whichever fires first wins — on every browser, those without
 * `AbortSignal.any` among them.
 *
 * @param requestOptions - The caller's per-request options, if any
 * @param signal - The signal from TanStack's query function context
 * @returns Options whose `signal` aborts when either signal does
 * @example
 * queryFn: ({ signal }) => exec(method, variables, withQuerySignal(requestOptions, signal)),
 */
export function withQuerySignal(
  requestOptions: CallOptions | undefined,
  signal: AbortSignal,
): CallOptions {
  const own = requestOptions?.signal;
  return { ...requestOptions, signal: own ? anySignal([own, signal]) : signal };
}
