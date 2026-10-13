import type { LookupAddress } from "node:dns";
import { createLogger } from "@noverax/courier";

import { addressKindHere } from "./address-kind-here";
import { approveSpecAddresses } from "./approve-spec-addresses";
import { errnoCode } from "./errno-code";
import type { LookupPolicy, SpecLookups } from "./guarded-lookup";
import { messageOf } from "./message-of";
import { readInterfaces } from "./own-addresses";
import { type NameResolver, publicResolver } from "./public-resolver";

const log = createLogger("Studio");

/**
 * The lookups of one request for a caller that reaches the public internet
 * only — a page without the project's token, a visitor of a public demo.
 *
 * Each name is resolved from DNS by a resolver of the request's own, never
 * by this machine's resolver: that one reads the hosts file and asks local
 * names of the network, and its lookups cannot be stopped — those of a
 * caller who hung up would go on taking the few threads every lookup of the
 * process waits for, the developer's own among them. Cancelling the request
 * cancels its queries, and its lookup settles at once.
 *
 * Every address a name resolves to, IPv4 and IPv6, must be public, and the
 * connection goes to exactly those addresses. A name that resolves to no
 * public address and one that does not resolve at all are refused alike,
 * by the policy, naming the host alone: a caller without the token learns
 * neither what a name of the network resolves to nor whether it exists.
 *
 * @param policy - What besides the public internet the request may reach
 * @param resolver - Makes the request's resolver, once it looks a name up
 * @returns The request's lookups
 * @example
 * ```ts
 * const lookups = publicLookups(policy);
 * request(url, { lookup: lookups.lookup });
 * signal.addEventListener("abort", () => lookups.cancel());
 * ```
 */
export function publicLookups(
  policy: LookupPolicy,
  resolver: () => NameResolver = publicResolver,
): SpecLookups {
  let made: NameResolver | undefined;
  const pending = new Set<Promise<unknown>>();
  return {
    lookup(hostname, options, callback) {
      made ??= resolver();
      const looking = approvedAddresses(hostname, made, policy);
      const settled = looking.then(noop, noop);
      pending.add(settled);
      void settled.then(() => pending.delete(settled));
      looking
        .then(
          (addresses) => {
            if (options.all) callback(null, addresses);
            else callback(null, addresses[0]?.address ?? "", addresses[0]?.family ?? 4);
          },
          (error: unknown) =>
            callback(error instanceof Error ? error : new Error(messageOf(error)), [], 0),
        )
        /* What the connection does with the address is its own affair. */
        .catch((error: unknown) => log.error(`Studio's connection to ${hostname} failed`, error));
    },
    cancel() {
      made?.cancel();
    },
    async idle() {
      while (pending.size > 0) await Promise.all(pending);
    },
  };
}

async function approvedAddresses(
  hostname: string,
  resolver: NameResolver,
  policy: LookupPolicy,
): Promise<LookupAddress[]> {
  const addresses = await resolved(hostname, resolver);
  const interfaces = readInterfaces();
  const kinds = addresses.map(({ address }) => addressKindHere(address, interfaces));
  if (kinds.length === 0 || kinds.some((kind) => kind !== "public")) {
    await policy.admitPrivate(hostname);
  }
  await approveSpecAddresses(
    addresses.map(({ address }) => address),
    policy,
    () => hostname,
  );
  if (addresses.length === 0) throw unresolved(hostname);
  return addresses;
}

/* Both families, each as far as it resolves: a name with no address of one
   family has its others, and a failure of both resolves to none. Cancelled,
   the lookup ends there, asking the policy nothing. */
async function resolved(hostname: string, resolver: NameResolver): Promise<LookupAddress[]> {
  const [v4, v6] = await Promise.allSettled([
    resolver.resolve4(hostname),
    resolver.resolve6(hostname),
  ]);
  for (const outcome of [v4, v6]) {
    if (outcome.status !== "rejected") continue;
    const reason: unknown = outcome.reason;
    if (errnoCode(reason) === "ECANCELLED") throw reason;
  }
  return [...addressesOf(v4, 4), ...addressesOf(v6, 6)];
}

function addressesOf(outcome: PromiseSettledResult<string[]>, family: 4 | 6): LookupAddress[] {
  return outcome.status === "fulfilled"
    ? outcome.value.map((address) => ({ address, family }))
    : [];
}

function unresolved(hostname: string): Error {
  return Object.assign(new Error(`${hostname} does not resolve to any address.`), {
    code: "ENOTFOUND",
  });
}

function noop(): void {}
