import { CERTIFICATE_VERDICTS } from "../errors/network-failure";
import { RETRY_DEFAULTS } from "./retry-defaults";
import type { RetryFailure } from "./types";

/* The platform's codes for a failure that came before the request could leave: no address for
   the host, no route to it, a connection refused or not made in time. */
const BEFORE_SENDING: ReadonlySet<string> = new Set([
  "ENOTFOUND",
  "EAI_AGAIN",
  "ECONNREFUSED",
  "ENETUNREACH",
  "EHOSTUNREACH",
  "UND_ERR_CONNECT_TIMEOUT",
]);
const RETRIED: ReadonlySet<number> = new Set(RETRY_DEFAULTS.statuses);

/**
 * Whether a failure deserves another attempt where `retryOn` says nothing:
 * a request that got no answer, unless its certificate was refused, which
 * no second try mends; an answer whose status is one an upstream may get
 * over. A request whose own time ran out is not sent again: an upstream
 * that is slow would only be made slower.
 *
 * @param failure - Why the attempt failed
 * @returns Whether to try again
 */
export function retriedByDefault(failure: RetryFailure): boolean {
  if (failure.kind === "status") return RETRIED.has(failure.status);
  if (failure.kind === "timeout") return false;
  const code = failure.error.systemCode;
  return code === undefined || !(CERTIFICATE_VERDICTS.has(code) || code.startsWith("ERR_TLS_CERT"));
}

/**
 * Whether a failed request certainly never left, so the upstream never saw
 * it and a write can be sent again whatever it does: its host had no
 * address, refused the connection or did not take it in time. A browser
 * names no code, and a request that may have reached the server is not one.
 *
 * @param failure - Why the attempt failed
 * @returns Whether it never left
 */
export function neverLeft(failure: RetryFailure): boolean {
  return failure.kind === "network" && BEFORE_SENDING.has(failure.error.systemCode ?? "");
}
