import { ConfigurationError } from "../errors/configuration-error";
import { ownFields } from "../utils/own";
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
  /* Their own fields alone, as every option is read. */
  const own = ownFields(options);
  for (const option of ["fetch", "webSocket"] as const) {
    const value = own[option];
    if (value !== undefined && typeof value !== "function")
      throw notAFunction(option, value, owner);
  }
  const { dispatcher } = own;
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

/**
 * The error for a `fetch` or a `webSocket` that is not a function. It sits
 * beside the check a definition makes, apart from the `fetch` Courier
 * sends with in `source-transport.ts`: Next.js keeps in a module every
 * export any page of an app uses, and a page of definitions alone sends
 * nothing.
 *
 * @param option - Which of the two
 * @param value - What was given
 * @param owner - Whose it is: the source's, a group's or a call's
 * @returns The error
 * @example
 * ```ts
 * if (typeof own !== "function") throw notAFunction("webSocket", own, "group");
 * ```
 */
export function notAFunction(
  option: "fetch" | "webSocket",
  value: unknown,
  owner: "source" | "group" | "call" = "source",
): ConfigurationError {
  return new ConfigurationError(
    "SOURCE_TRANSPORT_INVALID",
    `[courier] A ${owner}'s ${option} must be a function; it is ${value === null ? "null" : typeof value}.`,
  );
}
