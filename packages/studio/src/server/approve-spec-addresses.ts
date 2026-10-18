import { addressKindHere } from "./address-kind-here";
import type { LookupPolicy } from "./guarded-lookup";
import { readInterfaces } from "./own-addresses";
import type { SpecAddressKind } from "./spec-address-kind";
import { SpecFetchError } from "./spec-fetch-error";

/**
 * Decide whether a request for a specification may connect to the addresses
 * its host is: all of them must pass, since the connection may use any.
 *
 * A public address passes, and this machine — a loopback address, or one
 * of its own interfaces' — when the policy allows it, without asking the
 * project. An address that means every interface never passes. Any other
 * address — a private network, or this machine when a server elsewhere sent
 * the request there — passes only when the policy admits the host, which it
 * is asked once, whatever the number of such addresses.
 *
 * An address of the benchmarking range passes as a public one when a name
 * was looked up to it — a fake-IP proxy's answer for the name the request
 * gave — and as a private one when the URL writes it out, where no name
 * says where the proxy takes it.
 *
 * @param addresses - The addresses the host is, without brackets
 * @param policy - What besides the public internet the request may reach
 * @param describe - How to name the host in a refusal, given the address refused
 * @param options - Whether the URL writes the addresses out, rather than a name looked up to them
 * @throws {SpecFetchError} For an address that means every interface, or a private one not admitted
 * @throws {SpecHostsUnavailableError} When Studio cannot tell whether the project admits the host
 *
 * @example
 * ```ts
 * await approveSpecAddresses(["10.0.0.7"], policy, (address) => `gitlab.internal (${address})`);
 * ```
 */
export async function approveSpecAddresses(
  addresses: readonly string[],
  policy: LookupPolicy,
  describe: (address: string) => string,
  { written = false }: { written?: boolean } = {},
): Promise<void> {
  let withheld: string | undefined;
  const interfaces = readInterfaces();
  for (const address of addresses) {
    const kind = addressKindHere(address, interfaces);
    if (kind === "unspecified") throw SpecFetchError.unspecifiedHost(describe(address));
    if (isWithheld(kind, policy, written)) withheld ??= address;
  }
  if (withheld !== undefined) await policy.admitPrivate(describe(withheld));
}

/* Whether an address of this kind is reached only when the policy admits its host. */
function isWithheld(kind: SpecAddressKind, policy: LookupPolicy, written: boolean): boolean {
  if (kind === "loopback") return !policy.loopback;
  return kind === "private" || (kind === "benchmarking" && written);
}
