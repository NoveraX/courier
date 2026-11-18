import type { RefusalLog } from "../../logger/refusal-log";
import type { StudioHooks } from "../../studio/hooks";
import { readGrant } from "../cors";
import { checkEntry } from "../entry-gate";
import type { EntryRequest } from "../entry-request";
import type { HandlerConfig } from "../handler-config";
import type { HTTPTransport, TransportRequest } from "./create-http-transport";
import { type HTTPAnswer, refusal } from "./http-answers";

/**
 * A request of the HTTP transport as the server that read it hands it
 * over, whichever server it is: what the handler's gate reads of it, and
 * what its transport does with it.
 */
export interface HTTPExchange extends EntryRequest, TransportRequest {
  /** Take its body off the connection unread: the gate refused it */
  discard(): void;
}

/**
 * A handler's HTTP transport behind its gate: what answers each of the
 * transport's requests, a web `Request` or Node's own.
 */
export type HTTPEntry = (exchange: HTTPExchange) => Promise<HTTPAnswer>;

/** What a request is answered by a handler that has no HTTP transport. */
export const NO_HTTP_TRANSPORT: HTTPAnswer = refusal(
  404,
  "This handler has no HTTP transport",
  "NOT_FOUND",
);

/* Each handler's entry, for a server that answers its requests on objects of its own. */
const entries = new WeakMap<object, HTTPEntry>();

/**
 * The HTTP transport's entry: each request held first to the hosts and
 * origins the handler's sockets are — refused by them, its body taken off
 * unread; a listed origin's preflight answered — and then answered by the
 * transport, a listed origin given leave to read the answer.
 *
 * @param transport - The handler's transport
 * @param config - The handler's hosts and origins
 * @param dt - The Studio hooks, told of each page refused for its origin
 * @param refusals - The handler's log of refusals
 * @returns The entry
 * @example
 * ```ts
 * const entry = createHTTPEntry(http, { allowedHosts, allowedOrigins }, studioHooks, refusals);
 * const answer = await entry(exchange);
 * ```
 */
export function createHTTPEntry(
  transport: HTTPTransport,
  config: Pick<HandlerConfig, "allowedHosts" | "allowedOrigins">,
  dt: StudioHooks,
  refusals: RefusalLog,
): HTTPEntry {
  return async (exchange) => {
    const verdict = checkEntry(exchange, config, dt, refusals);
    if ("refused" in verdict) {
      exchange.discard();
      const { status, message, code } = verdict.refused;
      return refusal(status, message, code);
    }
    if ("preflight" in verdict) return { status: 204, headers: verdict.preflight, body: undefined };
    const answer = await transport.answer(exchange);
    return verdict.reader === undefined ? answer : readableBy(answer, verdict.reader);
  };
}

/* An answer a page on a listed origin may read. */
function readableBy(answer: HTTPAnswer, reader: string): HTTPAnswer {
  const { vary } = answer.headers;
  const headers = {
    ...answer.headers,
    ...readGrant(reader, Object.keys(answer.headers)),
    vary: vary === undefined ? "Origin" : `${vary}, Origin`,
  };
  return { ...answer, headers };
}

/**
 * Keep a handler's entry, for a server that reads the transport's requests
 * and writes its answers itself: Node's, through `answerTransportRequest`.
 *
 * @param handler - The handler
 * @param entry - Its HTTP transport's entry
 * @example
 * ```ts
 * registerHTTPEntry(handler, entry);
 * ```
 */
export function registerHTTPEntry(handler: object, entry: HTTPEntry): void {
  entries.set(handler, entry);
}

/**
 * The entry of a handler's HTTP transport, as `registerHTTPEntry` kept it.
 *
 * @param handler - The handler
 * @returns Its entry, or `undefined` for a handler with no HTTP transport
 * @example
 * ```ts
 * const entry = httpEntryOf(handler);
 * if (entry === undefined) return writeAnswer(res, NO_HTTP_TRANSPORT);
 * ```
 */
export function httpEntryOf(handler: object): HTTPEntry | undefined {
  return entries.get(handler);
}
