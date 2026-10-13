import { ConfigurationError, type IncomingRequest } from "@noverax/courier";
import { forwardedChain } from "@noverax/courier/internal";
import { nodeIncomingRequest, withIncomingRequest } from "@noverax/courier/node";

import { type H3EventLike, isWebEvent, webEventAddress } from "./h3-event";

/** The part of a Nitro app the plugin wraps: the handler every request goes through. */
export interface NitroAppLike {
  h3App: { handler: (event: H3EventLike) => unknown };
}

/**
 * A Nitro plugin that serves every request with its session and headers at
 * hand: each call a page's setup, a `useAsyncData`, a plugin or a server
 * route makes — through every `await` — takes them from it, and the session
 * cookies the API sets reach the browser on the response. Nitro wraps its
 * own handler the same way for its `asyncContext`.
 *
 * @param nitroApp - The Nitro app, as `defineNitroPlugin` hands it
 * @throws ConfigurationError `REQUEST_CONTEXT_UNSUPPORTED` when Nitro serves requests some other way
 * @example
 * ```ts
 * // server/plugins/courier-request.ts
 * import { requestContextPlugin } from "@noverax/courier-nuxt";
 *
 * export default defineNitroPlugin(requestContextPlugin);
 * ```
 */
export function requestContextPlugin(nitroApp: NitroAppLike): void {
  const handler: unknown = nitroApp.h3App?.handler;
  if (typeof handler !== "function") {
    throw new ConfigurationError(
      "REQUEST_CONTEXT_UNSUPPORTED",
      "requestContextPlugin wraps the handler Nitro 2 serves every request with, and this Nitro has none",
    );
  }
  const serve = handler as NitroAppLike["h3App"]["handler"];
  nitroApp.h3App.handler = (event) =>
    withIncomingRequest(nuxtIncomingRequest(event), () => serve(event));
}

/**
 * An h3 event, of either major, as the session reads it: on Node, the
 * request and the response it wraps; on h3 2.x, its Web request, and the
 * headers of the response it prepares.
 *
 * @param event - The event
 * @returns The request, as the session reads it
 * @example
 * ```ts
 * withIncomingRequest(nuxtIncomingRequest(event), () => handler(event));
 * ```
 */
export function nuxtIncomingRequest(event: H3EventLike): IncomingRequest {
  if (!isWebEvent(event)) return nodeIncomingRequest(event.node.req, event.node.res);
  const { req } = event;
  const headers = responseHeadersOf(event);
  return {
    key: event,
    method: req.method,
    origin: new URL(req.url).origin,
    headers: req.headers,
    clientAddress: forwardedChain(webEventAddress(event), req.headers.get("x-forwarded-for")),
    ...(headers !== undefined && {
      setCookie: ({ header }) => {
        headers.append("set-cookie", header);
        return true;
      },
    }),
  };
}

/* The headers of the response an h3 2.x event prepares, where it has one. */
function responseHeadersOf(event: object): Headers | undefined {
  const response: unknown = Reflect.get(event, "res");
  if (typeof response !== "object" || response === null) return undefined;
  const headers: unknown = Reflect.get(response, "headers");
  return headers instanceof Headers ? headers : undefined;
}
