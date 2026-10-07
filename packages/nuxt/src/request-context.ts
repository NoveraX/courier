import { ConfigurationError, type IncomingRequest } from "@noverax/courier";
import { nodeIncomingRequest, withIncomingRequest } from "@noverax/courier/node";

import { type H3EventLike, isWebEvent } from "./h3-event";

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
  const response = Reflect.get(event, "res") as { headers?: Headers } | undefined;
  return {
    key: event,
    method: req.method,
    origin: new URL(req.url).origin,
    headers: req.headers,
    ...(response?.headers instanceof Headers && {
      setCookie: ({ header }) => {
        response.headers?.append("set-cookie", header);
        return true;
      },
    }),
  };
}
