import type { LookupPolicy } from "./guarded-lookup";
import { specAddressKind } from "./spec-address-kind";
import { SpecFetchError } from "./spec-fetch-error";
import type { SpecHostAllowlist, SpecHosts } from "./spec-host-allowlist";
import { SpecHostsUnavailableError } from "./spec-hosts-unavailable-error";
import { requestSpec, type SpecAnswer } from "./spec-request";

const MAX_REDIRECTS = 5;
const DEFAULT_PORTS: ReadonlyMap<string, string> = new Map([
  ["http:", "80"],
  ["https:", "443"],
]);
/* The whole fetch, redirects and the wait for the project's list of private
   hosts included: a server that trickles bytes cannot hold it open. */
const DEADLINE_MS = 60_000;

/**
 * Fetch a specification from a URL on the developer's behalf, without
 * letting the URL reach into their private network.
 *
 * Studio runs inside that network, so every address a request connects to is
 * checked as it connects: a name is resolved once and the connection goes to
 * the address that was approved; a redirect is followed only after its
 * target passes the same check. This machine is reachable when the developer
 * asked for it — a specification served by the project's own dev server is
 * the ordinary case — and through redirects while every hop stays on it.
 * Other private hosts, and this machine once any hop has been elsewhere, only
 * when the project names them in `studio.allowedSpecHosts`, which is read
 * only for such a host. An address that means every interface is never
 * reached.
 *
 * @param url - The URL the developer asked Studio to read
 * @param allowlist - The private hosts the project names, read when a hop needs them
 * @returns The specification's text
 * @throws {SpecFetchError} When the URL is refused or cannot be fetched
 * @throws {SpecHostsUnavailableError} For a private host, while Studio cannot read the project's list
 *
 * @example
 * ```ts
 * const raw = await fetchSpec("https://api.example.com/openapi.json", specHostAllowlist(project, root));
 * ```
 */
export async function fetchSpec(url: string, allowlist: SpecHostAllowlist): Promise<string> {
  const deadline = Date.now() + DEADLINE_MS;
  let current = parseSpecUrl(url, url);
  let loopback = true;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const remaining = deadline - Date.now();
    if (remaining <= 0)
      throw new SpecFetchError(
        "SPEC_TIMEOUT",
        `${url} did not answer within ${DEADLINE_MS / 1000} s.`,
        { url },
      );
    const answer: SpecAnswer = await requestSpec(
      current,
      hopPolicy(current, loopback, allowlist),
      remaining,
    );
    if (answer.kind === "body") return answer.text;
    /* A redirect may lead to this machine only from this machine: once a hop
       has left it, a server elsewhere chose where the request goes next. */
    loopback &&=
      answer.remoteAddress !== null && specAddressKind(answer.remoteAddress) === "loopback";
    current = parseSpecUrl(answer.location, url, current);
  }
  throw new SpecFetchError("SPEC_REDIRECTS", `${url} redirects more than ${MAX_REDIRECTS} times.`, {
    url,
  });
}

function parseSpecUrl(location: string, asked: string, base?: URL): URL {
  let parsed: URL;
  try {
    parsed = new URL(location, base);
  } catch (cause) {
    throw new SpecFetchError(
      "SPEC_URL_INVALID",
      `${base ? `${asked} redirects to` : ""}${location} is not a URL.`.trim(),
      { cause, url: asked },
    );
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new SpecFetchError("SPEC_URL_INVALID", "Spec URL must use http:// or https:// protocol", {
      url: asked,
    });
  }
  return parsed;
}

function hopPolicy(url: URL, loopback: boolean, allowlist: SpecHostAllowlist): LookupPolicy {
  return { loopback, admitPrivate: async (what) => admit(await allowlist(), url, what) };
}

/* Private hosts are reached only while a config that loads names them: never
   from the last good list while courier.config fails. */
function admit(hosts: SpecHosts, url: URL, what: string): void {
  switch (hosts.state) {
    case "listed":
      if (hosts.hosts.some((entry) => sameHost(entry, url))) return;
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

/* An entry names the host with or without its port, in any case, an IPv6
   address with or without brackets. A URL that names no port has its
   scheme's default, which URL leaves out of `host`. */
function sameHost(entry: string, url: URL): boolean {
  const wanted = entry.trim().toLowerCase();
  const unbracketed = url.hostname.replace(/^\[|\]$/g, "");
  const port = url.port || DEFAULT_PORTS.get(url.protocol);
  return (
    [`${url.hostname}:${port}`, url.hostname, unbracketed].includes(wanted) ||
    wanted.replace(/^\[|\]$/g, "") === unbracketed
  );
}
