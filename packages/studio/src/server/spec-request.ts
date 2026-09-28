import {
  type ClientRequest,
  Agent as HttpAgent,
  request as httpRequest,
  type IncomingMessage,
} from "node:http";
import { Agent as HttpsAgent, request as httpsRequest } from "node:https";
import { isIP } from "node:net";
import { approveSpecAddresses } from "./approve-spec-addresses";
import { errnoCode } from "./errno-code";
import { guardedLookup, type LookupPolicy } from "./guarded-lookup";
import { readSpecBody } from "./read-spec-body";
import { type RequestClock, requestClock } from "./request-clock";
import { SpecFetchError } from "./spec-fetch-error";
import { SpecHostsUnavailableError } from "./spec-hosts-unavailable-error";

/** What one request for a specification got. */
export type SpecAnswer =
  | { kind: "body"; text: string; remoteAddress: string | null }
  | { kind: "redirect"; location: string; remoteAddress: string | null };

const REDIRECTS: ReadonlySet<number> = new Set([301, 302, 303, 307, 308]);

/**
 * Send one GET for a specification, connecting only where the policy allows.
 *
 * Each request opens its own connection, through no proxy: a pooled socket
 * or a proxy connects without the lookup that checks the address. An address
 * written out is never looked up, so it is checked here.
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
 * @param headers - Headers to send besides Studio's own, such as an import's auth
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
  headers: Readonly<Record<string, string>> = {},
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
      .then(() => {
        request = open(url, clock.policy, headers);
        return exchange(request, url, clock);
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
  policy: LookupPolicy,
  headers: Readonly<Record<string, string>>,
): ClientRequest {
  const https = url.protocol === "https:";
  return (https ? httpsRequest : httpRequest)(url, {
    agent: https ? new HttpsAgent({ keepAlive: false }) : new HttpAgent({ keepAlive: false }),
    lookup: guardedLookup(policy),
    headers: {
      accept: "application/json, application/yaml, */*",
      "accept-encoding": "gzip, deflate, br",
      "user-agent": "courier-studio",
      ...headers,
    },
  });
}

function exchange(request: ClientRequest, url: URL, clock: RequestClock): Promise<SpecAnswer> {
  return new Promise<SpecAnswer>((resolve, reject) => {
    request.on("response", (response) => {
      clock.answered = true;
      answer(response, url).then(resolve, reject);
    });
    request.on("error", (error) => reject(failure(error, url, clock.answered)));
    request.end();
  });
}

/* A refusal the lookup raised reaches the caller as it is, not as a failure
   to connect. Node's HTTP parser names what it rejects with an `HPE_` code:
   the host answered, so it was reached. A connection lost once the server
   answered cut its body off. */
function failure(error: Error, url: URL, answered: boolean): Error {
  if (error instanceof SpecFetchError || error instanceof SpecHostsUnavailableError) return error;
  const code = errnoCode(error);
  if (code?.startsWith("HPE_")) return unparsable(url, code, error);
  return answered ? SpecFetchError.cutOff(url, error) : unreachable(url, error);
}

function unparsable(url: URL, code: string, cause: Error): SpecFetchError {
  return new SpecFetchError(
    "SPEC_UNREACHABLE",
    `${url.href} sent a response Studio cannot parse (${code}).`,
    { cause, url: url.href },
  );
}

async function answer(response: IncomingMessage, url: URL): Promise<SpecAnswer> {
  const status = response.statusCode ?? 0;
  const remoteAddress = response.socket.remoteAddress ?? null;
  const location = response.headers.location;
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

/* A developer behind a proxy that Studio does not use gets the way around it. */
function unreachable(url: URL, cause: Error): SpecFetchError {
  const code = errnoCode(cause) ?? cause.message;
  const proxied = ["HTTPS_PROXY", "HTTP_PROXY", "https_proxy", "http_proxy"].some(
    (name) => process.env[name],
  );
  const hint = proxied
    ? " Studio fetches specifications directly, not through a proxy; download the file and import it from disk."
    : "";
  return new SpecFetchError(
    "SPEC_UNREACHABLE",
    `${url.host} could not be reached (${code}).${hint}`,
    { cause, url: url.href },
  );
}
