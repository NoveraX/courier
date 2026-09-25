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
 * @param url - The URL, already checked for scheme and form
 * @param policy - What besides the public internet the request may reach
 * @param timeoutMs - How long it may take, all of it
 * @returns The body, or where the server redirects
 * @throws {SpecFetchError} For a refused address, an error answer, a body too large, or a failure to connect in time
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
        request = open(url, clock.policy);
        return exchange(request, url);
      })
      .then(resolve, reject)
      .finally(() => clearTimeout(deadline));
  });
}

interface RequestClock {
  /** The policy the request runs under. */
  readonly policy: LookupPolicy;
  /** The time is up: the error the request fails with. */
  expire(): Error;
}

/* It knows whether the request waits for a host to be admitted when the
   time runs out, and admits none after. */
function requestClock(url: URL, policy: LookupPolicy, timeoutMs: number): RequestClock {
  let admitting: string | undefined;
  let expired: Error | undefined;
  const watched: LookupPolicy = {
    loopback: policy.loopback,
    admitPrivate: async (what) => {
      admitting = what;
      try {
        await policy.admitPrivate(what);
      } finally {
        admitting = undefined;
      }
      if (expired) throw expired;
    },
  };
  function expire(): Error {
    expired =
      admitting === undefined
        ? new SpecFetchError(
            "SPEC_TIMEOUT",
            `${url.href} did not answer within ${timeoutMs / 1000} s.`,
          )
        : SpecHostsUnavailableError.reloading(admitting);
    return expired;
  }
  return { policy: watched, expire };
}

async function admitWrittenOut(url: URL, policy: LookupPolicy): Promise<void> {
  const bare = url.hostname.replace(/^\[|\]$/g, "");
  if (isIP(bare) !== 0) await approveSpecAddresses([bare], policy, () => url.hostname);
}

function open(url: URL, policy: LookupPolicy): ClientRequest {
  const https = url.protocol === "https:";
  return (https ? httpsRequest : httpRequest)(url, {
    agent: https ? new HttpsAgent({ keepAlive: false }) : new HttpAgent({ keepAlive: false }),
    lookup: guardedLookup(policy),
    headers: {
      accept: "application/json, application/yaml, */*",
      "accept-encoding": "gzip, deflate, br",
      "user-agent": "courier-studio",
    },
  });
}

function exchange(request: ClientRequest, url: URL): Promise<SpecAnswer> {
  return new Promise<SpecAnswer>((resolve, reject) => {
    request.on("response", (response) => answer(response, url).then(resolve, reject));
    request.on("error", (error) => reject(verdict(error) ? error : unreachable(url, error)));
    request.end();
  });
}

/* A refusal the lookup raised reaches the caller as it is, not as a failure to connect. */
function verdict(error: Error): boolean {
  return error instanceof SpecFetchError || error instanceof SpecHostsUnavailableError;
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
