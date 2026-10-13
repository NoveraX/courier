import { clientAddress } from "../adapter/client-address";
import type { IncomingRequest } from "./incoming-request";

/* One address, or a forwarding chain of them, as a header carries it. */
const ADDRESSES = /^[ -~]{1,512}$/;
const FORWARDED_FOR = "x-forwarded-for";

/**
 * The headers `clientAddress` sends the user's address in: `X-Forwarded-For`
 * with the chain the proxies in front recorded, and each header it names
 * with the user's address alone — read from the right of that chain, past
 * this machine, private networks and the proxies `COURIER_TRUSTED_PROXIES`
 * names, or from the header such a proxy names the user in. Named, the
 * chain's own header carries the address alone too, and RFC 7239's
 * `Forwarded` carries it as `for=`.
 *
 * @param incoming - The request being served
 * @param option - `clientAddress` as the API set it
 * @returns The headers, by name; none when nothing recorded an address
 * @example
 * ```ts
 * addressHeaders(incoming, ["x-real-ip"]);
 * // [["x-forwarded-for", "198.51.100.23, 10.0.0.2"], ["x-real-ip", "198.51.100.23"]]
 * ```
 */
export function addressHeaders(
  incoming: IncomingRequest,
  option: true | string | readonly string[],
): Array<[string, string]> {
  const chain = incoming.clientAddress?.trim();
  if (!chain || !ADDRESSES.test(chain)) return [];
  const names = (option === true ? [] : typeof option === "string" ? [option] : [...option]).map(
    (name) => name.toLowerCase(),
  );
  const headers: Array<[string, string]> = [];
  if (!names.includes(FORWARDED_FOR)) headers.push([FORWARDED_FOR, chain]);
  if (names.length === 0) return headers;
  const user = clientAddress(undefined, (name) =>
    name === FORWARDED_FOR ? chain : incoming.headers.get(name),
  );
  if (user === undefined) return headers;
  for (const name of new Set(names)) {
    headers.push([name, name === "forwarded" ? forwardedElement(user) : user]);
  }
  return headers;
}

/* RFC 7239: an IPv6 address is quoted and bracketed, an IPv4 one written as it is. */
function forwardedElement(address: string): string {
  return address.includes(":") ? `for="[${address}]"` : `for=${address}`;
}
