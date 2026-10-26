import { type RequestFailureCause, readCause } from "@noverax/courier-studio-core";

import { isPlainObject } from "../is-plain-object";

/**
 * Why a request failed, on one line: what it failed with and — for one
 * that got no answer — why, as the runtime said it, so an editor's list,
 * its notices and the agents that read Studio have the reason without
 * opening the request: `fetch failed — UND_ERR_CONNECT_TIMEOUT: Connect
 * Timeout Error (attempted address: api.test:443, timeout: 10000ms)`. A
 * cause the text already holds is not said twice, a code its text names
 * is not repeated, and a failure whose own text is empty — Node's, for a
 * host none of whose addresses answered — is told by its cause alone.
 *
 * @param failure - A `request:error` event's `error`, its texts already cut
 * @returns The line, or `undefined` for a failure that says nothing
 * @example
 * ```ts
 * failureSummary({ type: "network", message: "Network request failed", cause: { code: "ENOTFOUND", message: "getaddrinfo ENOTFOUND api.test" } });
 * // "Network request failed — getaddrinfo ENOTFOUND api.test"
 * ```
 */
export function failureSummary(failure: unknown): string | undefined {
  if (!isPlainObject(failure) || typeof failure.message !== "string") return undefined;
  const said = failure.message;
  const cause = readCause(failure.cause);
  if (cause === undefined) return said;
  if (said.trim() === "") return causeLine(cause);
  if (said.includes(cause.message) || cause.message.includes(said)) return said;
  return `${said} — ${causeLine(cause)}`;
}

function causeLine({ code, message }: RequestFailureCause): string {
  return code === undefined || message.includes(code) ? message : `${code}: ${message}`;
}
