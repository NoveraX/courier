import { parseAddress, plainAddress } from "../utils/ip-address";
import { type AddressTrust, deploymentTrust } from "./address-trust";
import { isLocalAddress, peerAddressOf } from "./peer-address";

/** Reads one of the request's headers, all its values joined, or nothing. */
export type HeaderOf = (name: string) => string | null | undefined;

/**
 * The address of the user a request comes from, as far as the deployment
 * lets Courier believe it: the one address a limit counts a caller by. An
 * upstream is sent the whole chain instead (see `forwardedFor`), and reads
 * it with its own trust.
 *
 * The connection's own address is the answer, unless it is this machine, a
 * private network or a proxy `COURIER_TRUSTED_PROXIES` names — a proxy in
 * front of the application. Then the forwarding chain is read from the
 * right, past every such hop, since each proxy appends the address it saw
 * and an entry the user forges stands left of it; or, for a request one of
 * the named proxies passed on, the header `COURIER_CLIENT_ADDRESS_HEADER`
 * names, such as DDoS-Guard's `DDG-Connecting-IP`. Where the runtime does not
 * report the connection — Next.js, an edge function — the chain's last entry
 * is the one the framework or the platform in front recorded.
 *
 * @param peer - The connection's address, or the one the framework vouches for
 * @param header - Reads the request's headers
 * @param trust - The proxies beyond the deployment's own network; the environment's by default
 * @returns The address, or `undefined` when nothing names one a proxy wrote
 * @example
 * ```ts
 * clientAddress("10.0.0.2", (name) => headers.get(name)); // "203.0.113.7" for XFF "1.2.3.4, 203.0.113.7"
 * clientAddress("203.0.113.9", (name) => headers.get(name)); // "203.0.113.9", whatever XFF says
 * ```
 */
export function clientAddress(
  peer: string | undefined,
  header: HeaderOf,
  trust: AddressTrust = deploymentTrust(),
): string | undefined {
  const own = peer === undefined ? undefined : canonical(peer);
  if (own !== undefined && !passesOn(own, trust)) return own;
  const hops = (header("x-forwarded-for") ?? "")
    .split(",")
    .map((hop) => hop.trim())
    .filter((hop) => hop !== "")
    .map(canonical);
  const named = namedByProxy(own, hops, header, trust);
  if (named !== undefined) return named;
  for (let index = hops.length - 1; index >= 0; index -= 1) {
    const hop = hops[index] ?? "";
    /* No proxy writes anything but an address: the user wrote this one. */
    if (parseAddress(hop) === undefined) return undefined;
    if (!passesOn(hop, trust)) return hop;
  }
  return hops[0] ?? own;
}

/**
 * The address of the user a `Request` comes from: `clientAddress`, with the
 * connection's address an adapter recorded for it.
 *
 * @param request - The request
 * @param trust - The proxies beyond the deployment's own network; the environment's by default
 * @returns The address, or `undefined`
 * @example
 * ```ts
 * requestClientAddress(request); // "203.0.113.7"
 * ```
 */
export function requestClientAddress(
  request: Request,
  trust: AddressTrust = deploymentTrust(),
): string | undefined {
  return clientAddress(peerAddressOf(request), (name) => request.headers.get(name), trust);
}

/* A hop that passes the request on: this machine, a private network, a named proxy. */
function passesOn(address: string, trust: AddressTrust): boolean {
  return isLocalAddress(address) || trust.has(address);
}

/* The address a named proxy reports, believed only from a request that came through one. */
function namedByProxy(
  own: string | undefined,
  hops: readonly string[],
  header: HeaderOf,
  trust: AddressTrust,
): string | undefined {
  if (trust.header === undefined) return undefined;
  const from = own !== undefined && trust.has(own) ? own : hops.at(-1);
  if (from === undefined || !trust.has(from)) return undefined;
  const named = canonical(header(trust.header)?.split(",").at(-1) ?? "");
  return parseAddress(named) === undefined ? undefined : named;
}

/* The address alone, an IPv4 address IPv6 maps written as itself. */
function canonical(text: string): string {
  const plain = plainAddress(text);
  return /^::ffff:\d{1,3}(?:\.\d{1,3}){3}$/i.test(plain) ? plain.slice(7) : plain.toLowerCase();
}
