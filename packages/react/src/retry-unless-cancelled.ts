import { isAbortError } from "@noverax/courier";
import type { QueryClient, QueryKey } from "@tanstack/react-query";

/**
 * A query's `retry`, as its hook or its client sets it, that never retries
 * a cancellation: an `AbortError` — a read a newer call of its endpoint
 * superseded, code `SUPERSEDED` — or a read whose own signal, given in
 * `requestOptions`, has aborted. TanStack Query leaves its own
 * cancellations alone, but takes these for failures, and retrying one
 * would cancel the newer call in turn.
 *
 * Where neither the hook nor the client sets `retry`, the query retries
 * nothing of its own: a call is repeated by its API's retry policy, which
 * knows why it failed and whether it may be sent again, and two layers of
 * retries would multiply — three of TanStack Query's over a policy's three
 * sent twelve requests for one.
 *
 * @param queryClient - The client the query runs on, whose defaults apply where the hook says nothing
 * @param queryKey - The query's key, whose defaults the client may hold
 * @param given - The `retry` the hook was given, if any
 * @param signal - The signal the hook was given in `requestOptions`, if any
 * @returns The `retry` to give the query
 * @example
 * ```ts
 * useQuery({ queryKey, queryFn, ...options, retry: retryUnlessCancelled(client, queryKey, options.retry, signal) });
 * ```
 */
export function retryUnlessCancelled(
  queryClient: QueryClient,
  queryKey: QueryKey,
  given: unknown,
  signal: AbortSignal | null | undefined,
): (failureCount: number, error: unknown) => boolean {
  const configured: unknown = given ?? queryClient.defaultQueryOptions({ queryKey }).retry;
  const retry = configured ?? false;
  return (failureCount, error) => {
    if (signal?.aborted === true) return false;
    if (isAbortError(error)) return false;
    if (typeof retry === "number") return failureCount < retry;
    if (typeof retry === "function") {
      const verdict: unknown = Reflect.apply(retry, undefined, [failureCount, error]);
      return Boolean(verdict);
    }
    return retry === true;
  };
}
