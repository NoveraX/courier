import { HTTPError } from "../errors";
import { isAbortError } from "../utils/abort";

const TIMEOUT_ERROR = "TimeoutError";

/**
 * What a request that fetch rejected is thrown as.
 *
 * Only fetch's own rejection is classified here, so a mistake made before
 * the request — a body that would not serialize — is never taken for a
 * network failure. A cancellation the caller asked for is rethrown as fetch
 * rejected it, whatever reason it gave; a timeout says it is one.
 *
 * @param error - What fetch rejected with
 * @param signal - The signal the caller gave, if any
 * @param timeout - The request's timeout in ms, if it had one
 * @returns The error to throw
 *
 * @example
 * ```ts
 * try { return await fetch(url, init); } catch (error) { throw fetchFailure(error, signal, 5000); }
 * ```
 */
export function fetchFailure(
  error: unknown,
  signal: AbortSignal | null | undefined,
  timeout: number | undefined,
): unknown {
  if (signal?.aborted && error === signal.reason) return error;
  if (error instanceof HTTPError || isAbortError(error)) return error;
  if (error instanceof Error && error.name === TIMEOUT_ERROR) return timeoutFailure(error, timeout);
  return error instanceof Error ? transportFailure(error) : error;
}

/**
 * Did the request fail because its timeout ran out?
 *
 * @param error - A failure from {@link fetchFailure}
 * @returns `true` for a timeout
 */
export function isTimeoutFailure(error: HTTPError): boolean {
  return error.status === 0 && error.cause instanceof Error && error.cause.name === TIMEOUT_ERROR;
}

/**
 * The error a request that never got an answer is thrown as: status 0, with
 * the system's reason and code, and fetch's error as its cause.
 *
 * @param error - What fetch rejected with
 * @returns The HTTPError to throw
 */
export function transportFailure(error: Error): HTTPError {
  const cause = error.cause instanceof Error ? error.cause : error;
  const code = "code" in cause ? String(cause.code) : undefined;
  return new HTTPError(
    {
      status: 0,
      headers: new Headers(),
      data: { success: false, message: describe(cause, code), ...(code && { code }) },
    },
    { cause: error },
  );
}

/* Status 0 like any request that got no answer, but named for what it was,
   not "Network request failed" with the DOMException's legacy code "23". */
function timeoutFailure(error: Error, timeout: number | undefined): HTTPError {
  const after = timeout === undefined ? "" : ` after ${timeout} ms`;
  return new HTTPError(
    {
      status: 0,
      headers: new Headers(),
      data: { success: false, message: `Request timed out${after}`, code: "TIMEOUT" },
    },
    { cause: error, message: "Request timed out" },
  );
}

/* A host that resolves to several addresses fails with an AggregateError
   whose own message is empty; its errors say which addresses refused. */
function describe(cause: Error, code: string | undefined): string {
  if (cause.message) return cause.message;
  if (cause instanceof AggregateError) {
    const reasons = cause.errors.map((e: unknown) => (e instanceof Error ? e.message : String(e)));
    if (reasons.length > 0) return reasons.join("; ");
  }
  return code ?? "Request failed";
}
