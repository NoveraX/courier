import { peerAddressOf, rememberPeerAddress } from "./peer-address";

/**
 * What reports the client's connection closing: a Node socket, or a Node
 * response. Typed by shape so the adapters that pass one need not depend on
 * `node:http`.
 */
export interface ClientConnection {
  /** Whether the connection had already closed. */
  readonly destroyed: boolean;
  once(event: "close", listener: () => void): unknown;
  off(event: "close", listener: () => void): unknown;
}

/* The request again, with a signal of its own. It is built from its parts:
   a request the runtime made its own way — srvx's, which Nitro 3 serves
   SolidStart 2 with — passes for a Request but cannot be copied as one. */
function withSignal(request: Request, signal: AbortSignal): Request {
  const init: RequestInit & { duplex?: "half" } = {
    method: request.method,
    headers: request.headers,
    body: request.body,
    signal,
  };
  if (request.body) init.duplex = "half";
  const again = new Request(request.url, init);
  rememberPeerAddress(again, peerAddressOf(request));
  return again;
}

/**
 * Run a proxy handler with a request that is aborted when the client leaves.
 *
 * The proxy stops its upstream call through the request's signal. SvelteKit,
 * SolidStart's dev server and Nuxt build the Web request without one that
 * fires when the browser goes away, so a cancelled call — a 25 MB upload to a
 * slow upstream, say — ran to completion for nobody. An adapter that can
 * reach the Node connection passes it here, and the signal the handler sees
 * then fires when either the framework's signal or the connection does.
 *
 * The connection is watched until the handler has answered. A body streamed
 * after that is cancelled by the framework itself when its client leaves,
 * and a kept-alive socket must not abort the next request it carries.
 *
 * @param handle - The proxy handler, from `createHandler()`
 * @param request - The request the framework built
 * @param connection - The client's socket or response, when the platform has one
 * @returns The handler's answer
 *
 * @example
 * ```ts
 * const { handle } = createHandler();
 * export const POST = ({ request, platform }) =>
 *   handleWhileConnected(handle, request, platform?.req?.socket);
 * ```
 */
export async function handleWhileConnected(
  handle: (request: Request) => Promise<Response>,
  request: Request,
  connection: ClientConnection | undefined,
): Promise<Response> {
  if (!connection) return handle(request);

  const controller = new AbortController();
  const abort = () => controller.abort();
  request.signal.addEventListener("abort", abort, { once: true });
  connection.once("close", abort);
  if (request.signal.aborted || connection.destroyed) abort();

  try {
    return await handle(withSignal(request, controller.signal));
  } finally {
    connection.off("close", abort);
    request.signal.removeEventListener("abort", abort);
  }
}
