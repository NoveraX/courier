import { networkInterfaces } from "node:os";
import { formatStudioUrl } from "@noverax/courier/config";
import { isLoopbackHostname, WILDCARD_HOSTS } from "./local-host";

/** Where Studio can be opened: on this machine, and from the network. */
export interface StudioUrls {
  /** The address on this machine, when Studio listens on one. */
  local?: string;
  /** Addresses other machines can open. */
  network: readonly string[];
}

type Interfaces = ReturnType<typeof networkInterfaces>;

/**
 * An address of Studio's with the project's token, which a page opened at it
 * keeps and presents to make changes. The token rides in the fragment, which
 * a browser never sends, so no request line or log carries it.
 *
 * @param url - An address of Studio's
 * @param token - The project's token
 * @returns The link
 * @example
 * ```ts
 * tokenLink("http://localhost:6280", "k3…"); // "http://localhost:6280/#token=k3…"
 * ```
 */
export function tokenLink(url: string, token: string): string {
  return `${url.replace(/\/$/, "")}/#token=${token}`;
}

/**
 * Every address of Studio's, as a link with the project's token.
 *
 * @param urls - Where Studio answers
 * @param token - The project's token
 * @returns The same addresses, each carrying the token
 * @example
 * ```ts
 * withToken(studioUrls("localhost", 6280), token);
 * ```
 */
export function withToken(urls: StudioUrls, token: string): StudioUrls {
  return {
    ...(urls.local === undefined ? {} : { local: tokenLink(urls.local, token) }),
    network: urls.network.map((url) => tokenLink(url, token)),
  };
}

/**
 * The addresses a Studio bound to `host` and listening on `port` answers at.
 *
 * Only addresses that actually listen are listed: a Studio bound to
 * `localhost` is not on the network, whatever interfaces the machine has.
 *
 * @param host - The host Studio binds, as configured.
 * @param port - The port it listens on.
 * @param interfaces - This machine's interfaces.
 * @returns The local address and the network addresses.
 */
export function studioUrls(
  host: string,
  port: number,
  interfaces: Interfaces = networkInterfaces(),
): StudioUrls {
  if (WILDCARD_HOSTS.has(host)) {
    const ipv6 = host.includes(":");
    const network = externalAddresses(interfaces, ipv6).map((address) =>
      formatStudioUrl(address, port),
    );
    return { local: formatStudioUrl(host, port), network };
  }
  if (isLoopbackHostname(host)) return { local: formatStudioUrl(host, port), network: [] };
  return { network: [formatStudioUrl(host, port)] };
}

/** Non-loopback addresses; IPv6 ones only for an IPv6 wildcard, and never link-local. */
function externalAddresses(interfaces: Interfaces, ipv6: boolean): string[] {
  const addresses: string[] = [];
  for (const entries of Object.values(interfaces)) {
    for (const entry of entries ?? []) {
      if (entry.internal) continue;
      if (entry.family === "IPv4") addresses.push(entry.address);
      else if (ipv6 && !entry.address.toLowerCase().startsWith("fe80:"))
        addresses.push(entry.address);
    }
  }
  return addresses;
}
