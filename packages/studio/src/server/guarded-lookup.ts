import type { LookupAddress } from "node:dns";
import { promises as dns } from "node:dns";
import { createLogger } from "@noverax/courier";
import { approveSpecAddresses } from "./approve-spec-addresses";

const log = createLogger("Studio");

/** The shape of `lookup` that `http.request` accepts. */
export type LookupCallback = (
  hostname: string,
  options: { all?: boolean },
  callback: (error: Error | null, address: string | LookupAddress[], family?: number) => void,
) => void;

/** What a lookup may connect to, besides the public internet. */
export interface LookupPolicy {
  /** This machine may be reached — the developer asked for it, not a server they were sent to. */
  loopback: boolean;
  /**
   * Let the request reach a private address, or this machine when `loopback`
   * is not set: resolves when the project names the host in
   * `studio.allowedSpecHosts`, and rejects with the refusal otherwise. It is
   * asked only for such an address, so a public host never reads the project.
   *
   * @param what - The host, and the address it resolved to when there was a lookup
   */
  admitPrivate(what: string): Promise<void>;
}

/**
 * A `lookup` for fetching a specification: it resolves the name once, and the
 * connection is made to exactly the address it approved — so a second
 * answer from DNS cannot send the request elsewhere. Every address the name
 * resolves to must be one the policy allows.
 *
 * @param policy - What besides the public internet the request may reach
 * @returns The lookup to pass to `http.request`
 *
 * @example
 * ```ts
 * request(url, { lookup: guardedLookup({ loopback: true, admitPrivate: refuseEvery }) });
 * ```
 */
export function guardedLookup(policy: LookupPolicy): LookupCallback {
  return (hostname, options, callback) => {
    approvedAddresses(hostname, policy)
      .then(
        (addresses) => {
          if (options.all) callback(null, addresses);
          else callback(null, addresses[0]?.address ?? "", addresses[0]?.family ?? 4);
        },
        (error: unknown) =>
          callback(error instanceof Error ? error : new Error(String(error)), [], 0),
      )
      /* What the connection does with the address is its own affair; a throw
         there must not turn into a second answer or an unhandled rejection. */
      .catch((error: unknown) => log.error(`Studio's connection to ${hostname} failed`, error));
  };
}

async function approvedAddresses(hostname: string, policy: LookupPolicy): Promise<LookupAddress[]> {
  const addresses = await dns.lookup(hostname, { all: true });
  await approveSpecAddresses(
    addresses.map((entry) => entry.address),
    policy,
    (address) => `${hostname} (${address})`,
  );
  return addresses;
}
