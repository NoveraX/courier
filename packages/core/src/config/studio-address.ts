/**
 * Where Studio listens, and where everything that talks to it dials: one set
 * of constants for the server and every client.
 *
 * Both sides read the same port and the same *name*, `localhost`, so whatever
 * the resolver does, it does to both of them. A server bound to the name with
 * clients dialling the literal `127.0.0.1` fails on a host where `localhost`
 * resolves to `::1` — the common case — because nothing is bound on IPv4.
 */

/** Host Studio binds, and the one its clients dial. */
export const STUDIO_DEFAULT_HOST: string = "localhost";

/** Port Studio binds, and the one its clients dial. */
export const STUDIO_DEFAULT_PORT: number = 6280;

/** The address a client uses when nothing is configured. */
export const STUDIO_DEFAULT_URL: string = `http://${STUDIO_DEFAULT_HOST}:${STUDIO_DEFAULT_PORT}`;

/** Hosts that mean "every interface" when bound, and none when dialled. */
const WILDCARD_HOSTS: ReadonlySet<string> = new Set(["", "0.0.0.0", "::", "[::]"]);

/**
 * The URL a client dials to reach a Studio bound to `host` and `port`.
 *
 * A bind host is not always a dial host. Studio bound to `0.0.0.0` or `::`
 * listens everywhere but cannot be dialled at that address, and an IPv6
 * literal needs brackets in a URL: written verbatim they read
 * `http://0.0.0.0:6280` and the invalid `http://::1:6280`.
 *
 * @param host - The host Studio binds, as configured.
 * @param port - The port Studio listens on.
 * @returns An `http://` URL a browser or a Node client can open.
 *
 * @example
 * ```ts
 * formatStudioUrl("0.0.0.0", 6280) // "http://localhost:6280"
 * formatStudioUrl("::1", 6280) // "http://[::1]:6280"
 * ```
 */
export function formatStudioUrl(host: string, port: number): string {
  const dialled = WILDCARD_HOSTS.has(host) ? STUDIO_DEFAULT_HOST : host;
  const bracketed = dialled.includes(":") && !dialled.startsWith("[") ? `[${dialled}]` : dialled;
  return `http://${bracketed}:${port}`;
}
