import type { IncomingRequest, RequestContextProvider } from "@noverax/courier";

/** The parts of SolidStart's request event the session reads. */
export interface SolidStartServerEvent {
  request: Request;
  /**
   * The response being prepared. SolidStart 2 hands over h3's own, which
   * keeps apart the headers an error response is sent with.
   */
  response: { headers: Headers; errHeaders?: Headers };
  /** The user's address, as SolidStart tells it */
  clientAddress?: string | undefined;
  /** The h3 event underneath */
  nativeEvent?: object;
}

const providers = new WeakMap<() => SolidStartServerEvent | undefined, RequestContextProvider>();

/* h3 2 lets go of the response it prepared by clearing this; a header added
   later goes nowhere. Missing, as in h3 1, it tells nothing. */
const H3_RESPONSE = Symbol.for("h3.internal.event.res");
const HANDED_BACK =
  "the response had already been handed back — a page waits only for what it loads with `deferStream: true`";

/**
 * What the session reads of the request SolidStart is serving, found by its
 * `getRequestEvent`: every call a page's `query`, a server function, an API
 * route or a step it awaits makes carries the user's session, and the
 * cookies the API sets reach the browser on the response SolidStart
 * prepares. SolidStart keeps the event itself, so nothing more is needed.
 *
 * A page streams: a cookie set after its first part was sent cannot reach
 * the browser, and the log says so. Load what may renew the session with
 * `deferStream: true`, so the page waits for it.
 *
 * @param getRequestEvent - `getRequestEvent` from `solid-js/web`
 * @returns The provider, to register once with `registerRequestContext`
 * @example
 * ```ts
 * // src/entry-server.tsx
 * import { registerRequestContext } from "@noverax/courier";
 * import { solidStartRequestContext } from "@noverax/courier-solid";
 * import { getRequestEvent } from "solid-js/web";
 *
 * registerRequestContext(solidStartRequestContext(getRequestEvent));
 * ```
 */
export function solidStartRequestContext(
  getRequestEvent: () => SolidStartServerEvent | undefined,
): RequestContextProvider {
  let provider = providers.get(getRequestEvent);
  if (provider === undefined) {
    provider = () => {
      const event = getRequestEvent();
      return event === undefined ? undefined : solidStartIncomingRequest(event);
    };
    providers.set(getRequestEvent, provider);
  }
  return provider;
}

/**
 * A SolidStart request event as the session reads it.
 *
 * @param event - The request event
 * @returns The request, as the session reads it
 * @example
 * ```ts
 * solidStartIncomingRequest(getRequestEvent());
 * ```
 */
export function solidStartIncomingRequest(event: SolidStartServerEvent): IncomingRequest {
  return {
    key: event,
    method: event.request.method,
    origin: URL.canParse(event.request.url) ? new URL(event.request.url).origin : undefined,
    headers: event.request.headers,
    clientAddress: event.clientAddress,
    setCookie: ({ header }) => setCookieOn(event, header),
  };
}

function setCookieOn(event: SolidStartServerEvent, header: string): true | string {
  if (handedBack(event.nativeEvent)) return HANDED_BACK;
  try {
    event.response.headers.append("set-cookie", header);
  } catch (error) {
    /* SolidStart 1 writes to Node's response, which refuses once its headers are out. */
    if (error instanceof Error && Reflect.get(error, "code") === "ERR_HTTP_HEADERS_SENT") {
      return HANDED_BACK;
    }
    throw error;
  }
  /* A session the API renewed reaches the browser on an error response too, as h3's own does. */
  event.response.errHeaders?.append("set-cookie", header);
  return true;
}

function handedBack(native: object | undefined): boolean {
  return (
    native !== undefined && H3_RESPONSE in native && Reflect.get(native, H3_RESPONSE) === undefined
  );
}
