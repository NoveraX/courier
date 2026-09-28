import { type Interfaces, isOwnAddress } from "./own-addresses";
import { type SpecAddressKind, specAddressKind } from "./spec-address-kind";

/**
 * What an address is to Studio on this machine. An address of one of this
 * machine's own interfaces is this machine, whatever range it is in: the
 * developer's global IPv6 address is public by its range, yet a request to
 * it reaches the services listening here, as one to `localhost` does.
 *
 * A public address that the router sends back to this machine — hairpin
 * NAT — is on no interface of this machine and stays public.
 *
 * @param address - An IPv4 or IPv6 address, without brackets or zone
 * @param interfaces - This machine's interfaces, read for this request
 * @returns The address's kind, with this machine's own addresses as `loopback`
 * @example
 * ```ts
 * addressKindHere("2001:db8:5::1", readInterfaces()); // "loopback" on the machine that has it
 * ```
 */
export function addressKindHere(address: string, interfaces: Interfaces): SpecAddressKind {
  const kind = specAddressKind(address);
  if (kind === "loopback" || kind === "unspecified") return kind;
  return isOwnAddress(address, interfaces) ? "loopback" : kind;
}
