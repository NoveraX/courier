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
