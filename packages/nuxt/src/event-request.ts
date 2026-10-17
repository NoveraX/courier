import { rememberPeerAddress, rememberServerPort } from "@noverax/courier/internal";
import { toWebRequest } from "@noverax/courier/node";

import { type H3EventLike, isWebEvent, webEventAddress } from "./h3-event";
import { keptBodyOf } from "./kept-body";

/**
 * The Web request behind an h3 event, whichever h3 major created it.
 *
 * The request is read from the event itself rather than through h3's own
 * helpers. A package manager may resolve this adapter's `h3` to a different
 * major than the one Nitro runs — npm did exactly that in a fresh Nuxt 4
 * app — and h3 2.x's helpers read an h3 1.x event as if it carried a Web
 * request, which it does not.
 *
 * An h3 1.x event on a real Node server is converted the way every Node
 * adapter converts a request, so the request's signal also fires when the
 * client leaves mid-stream. A body that h3 or Nitro already read is taken
 * from where they kept it.
 *
 * @param event - An event from h3 1.x or 2.x
 * @returns The request to hand the Courier handler
 *
 * @example
 * ```ts
 * export default defineEventHandler(async (event) => handle(await requestOfEvent(event)));
 * ```
 */
export async function requestOfEvent(event: H3EventLike): Promise<Request> {
  if (isWebEvent(event)) {
    return withPeer(event.req, webEventAddress(event), socketOf(field(event.req, "runtime")));
  }
  if (event.web?.request) {
    const socket = socketOf(event);
    return withPeer(event.web.request, stringField(socket, "remoteAddress"), socket);
  }

  const { req, res } = event.node;
  const kept = await keptBodyOf(req);
  return toWebRequest(req, res, () => kept);
}

/* The request, with the address it came from and the port it was accepted on
   recorded for the proxy, and for the app's origin, to read. */
function withPeer(request: Request, address: string | undefined, socket: unknown): Request {
  rememberPeerAddress(request, address);
  const port = field(socket, "localPort");
  rememberServerPort(request, typeof port === "number" ? port : undefined);
  return request;
}

/* The socket of the Node request under an event — h3 1.x's `node`, or the
   `runtime.node` h3 2.x's request carries on Node; elsewhere there is none. */
function socketOf(holder: unknown): unknown {
  return field(field(field(holder, "node"), "req"), "socket");
}

function stringField(value: unknown, key: string): string | undefined {
  const found = field(value, key);
  return typeof found === "string" ? found : undefined;
}

function field(value: unknown, key: string): unknown {
  return typeof value === "object" && value !== null ? Reflect.get(value, key) : undefined;
}
