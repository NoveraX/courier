import { specAddressKind } from "./spec-address-kind";
import { SpecFetchError } from "./spec-fetch-error";
import { requestSpec, type SpecAnswer } from "./spec-request";

const MAX_REDIRECTS = 5;
/* The whole fetch, redirects included: a server that trickles bytes cannot hold it open. */
const DEADLINE_MS = 60_000;

/** Names that mean "every interface", which is not a destination. */
const UNSPECIFIED_HOSTS = new Set(["0.0.0.0", "[::]"]);

/**
 * Fetch a specification from a URL on the developer's behalf, without
 * letting the URL reach into their private network.
 *
 * Studio runs inside that network, so every address a request connects to is
 * checked as it connects: a name is resolved once and the connection goes to
 * the address that was approved; a redirect is followed only after its
 * target passes the same check. This machine is reachable when the developer
 * asked for it — a specification served by the project's own dev server is
 * the ordinary case — but not because a server elsewhere redirected there.
 * Other private hosts only when the project names them in
 * `studio.allowedSpecHosts`.
 *
 * @param url - The URL the developer asked Studio to read
 * @param allowedHosts - Private hosts the project names
 * @returns The specification's text
 * @throws {SpecFetchError} When the URL is refused or cannot be fetched
 *
 * @example
 * ```ts
 * const raw = await fetchSpec("https://api.example.com/openapi.json", await allowedSpecHosts());
 * ```
 */
export async function fetchSpec(url: string, allowedHosts: readonly string[]): Promise<string> {
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
    const policy = { allowed: allowedHosts.some((entry) => sameHost(entry, current)), loopback };
    const answer: SpecAnswer = await requestSpec(current, policy, remaining);
    if (answer.kind === "body") return answer.text;
    /* Only a request the developer pointed at this machine may be sent back to it. */
    if (hop === 0)
      loopback =
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
  if (UNSPECIFIED_HOSTS.has(parsed.hostname)) {
    throw new SpecFetchError(
      "SPEC_URL_INVALID",
      `Blocked request to unspecified address: ${parsed.hostname}`,
      { url: asked },
    );
  }
  return parsed;
}

function sameHost(entry: string, url: URL): boolean {
  const wanted = entry.trim().toLowerCase();
  const unbracketed = url.hostname.replace(/^\[|\]$/g, "");
  return (
    [url.host, url.hostname, unbracketed].includes(wanted) ||
    wanted.replace(/^\[|\]$/g, "") === unbracketed
  );
}
