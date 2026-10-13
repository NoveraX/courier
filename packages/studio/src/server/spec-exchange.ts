import type { ClientRequest, IncomingMessage } from "node:http";
import type { Capacity } from "./capacity";
import { errnoCode } from "./errno-code";
import { readSpecBody } from "./read-spec-body";
import type { RequestClock } from "./request-clock";
import { SpecFetchError } from "./spec-fetch-error";
import { SpecHostsUnavailableError } from "./spec-hosts-unavailable-error";
import type { SpecRoute } from "./spec-route";
import { proxyRefused, specUnreachable } from "./spec-unreachable";

/** What one request for a specification got. */
export type SpecAnswer =
  | { kind: "body"; text: string; remoteAddress: string | null }
  | { kind: "redirect"; location: string; remoteAddress: string | null };

const REDIRECTS: ReadonlySet<number> = new Set([301, 302, 303, 307, 308]);

/** What a body may take: its own limit, and the bytes it shares with other requests. */
export interface BodyLimits {
  maxBytes: number;
  budget: Capacity | undefined;
}

/**
 * Send a request for a specification and read what the server answers: its
 * body, within the limits given, or where it redirects. Once the server has
 * begun to answer, the clock says so: time that runs out from then runs out
 * on the body, and a connection lost cut the body off.
 *
 * @param request - The request, opened and not yet sent
 * @param url - What it asks for, for messages
 * @param clock - The clock the request runs on
 * @param route - How it reaches its host: directly, or through a proxy
 * @param limits - What the body may take
 * @returns The body, or where the server redirects
 * @throws {SpecFetchError} For an error answer, a response that is not HTTP, a body cut off, too large or not readable, or a failure to connect
 * @throws {SpecHostsUnavailableError} For a private address, while Studio cannot tell whether the project allows it
 * @throws {StudioBusyError} When the requests sharing the body's budget hold all of it
 * @example
 * ```ts
 * const answer = await exchange(open(url, route, headers), url, clock, route, { maxBytes, budget });
 * ```
 */
export function exchange(
  request: ClientRequest,
  url: URL,
  clock: RequestClock,
  route: SpecRoute,
  limits: BodyLimits,
): Promise<SpecAnswer> {
  return new Promise<SpecAnswer>((resolve, reject) => {
    request.on("response", (response) => {
      clock.answered = true;
      answer(response, url, route, limits).then(resolve, reject);
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

async function answer(
  response: IncomingMessage,
  url: URL,
  route: SpecRoute,
  { maxBytes, budget }: BodyLimits,
): Promise<SpecAnswer> {
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
  return {
    kind: "body",
    text: await readSpecBody(response, url, maxBytes, budget),
    remoteAddress,
  };
}
