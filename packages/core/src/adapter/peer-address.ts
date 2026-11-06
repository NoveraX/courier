/**
 * The network address a request arrived from, where the runtime knows it.
 *
 * A web `Request` carries no peer address. A Node adapter converts its
 * `IncomingMessage` into one and records the socket's address here, so the
 * WebSocket handler can count a connection against the real caller rather
 * than against a header the caller wrote.
 */

const peers = new WeakMap<Request, string>();

/**
 * Record the address a request came from.
 *
 * @param request - The converted request
 * @param address - The socket's remote address, when it has one
 */
export function rememberPeerAddress(request: Request, address: string | undefined): void {
  if (address) peers.set(request, address);
}

/**
 * The address a request came from, if the runtime recorded one.
 *
 * @param request - A request converted by a Node adapter
 * @returns The socket's remote address, or `undefined`
 */
export function peerAddressOf(request: Request): string | undefined {
  return peers.get(request);
}
