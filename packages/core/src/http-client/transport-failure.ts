import { HTTPError } from "../errors";
import { ConfigurationError } from "../errors/configuration-error";
import type { FailureCause } from "../studio/failure-cause";
import { isAbortError } from "../utils/abort";
import { abortReason } from "../utils/abort-reason";
import { platformError } from "../utils/platform-error";

const TIMEOUT_ERROR = "TimeoutError";

/** The time limit a request was sent with, and whether it ran out. */
export interface RequestExpiry {
  /** The request's timeout in ms */
  timeout?: number | undefined;
  /** Whether the timeout had run out when fetch rejected */
  timedOut?: boolean | undefined;
}

/**
 * What a request that fetch rejected is thrown as.
 *
 * Only fetch's own rejection is classified here, so a mistake made before
 * the request — a body that would not serialize — is never taken for a
 * network failure. A cancellation the caller asked for is thrown as one:
 * as fetch rejected it when that says so, as why the signal aborted when
 * not — expo/fetch rejects a cancelled request as a plain `FetchError`. A
 * timeout says it is one, also where fetch only reports an abort, as React
 * Native's does.
 *
 * @param error - What fetch rejected with
 * @param signal - The signal the caller gave, if any
 * @param expiry - The request's timeout, and whether it ran out
 * @returns The error to throw
 *
 * @example
 * ```ts
 * try { return await fetch(url, init); } catch (error) { throw fetchFailure(error, signal); }
 * ```
 */
export function fetchFailure(
  error: unknown,
  signal: AbortSignal | null | undefined,
  expiry: RequestExpiry = {},
): unknown {
  if (signal?.aborted) {
    return error === signal.reason || isAbortError(error) ? error : abortReason(signal);
  }
  if (expiry.timedOut || (error instanceof Error && error.name === TIMEOUT_ERROR)) {
    return timeoutFailure(error, expiry.timeout);
  }
  /* A misconfiguration found as the request was sent is the application's to fix, not the network's. */
  if (error instanceof HTTPError || error instanceof ConfigurationError || isAbortError(error)) {
    return error;
  }
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
  const { code, message } = platformCause(error);
  return new HTTPError(
    {
      status: 0,
      headers: new Headers(),
      data: { success: false, message, ...(code && { code }) },
    },
    { cause: error },
  );
}

/**
 * What the platform said of a connection it could not make or keep: the
 * system's code, where it gave one, and its text — read from the error's
 * cause where fetch wraps it, as undici's `fetch failed` does.
 *
 * @param error - What fetch, or a stream's connection, failed with
 * @returns The code and the text
 * @example
 * ```ts
 * platformCause(new TypeError("fetch failed", { cause: refused }));
 * // → { code: "ECONNREFUSED", message: "connect ECONNREFUSED 127.0.0.1:4010" }
 * ```
 */
export function platformCause(error: Error): FailureCause {
  const cause = error.cause instanceof Error ? error.cause : error;
  /* A code is a name, as the system gives it; undici's parser errors give none, as `undefined`. */
  const code =
    "code" in cause && typeof cause.code === "string" && cause.code !== "" ? cause.code : undefined;
  const message = describe(cause, code);
  return code === undefined ? { message } : { code, message };
}

/* Status 0 like any request that got no answer, but named for what it was,
   not "Network request failed" with the DOMException's legacy code "23". Its
   cause is a TimeoutError even where fetch reported only an abort. */
function timeoutFailure(error: unknown, timeout: number | undefined): HTTPError {
  const after = timeout === undefined ? "" : ` after ${timeout} ms`;
  const cause =
    error instanceof Error && error.name === TIMEOUT_ERROR
      ? error
      : platformError(`The request timed out${after}`, TIMEOUT_ERROR);
  return new HTTPError(
    {
      status: 0,
      headers: new Headers(),
      data: { success: false, message: `Request timed out${after}`, code: "TIMEOUT" },
    },
    { cause, message: "Request timed out" },
  );
}

/* A host that resolves to several addresses fails with an AggregateError
   whose own message is empty; its errors say which addresses refused. */
function describe(cause: Error, code: string | undefined): string {
  if (cause.message) return cause.message;
  if (typeof AggregateError === "function" && cause instanceof AggregateError) {
    const reasons = cause.errors.map((e: unknown) => (e instanceof Error ? e.message : String(e)));
    if (reasons.length > 0) return reasons.join("; ");
  }
  return code ?? "Request failed";
}
