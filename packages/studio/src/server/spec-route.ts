import { promises as dns } from "node:dns";
import { Agent as HttpAgent, type ProxyEnv } from "node:http";
import { Agent as HttpsAgent } from "node:https";
import { isIP } from "node:net";
import { createLogger } from "@noverax/courier";
import { addressKindHere } from "./address-kind-here";
import { approveSpecAddresses } from "./approve-spec-addresses";
import type { LookupCallback, LookupPolicy } from "./guarded-lookup";
import { readInterfaces } from "./own-addresses";
import { type SpecProxy, specProxyFor } from "./spec-proxy";

const log = createLogger("Studio");

/** How one request for a specification reaches its host. */
export interface SpecRoute {
  /** The agent it is sent with, which opens a connection of its own */
  readonly agent: HttpAgent;
  /** What resolves the host as the connection is made, when this machine connects to it */
  readonly lookup: LookupCallback | undefined;
  /** The proxy it goes through, when it does */
  readonly proxy: SpecProxy | undefined;
}

/**
 * How a request for a specification reaches its host: directly, connecting
 * only to an address the policy allows — or through the proxy Node's own
 * requests use, when Node is told to use one and the request may.
 *
 * Through a proxy the proxy resolves the host and connects to it, so Studio
 * checks the host first, as this machine resolves it: an address the
 * policy refuses is refused, and this machine is always reached directly —
 * a proxy asked for `localhost` reaches itself. A name this machine cannot
 * resolve is the proxy's to reach: in a network that resolves outside names
 * only at its proxy, that is every public host.
 *
 * @param url - Where the request goes; an address written out in it has been approved already
 * @param policy - What besides the public internet the request may reach
 * @param mayProxy - Whether the request may go through a proxy at all
 * @param lookup - What resolves the host as this machine connects to it, checking each address against the policy
 * @returns The route
 * @throws {SpecFetchError} For an address the policy refuses, or a proxy variable that names no URL
 * @throws {SpecHostsUnavailableError} For a private address, while Studio cannot tell whether the project allows it
 * @example
 * ```ts
 * const route = await specRoute(new URL(url), policy, true, guardedLookup(policy));
 * request(url, { agent: route.agent, lookup: route.lookup });
 * ```
 */
export async function specRoute(
  url: URL,
  policy: LookupPolicy,
  mayProxy: boolean,
  lookup: LookupCallback,
): Promise<SpecRoute> {
  const https = url.protocol === "https:";
  const proxy = mayProxy ? specProxyFor(url) : undefined;
  if (proxy === undefined || (await isThisMachine(url, policy))) {
    const agent = https
      ? new HttpsAgent({ keepAlive: false })
      : new HttpAgent({ keepAlive: false });
    return { agent, lookup, proxy: undefined };
  }
  /* The proxy alone, without NO_PROXY: whether this host goes through it was decided above. */
  const proxyEnv: ProxyEnv = {
    ...process.env,
    https_proxy: proxy.url,
    http_proxy: proxy.url,
    no_proxy: "",
    NO_PROXY: "",
  };
  const agent = https
    ? new HttpsAgent({ keepAlive: false, proxyEnv })
    : new HttpAgent({ keepAlive: false, proxyEnv });
  return { agent, lookup: undefined, proxy };
}

async function isThisMachine(url: URL, policy: LookupPolicy): Promise<boolean> {
  const bare = url.hostname.replace(/^\[|\]$/g, "");
  const written = isIP(bare) !== 0;
  const addresses = written ? [bare] : await resolvedHere(bare);
  if (!written) {
    await approveSpecAddresses(addresses, policy, (address) => `${url.hostname} (${address})`);
  }
  const interfaces = readInterfaces();
  return addresses.some((address) => addressKindHere(address, interfaces) === "loopback");
}

/* A name only the proxy can resolve has no address here, and nothing here to check. */
async function resolvedHere(hostname: string): Promise<string[]> {
  try {
    return (await dns.lookup(hostname, { all: true })).map((entry) => entry.address);
  } catch (error) {
    log.debug(`${hostname} does not resolve on this machine; the proxy resolves it`, error);
    return [];
  }
}
