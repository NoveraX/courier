import { CourierError } from "../errors/courier-error";
import { NetworkError } from "../errors/network-error";
import { TimeoutError } from "../errors/timeout-error";
import type { FailureCause } from "../studio/failure-cause";
import { isAbortError } from "../utils/abort";
import { abortReason } from "../utils/abort-reason";

const TIMEOUT_ERROR = "TimeoutError";

/** The time limit a request was sent with, and whether it ran out. */
export interface RequestExpiry {
  /** The request's timeout in ms */
  timeout?: number | undefined;
  /** Whether the timeout had run out when fetch rejected */
  timedOut?: boolean | undefined;
}

/**
 * What a request that fetch rejected is thrown as — the one place a failure
 * is told apart by what happened, so nothing downstream guesses from a
 * status.
 *
 * Only fetch's own rejection is classified here, so a mistake made before
 * the request — a body that would not serialize — is never taken for a
 * network failure. A cancellation the caller asked for is thrown as one:
 * as fetch rejected it when that says so, as why the signal aborted when
 * not — expo/fetch rejects a cancelled request as a plain `FetchError`. A
 * Courier error stays what it is: a misconfiguration found as the request
 * was sent, or a deadline that ran out. The request's own timeout is a
 * `TimeoutError`, also where fetch only reports an abort, as React
 * Native's does; anything else fetch rejected with is a `NetworkError`.
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
  if (error instanceof CourierError) return error;
  if (expiry.timedOut || (error instanceof Error && error.name === TIMEOUT_ERROR)) {
    return new TimeoutError({ scope: "attempt", timeout: expiry.timeout, cause: error });
  }
  if (isAbortError(error)) return error;
  return error instanceof Error ? transportFailure(error) : error;
}

/**
 * The error a request that never got an answer is thrown as: a
 * `NetworkError` with the system's code, where it gave one, and fetch's
 * error as its cause.
 *
 * @param error - What fetch, or the answer's body as it was read, failed with
 * @returns The NetworkError to throw
 */
export function transportFailure(error: Error): NetworkError {
  return new NetworkError({ cause: error, systemCode: codeOf(rootOf(error)) });
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
  return causeOf(rootOf(error));
}

/**
 * What one error the platform raised says of a connection: the system's
 * code, where it gave one, and its text — the addresses an AggregateError
 * gathered, when it says nothing itself.
 *
 * @param error - The error that says why, read as it is
 * @returns The code and the text
 * @example
 * ```ts
 * causeOf(refused); // → { code: "ECONNREFUSED", message: "connect ECONNREFUSED 127.0.0.1:4010" }
 * ```
 */
export function causeOf(error: Error): FailureCause {
  const code = codeOf(error);
  const message = describe(error, code);
  return code === undefined ? { message } : { code, message };
}

/* undici's `fetch failed` says why in its cause; an error with none says it itself. */
function rootOf(error: Error): Error {
  return error.cause instanceof Error ? error.cause : error;
}

/* A code is a name, as the system gives it; undici's parser errors give none, as `undefined`. */
function codeOf(error: Error): string | undefined {
  return "code" in error && typeof error.code === "string" && error.code !== ""
    ? error.code
    : undefined;
}

/* A host that resolves to several addresses fails with an AggregateError
   whose own message is empty; its errors say which addresses refused. */
function describe(cause: Error, code: string | undefined): string {
  if (cause.message) return cause.message;
  const gathered: unknown =
    typeof AggregateError === "function" && cause instanceof AggregateError ? cause.errors : [];
  if (Array.isArray(gathered) && gathered.length > 0) {
    return gathered.map((e: unknown) => (e instanceof Error ? e.message : String(e))).join("; ");
  }
  return code ?? "Request failed";
}
