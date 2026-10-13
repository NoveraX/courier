import { parseAddress } from "../../utils/ip-address";
import { requestClientAddress } from "../client-address";

/**
 * Who a request's caller is, for a limit to count: the user's address,
 * read from the right of the forwarding chain past the deployment's
 * proxies. An IPv6 address counts by its /64 network, which one subscriber
 * is given whole and could otherwise spend address by address; a request
 * that names no address counts as one unknown caller.
 *
 * @param request - The request
 * @returns The caller's key
 * @example
 * ```ts
 * callerKey(request); // "198.51.100.23", or "2001:db8:0:7::/64"
 * ```
 */
export function callerKey(request: Request): string {
  const address = requestClientAddress(request);
  if (address === undefined) return "unknown";
  const parsed = parseAddress(address);
  if (parsed?.family !== 6) return address;
  const network = parsed.value >> 64n;
  const groups = [48n, 32n, 16n, 0n].map((shift) => ((network >> shift) & 0xffffn).toString(16));
  return `${groups.join(":")}::/64`;
}
