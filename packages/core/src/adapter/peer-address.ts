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

/**
 * Is this address one a reverse proxy in front of the application would
 * have — loopback, a private network, or link-local?
 *
 * Only such a peer is trusted to say who the real caller is. A caller on a
 * public address that sends `X-Forwarded-For` is describing itself.
 *
 * @param address - An IPv4 or IPv6 address, possibly IPv4-mapped
 * @returns `true` for loopback, RFC 1918, link-local and unique-local ranges
 *
 * @example
 * ```ts
 * isLocalAddress("::ffff:10.0.0.7"); // → true
 * isLocalAddress("203.0.113.9");     // → false
 * ```
 */
export function isLocalAddress(address: string): boolean {
  const ip = address.toLowerCase().replace(/^::ffff:/, "");
  if (ip === "::1") return true;
  if (/^f[cd][0-9a-f]{2}:/.test(ip) || /^fe[89ab][0-9a-f]:/.test(ip)) return true;

  const octets = ip.split(".").map(Number);
  if (octets.length !== 4 || octets.some((part) => !Number.isInteger(part))) return false;
  const [a = -1, b = -1] = octets;
  return (
    a === 127 ||
    a === 10 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 169 && b === 254)
  );
}
