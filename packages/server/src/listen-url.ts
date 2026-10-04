/* Hosts that mean every interface when bound, and none when dialled. */
const WILDCARD_IPV4: ReadonlySet<string> = new Set(["", "0.0.0.0"]);
const WILDCARD_IPV6: ReadonlySet<string> = new Set(["::", "[::]"]);

/**
 * The URL a client dials to reach a server bound to `host` and `port`.
 *
 * A bind host is not always a dial host: a server bound to every interface
 * is reached at loopback, and an IPv6 literal goes in brackets — written as
 * it was bound, `::1` made `http://::1:3001`, which no URL parser accepts.
 *
 * @param host - The host the server binds, as configured
 * @param port - The port it listens on
 * @returns An `http://` URL a client can open
 * @example
 * ```ts
 * listenUrl("::1", 3001); // "http://[::1]:3001"
 * listenUrl("0.0.0.0", 3001); // "http://127.0.0.1:3001"
 * ```
 */
export function listenUrl(host: string, port: number): string {
  const dialled = WILDCARD_IPV4.has(host) ? "127.0.0.1" : WILDCARD_IPV6.has(host) ? "::1" : host;
  const bracketed = dialled.includes(":") && !dialled.startsWith("[") ? `[${dialled}]` : dialled;
  return `http://${bracketed}:${port}`;
}
