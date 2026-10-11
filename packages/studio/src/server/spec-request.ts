import { type ClientRequest, request as httpRequest, type IncomingMessage } from "node:http";
import { request as httpsRequest } from "node:https";
import { isIP } from "node:net";
import { approveSpecAddresses } from "./approve-spec-addresses";
import { errnoCode } from "./errno-code";
import type { LookupPolicy } from "./guarded-lookup";
import { readSpecBody } from "./read-spec-body";
import { type RequestClock, requestClock } from "./request-clock";
import { SpecFetchError } from "./spec-fetch-error";
import { SpecHostsUnavailableError } from "./spec-hosts-unavailable-error";
import { type SpecRoute, specRoute } from "./spec-route";
import { proxyRefused, specUnreachable } from "./spec-unreachable";

/** What one request for a specification got. */
export type SpecAnswer =
  | { kind: "body"; text: string; remoteAddress: string | null }
  | { kind: "redirect"; location: string; remoteAddress: string | null };

/** What a request for a specification is sent with besides its URL. */
export interface SpecRequestOptions {
  /** Headers to send besides Studio's own, such as an import's auth */
  readonly headers?: Readonly<Record<string, string>> | undefined;
  /** Whether it may go through the proxy Node's own requests use (default `true`) */
  readonly proxy?: boolean | undefined;
}

const REDIRECTS: ReadonlySet<number> = new Set([301, 302, 303, 307, 308]);

/**
 * Send one GET for a specification, connecting only where the policy allows.
 *
 * Each request opens its own connection: a pooled socket connects without
 * the lookup that checks the address. An address written out is never
 * looked up, so it is checked here. When Node is told to use a proxy and the
 * request may, it goes through that proxy as Node's own would, after its
 * host is checked as this machine resolves it; this machine itself is
 * always reached directly. A response through a proxy names no address of
 * the host, so a redirect it sends cannot lead to this machine.
 *
 * One clock runs from the start, whether the host is a name or an address:
 * the wait for the policy to admit a private host counts, like the lookup,
 * the connection and the answer. Time that runs out during that wait has
 * reached no host, and Studio cannot tell yet whether the project allows it,
 * so the request fails with `CONFIG_RELOADING`, not as a host that did not
 * answer; a host admitted after that is never connected to.
 *
 * Once the server has begun to answer, a connection that closes before the
 * body is complete fails the request at once as a body cut off, not as a
 * host that could not be reached. Bytes that are not HTTP, whenever they
 * arrive, fail it at once as a response Studio cannot parse: the host was
 * reached, and may still be holding the connection open.
 *
 * @param url - The URL, already checked for scheme and form
 * @param policy - What besides the public internet the request may reach
 * @param timeoutMs - How long it may take, all of it
 * @param options - Its headers, and whether it may go through a proxy
 * @returns The body, or where the server redirects
 * @throws {SpecFetchError} For a refused address, an error answer, a response that is not HTTP, a body cut off, too large or not readable, or a failure to connect or finish in time
 * @throws {SpecHostsUnavailableError} For a private address, while Studio cannot tell whether the project allows it
 *
 * @example
 * ```ts
 * const answer = await requestSpec(new URL(url), { loopback: true, admitPrivate: refuseEvery }, 30_000);
 * ```
 */
export function requestSpec(
  url: URL,
  policy: LookupPolicy,
  timeoutMs: number,
  { headers = {}, proxy = true }: SpecRequestOptions = {},
): Promise<SpecAnswer> {
  const clock = requestClock(url, policy, timeoutMs);
  return new Promise<SpecAnswer>((resolve, reject) => {
    let request: ClientRequest | undefined;
    const deadline = setTimeout(() => {
      const error = clock.expire();
      request?.destroy(error);
      reject(error);
    }, timeoutMs);
    admitWrittenOut(url, clock.policy)
      .then(() => specRoute(url, clock.policy, proxy))
      .then((route) => {
        /* Time that ran out while the route was found leaves nothing to send. */
        if (clock.expired) throw clock.expired;
        request = open(url, route, headers);
        return exchange(request, url, clock, route);
      })
      .then(resolve, reject)
      .finally(() => clearTimeout(deadline));
  });
}

async function admitWrittenOut(url: URL, policy: LookupPolicy): Promise<void> {
  const bare = url.hostname.replace(/^\[|\]$/g, "");
  if (isIP(bare) !== 0) await approveSpecAddresses([bare], policy, () => url.hostname);
}

function open(
  url: URL,
  route: SpecRoute,
  headers: Readonly<Record<string, string>>,
): ClientRequest {
  return (url.protocol === "https:" ? httpsRequest : httpRequest)(url, {
    agent: route.agent,
    ...(route.lookup && { lookup: route.lookup }),
    headers: {
      accept: "application/json, application/yaml, */*",
      "accept-encoding": "gzip, deflate, br",
      "user-agent": "courier-studio",
      ...headers,
    },
  });
}

function exchange(
  request: ClientRequest,
  url: URL,
  clock: RequestClock,
  route: SpecRoute,
): Promise<SpecAnswer> {
  return new Promise<SpecAnswer>((resolve, reject) => {
    request.on("response", (response) => {
      clock.answered = true;
      answer(response, url, route).then(resolve, reject);
    });
    request.on("error", (error) => reject(failure(error, url, clock.answered, route)));
    request.end();
  });
}

/* A refusal the lookup raised reaches the caller as it is, not as a failure
   to connect. Node's HTTP parser names what it rejects with an `HPE_` code:
   the host answered, so it was reached. A connection lost once the server
   answered cut its body off. */
function failure(error: Error, url: URL, answered: boolean, route: SpecRoute): Error {
  if (error instanceof SpecFetchError || error instanceof SpecHostsUnavailableError) return error;
  const code = errnoCode(error);
  if (code?.startsWith("HPE_")) return unparsable(url, code, error);
  return answered ? SpecFetchError.cutOff(url, error) : specUnreachable(url, error, route.proxy);
}

function unparsable(url: URL, code: string, cause: Error): SpecFetchError {
  return new SpecFetchError(
    "SPEC_UNREACHABLE",
    `${url.href} sent a response Studio cannot parse (${code}).`,
    { cause, url: url.href },
  );
}

async function answer(response: IncomingMessage, url: URL, route: SpecRoute): Promise<SpecAnswer> {
  const status = response.statusCode ?? 0;
  /* Through a proxy the socket's address is the proxy's, which may well be this machine. */
  const remoteAddress = route.proxy === undefined ? (response.socket.remoteAddress ?? null) : null;
  const location = response.headers.location;
  if (route.proxy !== undefined && status === 407) {
    response.destroy();
    throw proxyRefused(url, route.proxy, response.statusMessage);
  }
  if (REDIRECTS.has(status) && location) {
    response.destroy();
    return { kind: "redirect", location, remoteAddress };
  }
  if (status < 200 || status >= 300) {
    response.destroy();
    throw new SpecFetchError("SPEC_HTTP_STATUS", `${url.href} answered ${status}.`);
  }
  return { kind: "body", text: await readSpecBody(response, url), remoteAddress };
}
