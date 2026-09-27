import type { IncomingMessage, ServerResponse } from "node:http";

/**
 * The part of an h3 2.x event the adapter reads: the Web request itself.
 */
export interface H3WebEvent {
  readonly req: Request;
}

/**
 * The part of an h3 1.x event the adapter reads — what Nitro 2, and so
 * Nuxt 3 and 4, hands a route. It wraps Node's request and response, and
 * carries a Web request only when h3 itself was serving one.
 */
export interface H3NodeEvent {
  readonly node: { readonly req: IncomingMessage; readonly res: ServerResponse };
  readonly web?: { readonly request?: Request };
}

/** An event from either h3 major. */
export type H3EventLike = H3WebEvent | H3NodeEvent;

/**
 * An h3 event handler, as both majors call it.
 *
 * `__is_handler__` is how h3 1.x recognizes a handler it was given;
 * h3 2.x takes any function.
 */
export type CourierEventHandler = ((event: H3EventLike) => Promise<Response>) & {
  readonly __is_handler__: true;
};

/**
 * Is this event from h3 2.x?
 *
 * An h3 1.x event also has a `req` — a deprecated alias of Node's request —
 * so the property's presence says nothing; only a Web request does.
 *
 * @param event - An event from either h3 major
 * @returns `true` when the event carries a Web request
 */
export function isWebEvent(event: H3EventLike): event is H3WebEvent {
  return "req" in event && event.req instanceof Request;
}
