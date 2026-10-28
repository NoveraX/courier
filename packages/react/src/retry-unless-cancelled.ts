import { isHTTPError } from "@noverax/courier";
import { isServer, type QueryClient, type QueryKey } from "@tanstack/react-query";

/** Status of a read a newer call of its endpoint cancelled, as `cancelPrevious` asks. */
const SUPERSEDED = 499;

/** What a query is retried by when neither its hook nor its client says: TanStack Query's own. */
export const QUERY_RETRIES = isServer ? 0 : 3;

/**
 * A query's `retry`, as its hook or its client sets it, that never retries
 * a cancellation: a read a newer call of its endpoint cancelled — an
 * `HTTPError` of status 499, as `retryMiddleware` treats it — or one whose
 * own signal, given in `requestOptions`, has aborted. TanStack Query leaves
 * its own cancellations alone, but takes these for failures, and retrying
 * one would cancel the newer call in turn.
 *
 * @param queryClient - The client the query runs on, whose defaults apply where the hook says nothing
 * @param queryKey - The query's key, whose defaults the client may hold
 * @param given - The `retry` the hook was given, if any
 * @param signal - The signal the hook was given in `requestOptions`, if any
 * @param unset - What TanStack Query does where nothing sets `retry`
 * @returns The `retry` to give the query
 * @example
 * ```ts
 * useQuery({ queryKey, queryFn, ...options, retry: retryUnlessCancelled(client, queryKey, options.retry, signal, QUERY_RETRIES) });
 * ```
 */
export function retryUnlessCancelled(
  queryClient: QueryClient,
  queryKey: QueryKey,
  given: unknown,
  signal: AbortSignal | null | undefined,
  unset: boolean | number,
): (failureCount: number, error: unknown) => boolean {
  const configured: unknown = given ?? queryClient.defaultQueryOptions({ queryKey }).retry;
  const retry = configured ?? unset;
  return (failureCount, error) => {
    if (signal?.aborted === true) return false;
    if (isHTTPError(error) && error.status === SUPERSEDED) return false;
    if (typeof retry === "number") return failureCount < retry;
    if (typeof retry === "function") {
      const verdict: unknown = Reflect.apply(retry, undefined, [failureCount, error]);
      return Boolean(verdict);
    }
    return retry === true;
  };
}
