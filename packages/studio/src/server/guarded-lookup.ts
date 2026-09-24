import type { LookupAddress } from "node:dns";
import { promises as dns } from "node:dns";
import { createLogger } from "@noverax/courier";
import { specAddressKind } from "./spec-address-kind";
import { SpecFetchError } from "./spec-fetch-error";

const log = createLogger("Studio");

/** The shape of `lookup` that `http.request` accepts. */
export type LookupCallback = (
  hostname: string,
  options: { all?: boolean },
  callback: (error: Error | null, address: string | LookupAddress[], family?: number) => void,
) => void;

/** What a lookup may connect to, besides the public internet. */
export interface LookupPolicy {
  /** The project names this host in `studio.allowedSpecHosts`: any address is fine. */
  allowed: boolean;
  /** This machine may be reached — the developer asked for it, not a server they were sent to. */
  loopback: boolean;
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
 * request(url, { lookup: guardedLookup({ allowed: false, loopback: true }) });
 * ```
 */
export function guardedLookup(policy: LookupPolicy): LookupCallback {
  return (hostname, options, callback) => {
    dns
      .lookup(hostname, { all: true })
      .then(
        (addresses) => {
          const refused = addresses.find((entry) => !permitted(entry.address, policy));
          if (refused)
            callback(SpecFetchError.privateHost(`${hostname} (${refused.address})`), [], 0);
          else if (options.all) callback(null, addresses);
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

function permitted(address: string, { allowed, loopback }: LookupPolicy): boolean {
  if (allowed) return true;
  const kind = specAddressKind(address);
  return kind === "public" || (kind === "loopback" && loopback);
}
