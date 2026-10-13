import type { LookupPolicy } from "./guarded-lookup";
import { SpecFetchError } from "./spec-fetch-error";
import type { SpecHostAllowlist, SpecHosts } from "./spec-host-allowlist";
import { specHostMatches } from "./spec-host-matches";
import { SpecHostsUnavailableError } from "./spec-hosts-unavailable-error";

/** The private hosts a fetch may reach: those the project lists, or none, for the reason given. */
export type PrivateHosts = { listed: SpecHostAllowlist } | { refused: string };

/**
 * What one hop of a fetch for a specification may connect to: this machine
 * when `loopback` says so, the public internet, and a private host only as
 * `hosts` allows. A host a redirect led to is named with the URL that was
 * asked for, which is the one the developer knows.
 *
 * @param url - Where this hop goes
 * @param loopback - Whether it may reach this machine
 * @param hosts - The private hosts it may reach, or why it may reach none
 * @param redirectedFrom - The URL asked for, when a redirect led here
 * @returns The policy its connection is made under
 * @example
 * ```ts
 * requestSpec(url, hopPolicy(url, true, { listed: allowlist }, null), remaining);
 * ```
 */
export function hopPolicy(
  url: URL,
  loopback: boolean,
  hosts: PrivateHosts,
  redirectedFrom: string | null,
): LookupPolicy {
  const named = (what: string) =>
    redirectedFrom === null ? what : `${what}, which ${redirectedFrom} redirects to`;
  /* A caller without the token reaches no private host, whatever the project names. */
  if ("refused" in hosts) {
    return {
      loopback,
      admitPrivate: (what) => Promise.reject(SpecFetchError.publicOnly(named(what), hosts.refused)),
    };
  }
  return { loopback, admitPrivate: async (what) => admit(await hosts.listed(), url, named(what)) };
}

/* Private hosts are reached only while a config that loads names them: never
   from the last good list while courier.config fails. */
function admit(hosts: SpecHosts, url: URL, what: string): void {
  switch (hosts.state) {
    case "listed":
      if (hosts.hosts.some((entry) => specHostMatches(entry, url))) return;
      throw SpecFetchError.privateHost(what);
    case "missing":
      throw SpecFetchError.privateHost(what, hosts.root);
    case "failing":
      throw SpecHostsUnavailableError.notLoading(what, hosts.failure);
    case "starting":
      throw SpecHostsUnavailableError.starting(what);
    case "reloading":
      throw SpecHostsUnavailableError.reloading(what);
  }
}
