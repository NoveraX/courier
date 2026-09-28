import type { LookupPolicy } from "./guarded-lookup";
import { specAddressKind } from "./spec-address-kind";
import { SpecFetchError } from "./spec-fetch-error";
import type { SpecHostAllowlist, SpecHosts } from "./spec-host-allowlist";
import { SpecHostsUnavailableError } from "./spec-hosts-unavailable-error";
import { requestSpec, type SpecAnswer } from "./spec-request";

const MAX_REDIRECTS = 5;
const WEB_PROTOCOLS: ReadonlySet<string> = new Set(["http:", "https:"]);
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
 * The headers given — an import's `auth` — go only to the URL's own
 * origin: a redirect elsewhere is followed without them, so a server that
 * redirects cannot hand a private token to another host.
 *
 * A URL Studio refuses is the request's fault: its error is `refused`.
 * Everything that goes wrong once a request is sent is the host's — no
 * answer, an error status, a redirect Studio cannot follow, a body cut off,
 * too large or unreadable — and its error names the URL.
 *
 * @param url - The URL the developer asked Studio to read
 * @param allowlist - The private hosts the project names, read when a hop needs them
 * @param headers - Headers to send the URL's own origin, such as an import's auth
 * @returns The specification's text
 * @throws {SpecFetchError} When the URL is refused or cannot be fetched
 * @throws {SpecHostsUnavailableError} For a private host, while Studio cannot read the project's list
 *
 * @example
 * ```ts
 * const raw = await fetchSpec("https://api.example.com/openapi.json", specHostAllowlist(project, root));
 * ```
 */
export async function fetchSpec(
  url: string,
  allowlist: SpecHostAllowlist,
  headers: Readonly<Record<string, string>> = {},
): Promise<string> {
  const deadline = Date.now() + DEADLINE_MS;
  let current = specUrl(url);
  const { origin } = current;
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
      current.origin === origin ? headers : {},
    );
    if (answer.kind === "body") return answer.text;
    /* A redirect may lead to this machine only from this machine: once a hop
       has left it, a server elsewhere chose where the request goes next. */
    loopback &&=
      answer.remoteAddress !== null && specAddressKind(answer.remoteAddress) === "loopback";
    current = redirectTarget(answer.location, current, url);
  }
  throw new SpecFetchError("SPEC_REDIRECTS", `${url} redirects more than ${MAX_REDIRECTS} times.`, {
    url,
  });
}

/* The URL the developer gave: one Studio cannot fetch is the request's fault. */
function specUrl(url: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch (cause) {
    throw new SpecFetchError("SPEC_URL_INVALID", `${url} is not a URL.`, { cause, url });
  }
  if (!WEB_PROTOCOLS.has(parsed.protocol)) {
    throw new SpecFetchError("SPEC_URL_INVALID", "Spec URL must use http:// or https:// protocol", {
      url,
    });
  }
  return parsed;
}

/* Where a server redirects: a target Studio cannot follow is that server's fault. */
function redirectTarget(location: string, from: URL, asked: string): URL {
  let target: URL;
  try {
    target = new URL(location, from);
  } catch (cause) {
    throw new SpecFetchError(
      "SPEC_REDIRECT_INVALID",
      `${from.href} redirects to "${location}", which is not a URL.`,
      { cause, url: asked },
    );
  }
  if (!WEB_PROTOCOLS.has(target.protocol)) {
    throw new SpecFetchError(
      "SPEC_REDIRECT_INVALID",
      `${from.href} redirects to ${target.href}, which is not an http:// or https:// URL, so Studio does not follow it.`,
      { url: asked },
    );
  }
  return target;
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
