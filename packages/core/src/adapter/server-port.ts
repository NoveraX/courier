/**
 * The port the server accepted a request on, where the runtime knows it.
 *
 * A web `Request` carries none. A Node adapter reads it from the socket and
 * records it here, so the app's origin is learned only from a request that
 * names this very server: a `Host` on any other port names something else.
 */

const ports = new WeakMap<Request, number>();

/**
 * Record the port a request was accepted on.
 *
 * @param request - The request
 * @param port - The socket's local port, when it has one
 * @example
 * ```ts
 * rememberServerPort(request, nodeReq.socket.localPort);
 * ```
 */
export function rememberServerPort(request: Request, port: number | undefined): void {
  if (port !== undefined && Number.isInteger(port) && port > 0) ports.set(request, port);
}

/**
 * The port a request was accepted on, if the runtime recorded one.
 *
 * @param request - The request
 * @returns The socket's local port, or `undefined`
 * @example
 * ```ts
 * serverPortOf(request); // → 3000
 * ```
 */
export function serverPortOf(request: Request): number | undefined {
  return ports.get(request);
}
