import { type ClientRequest, request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { isIP } from "node:net";
import { approveSpecAddresses } from "./approve-spec-addresses";
import type { Capacity } from "./capacity";
import { type LookupPolicy, type SpecLookups, systemLookups } from "./guarded-lookup";
import { publicLookups } from "./public-lookups";
import { SPEC_MAX_BYTES } from "./read-spec-body";
import { type RequestClock, requestClock } from "./request-clock";
import { exchange, type SpecAnswer } from "./spec-exchange";
import { SpecFetchError } from "./spec-fetch-error";
import { type SpecRoute, specRoute } from "./spec-route";

export type { SpecAnswer } from "./spec-exchange";

/** What a request for a specification is sent with besides its URL. */
export interface SpecRequestOptions {
  /** Headers to send besides Studio's own, such as an import's auth */
  readonly headers?: Readonly<Record<string, string>> | undefined;
  /** Whether it may go through the proxy Node's own requests use (default `true`) */
  readonly proxy?: boolean | undefined;
  /** The most the body may be, decompressed (default {@link SPEC_MAX_BYTES}) */
  readonly maxBytes?: number | undefined;
  /** The bytes the body is buffered in, shared with other requests, when it is */
  readonly budget?: Capacity | undefined;
  /** Stops the request, wherever it is, once aborted: whoever asked for it has gone */
  readonly signal?: AbortSignal | undefined;
  /**
   * How its host's name is looked up: as this machine resolves it
   * (`"system"`, the default), or asked of this machine's name servers
   * directly by a resolver of the request's own (`"public"`), for a caller
   * that reaches the public internet only — a lookup that stops with the
   * request, and is waited for
   */
  readonly names?: "system" | "public" | undefined;
}

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
 * A host's name is looked up as this machine resolves it, or — with
 * `names: "public"`, for a caller that reaches the public internet only —
 * asked of this machine's name servers directly, by a lookup of the
 * request's own (see `publicLookups`).
 *
 * Aborted or out of time, the request stops where it is — its connection
 * closed, the body read so far let go, a lookup it can stop stopped — and
 * connects nowhere after. It settles only once no such lookup is still
 * under way, so a caller that counts its requests counts their lookups too.
 *
 * @param url - The URL, already checked for scheme and form
 * @param policy - What besides the public internet the request may reach
 * @param timeoutMs - How long it may take, all of it
 * @param options - Its headers, whether it may go through a proxy, its limits, its signal, and how its host's name is looked up
 * @returns The body, or where the server redirects
 * @throws {SpecFetchError} For a refused address, an error answer, a response that is not HTTP, a body cut off, too large or not readable, a failure to connect or finish in time, or a request aborted
 * @throws {SpecHostsUnavailableError} For a private address, while Studio cannot tell whether the project allows it
 * @throws {StudioBusyError} When the requests sharing its budget hold all of it
 *
 * @example
 * ```ts
 * const answer = await requestSpec(new URL(url), { loopback: true, admitPrivate: refuseEvery }, 30_000);
 * ```
 */
export async function requestSpec(
  url: URL,
  policy: LookupPolicy,
  timeoutMs: number,
  options: SpecRequestOptions = {},
): Promise<SpecAnswer> {
  const clock = requestClock(url, policy, timeoutMs);
  const lookups =
    options.names === "public" ? publicLookups(clock.policy) : systemLookups(clock.policy);
  try {
    return await sent(url, clock, lookups, timeoutMs, options);
  } finally {
    lookups.cancel();
    await lookups.idle();
  }
}

/* The request, until it is answered, stopped, or out of time; a lookup it
   could not stop in time is the caller's to wait for. */
function sent(
  url: URL,
  clock: RequestClock,
  lookups: SpecLookups,
  timeoutMs: number,
  { headers = {}, proxy = true, maxBytes = SPEC_MAX_BYTES, budget, signal }: SpecRequestOptions,
): Promise<SpecAnswer> {
  return new Promise<SpecAnswer>((resolve, reject) => {
    let request: ClientRequest | undefined;
    let stopped: Error | undefined;
    const stop = (error: Error): void => {
      stopped = error;
      clearTimeout(deadline);
      lookups.cancel();
      request?.destroy(error);
      reject(error);
    };
    const deadline = setTimeout(() => stop(clock.expire()), timeoutMs);
    const gone = (): void => stop(SpecFetchError.aborted(url, signal?.reason));
    if (signal?.aborted) gone();
    else signal?.addEventListener("abort", gone, { once: true });
    admitWrittenOut(url, clock.policy)
      .then(() => specRoute(url, clock.policy, proxy, lookups.lookup))
      .then((route) => {
        /* Time that ran out, or a caller gone, while the route was found leaves nothing to send. */
        if (stopped) throw stopped;
        request = open(url, route, headers);
        return exchange(request, url, clock, route, { maxBytes, budget });
      })
      .then(resolve, reject)
      .finally(() => {
        clearTimeout(deadline);
        signal?.removeEventListener("abort", gone);
      });
  });
}

async function admitWrittenOut(url: URL, policy: LookupPolicy): Promise<void> {
  const bare = url.hostname.replace(/^\[|\]$/g, "");
  if (isIP(bare) !== 0) {
    await approveSpecAddresses([bare], policy, () => url.hostname, { written: true });
  }
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
