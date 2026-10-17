/* This machine by name: `localhost`, which every system maps to itself, and
   the loopback addresses. A sub-domain of `localhost` is left out: a browser
   keeps it on this machine, but Node asks the system's resolver, which may
   send it to the network. */
const LOOPBACK = /^(?:localhost|127(?:\.\d{1,3}){3}|\[::1\])$/i;

/**
 * Whether a host name, as a URL spells it, is this machine's own.
 *
 * @param hostname - The name, `URL.hostname` style: lower case, an IPv6 address in brackets
 * @returns `true` for `localhost`, `127.0.0.0/8` and `[::1]`
 * @example
 * ```ts
 * isLoopbackHostname(new URL("http://127.0.0.1:3000").hostname); // → true
 * isLoopbackHostname("app.localhost"); // → false
 * ```
 */
export function isLoopbackHostname(hostname: string): boolean {
  return LOOPBACK.test(hostname);
}

/**
 * Whether a socket's peer address is this machine's own: a loopback
 * address, written as IPv4, IPv6 or IPv4-mapped IPv6.
 *
 * @param address - The peer address, as a socket reports it
 * @returns `true` for `127.0.0.0/8` and `::1`
 * @example
 * ```ts
 * isLoopbackAddress("::ffff:127.0.0.1"); // → true
 * isLoopbackAddress("192.168.1.20"); // → false
 * ```
 */
export function isLoopbackAddress(address: string): boolean {
  const ip = address.toLowerCase().replace(/^::ffff:/, "");
  return ip === "::1" || /^127(?:\.\d{1,3}){3}$/.test(ip);
}
