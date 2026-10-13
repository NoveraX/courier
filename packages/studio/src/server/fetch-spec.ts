import { addressKindHere } from "./address-kind-here";
import type { Capacity } from "./capacity";
import { readInterfaces } from "./own-addresses";
import { PUBLIC_SPEC_MAX_BYTES, SPEC_MAX_BYTES } from "./read-spec-body";
import { SpecFetchError } from "./spec-fetch-error";
import { hopPolicy, type PrivateHosts } from "./spec-hop-policy";
import type { SpecHostAllowlist } from "./spec-host-allowlist";
import { requestSpec, type SpecAnswer } from "./spec-request";
import { asVisitorFetch, VISITOR_FETCH_DEADLINE_MS, visitorFetchBytes } from "./visitor-fetches";

const MAX_REDIRECTS = 5;

/**
 * What a request for a specification may reach: what the project allows —
 * the public internet, this machine when asked for, and the private hosts
 * it names — or, for a caller without the project's token, the public
 * internet only.
 */
export type SpecReach = "project" | "public";
const WEB_PROTOCOLS: ReadonlySet<string> = new Set(["http:", "https:"]);

/** What a fetch of a specification sends, what it may reach, and what stops it. */
export interface FetchSpecOptions {
  /** Headers to send the URL's own origin, such as an import's auth */
  headers?: Readonly<Record<string, string>> | undefined;
  /** What the fetch may reach (default `"project"`) */
  reach?: SpecReach | undefined;
  /** Why a `"public"` fetch reaches the public internet only, as its refusal of any other host says */
  publicOnly?: string | undefined;
  /** Stops the fetch once aborted: whoever asked for it has gone */
  signal?: AbortSignal | undefined;
}

/** How long a fetch may take, all of it, how much it may read, whether a proxy may carry it, and how its names are looked up. */
interface FetchLimits {
  deadlineMs: number;
  maxBytes: number;
  budget: Capacity | undefined;
  proxy: boolean;
  names: "system" | "public";
}

/* The whole fetch, redirects and the wait for the project's list of private
   hosts included: a server that trickles bytes cannot hold it open. */
const PROJECT: FetchLimits = {
  deadlineMs: 60_000,
  maxBytes: SPEC_MAX_BYTES,
  budget: undefined,
  proxy: true,
  names: "system",
};

/* What this machine cannot check, a caller without the token cannot reach;
   its names are resolved from public DNS, by lookups that stop with it. */
const VISITOR: FetchLimits = {
  deadlineMs: VISITOR_FETCH_DEADLINE_MS,
  maxBytes: PUBLIC_SPEC_MAX_BYTES,
  budget: visitorFetchBytes,
  proxy: false,
  names: "public",
};

const PUBLIC_ONLY =
  "Studio reaches this machine and its network only for a page opened from the link it printed in its terminal, which carries this project's token, and any other host only once its name resolves to a public address";

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
 * Studio goes through the proxy Node's own requests use, once Node is told
 * to use one — `NODE_USE_ENV_PROXY=1` — for every host `NO_PROXY` does not
 * name, checking each host as this machine resolves it first; this machine
 * is always reached directly.
 *
 * A caller without the project's token — a page opened without Studio's
 * link, a visitor of a public demo — reaches the public internet only, never
 * through the proxy: what this machine cannot check, it cannot reach. Its
 * names are resolved from public DNS, never by this machine's resolver, and
 * a name that does not resolve is refused as one that resolves to a private
 * address, by its name alone. Its fetch reads no more than a demo takes
 * pasted in, in less time, and only as one of the few such fetches Studio
 * runs at once, which buffer a few megabytes between them.
 *
 * A URL Studio refuses is the request's fault: its error is `refused`.
 * Everything that goes wrong once a request is sent is the host's — no
 * answer, an error status, a redirect Studio cannot follow, a body cut off,
 * too large or unreadable — and its error names the URL. An aborted fetch
 * stops where it is.
 *
 * @param url - The URL the developer asked Studio to read
 * @param allowlist - The private hosts the project names, read when a hop needs them
 * @param options - Its headers, what it may reach, and its signal
 * @returns The specification's text
 * @throws {SpecFetchError} When the URL is refused or cannot be fetched, or the fetch is aborted
 * @throws {SpecHostsUnavailableError} For a private host, while Studio cannot read the project's list
 * @throws {StudioBusyError} For a caller without the token, while Studio fetches as many for such callers as it takes
 *
 * @example
 * ```ts
 * const raw = await fetchSpec("https://api.example.com/openapi.json", specHostAllowlist(project, root));
 * ```
 */
export async function fetchSpec(
  url: string,
  allowlist: SpecHostAllowlist,
  options: FetchSpecOptions = {},
): Promise<string> {
  if (options.reach !== "public") return fetchWithin(url, allowlist, options, PROJECT);
  return asVisitorFetch(() => fetchWithin(url, allowlist, options, VISITOR));
}

async function fetchWithin(
  url: string,
  allowlist: SpecHostAllowlist,
  { headers = {}, reach = "project", publicOnly = PUBLIC_ONLY, signal }: FetchSpecOptions,
  limits: FetchLimits,
): Promise<string> {
  const deadline = Date.now() + limits.deadlineMs;
  let current = specUrl(url);
  const { origin } = current;
  let loopback = reach === "project";
  const hosts: PrivateHosts = reach === "public" ? { refused: publicOnly } : { listed: allowlist };
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const remaining = deadline - Date.now();
    if (remaining <= 0)
      throw new SpecFetchError(
        "SPEC_TIMEOUT",
        `${url} did not answer within ${limits.deadlineMs / 1000} s.`,
        { url },
      );
    const answer: SpecAnswer = await requestSpec(
      current,
      hopPolicy(current, loopback, hosts, hop === 0 ? null : url),
      remaining,
      {
        headers: current.origin === origin ? headers : {},
        proxy: limits.proxy,
        maxBytes: limits.maxBytes,
        budget: limits.budget,
        signal,
        names: limits.names,
      },
    );
    if (answer.kind === "body") return answer.text;
    /* A redirect may lead to this machine only from this machine: once a hop
       has left it, a server elsewhere chose where the request goes next. */
    loopback &&=
      answer.remoteAddress !== null &&
      addressKindHere(answer.remoteAddress, readInterfaces()) === "loopback";
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
