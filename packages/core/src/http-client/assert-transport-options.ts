import { ConfigurationError } from "../errors/configuration-error";
import { notAFunction } from "./source-transport";
import type { TransportOwner } from "./transport-options";

/**
 * Refuse, where a source or a group is defined or a call is made, a
 * transport that could not send: a `fetch` or a `webSocket` that is not a
 * function, a `dispatcher` that is no undici `Dispatcher` — an object with
 * its `dispatch` — so it fails there, rather than at its first request.
 *
 * @param options - The source's, the group's or the call's options
 * @param owner - Whose they are, for the message
 * @throws {ConfigurationError} `SOURCE_TRANSPORT_INVALID` for each of the three that cannot send
 * @example
 * ```ts
 * assertTransportOptions({ fetch: undiciFetch, dispatcher: new Agent() }, "group");
 * ```
 */
export function assertTransportOptions(
  options: {
    readonly fetch?: unknown;
    readonly webSocket?: unknown;
    readonly dispatcher?: unknown;
  },
  owner: TransportOwner,
): void {
  for (const option of ["fetch", "webSocket"] as const) {
    const value = options[option];
    if (value !== undefined && typeof value !== "function")
      throw notAFunction(option, value, owner);
  }
  const { dispatcher } = options;
  if (dispatcher === undefined || isDispatcher(dispatcher)) return;
  throw new ConfigurationError(
    "SOURCE_TRANSPORT_INVALID",
    `[courier] A ${owner}'s dispatcher must be an undici Dispatcher — an Agent, a ProxyAgent — with its dispatch method; it is ${dispatcher === null ? "null" : typeof dispatcher}.`,
  );
}

function isDispatcher(value: unknown): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof Reflect.get(value, "dispatch") === "function"
  );
}
