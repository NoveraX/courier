import { parseAddress, plainAddress } from "../../utils/ip-address";
import { requestClientAddress } from "../client-address";

/**
 * The key Courier's limit counts an address by: an IPv4 address as it is,
 * wherever IPv6 maps it, and an IPv6 address by its /64 network, which one
 * subscriber is given whole and could otherwise spend address by address.
 * No address, or anything that is not one, counts as one unknown caller.
 *
 * @param address - The user's address, as a header or a socket writes it
 * @returns The caller's key
 * @example
 * ```ts
 * callerKeyOf("2001:db8:0:7::12"); // "2001:db8:0:7::/64"
 * callerKeyOf("198.51.100.23"); // "198.51.100.23"
 * ```
 */
export function callerKeyOf(address: string | undefined): string {
  const parsed = address === undefined ? undefined : parseAddress(plainAddress(address));
  if (parsed === undefined) return "unknown";
  const { family, value } = parsed;
  if (family === 4) return [24n, 16n, 8n, 0n].map((shift) => (value >> shift) & 0xffn).join(".");
  const network = value >> 64n;
  const groups = [48n, 32n, 16n, 0n].map((shift) => ((network >> shift) & 0xffffn).toString(16));
  return `${groups.join(":")}::/64`;
}

/**
 * Who a request's caller is, for a limit to count: the user's address,
 * read from the right of the forwarding chain past the deployment's
 * proxies, by its key (see `callerKeyOf`).
 *
 * @param request - The request
 * @returns The caller's key
 * @example
 * ```ts
 * callerKey(request); // "198.51.100.23", or "2001:db8:0:7::/64"
 * ```
 */
export function callerKey(request: Request): string {
  return callerKeyOf(requestClientAddress(request));
}
