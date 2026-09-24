import { Agent as HttpAgent, request as httpRequest, type IncomingMessage } from "node:http";
import { Agent as HttpsAgent, request as httpsRequest } from "node:https";
import { isIP } from "node:net";
import { errnoCode } from "./errno-code";
import { guardedLookup, type LookupPolicy } from "./guarded-lookup";
import { readSpecBody } from "./read-spec-body";
import { specAddressKind } from "./spec-address-kind";
import { SpecFetchError } from "./spec-fetch-error";

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
 * @param url - The URL, already checked for scheme and form
 * @param policy - What besides the public internet the request may reach
 * @param timeoutMs - How long it may take, all of it
 * @returns The body, or where the server redirects
 * @throws {SpecFetchError} For a refused address, an error answer, a body too large, or a failure to connect
 *
 * @example
 * ```ts
 * const answer = await requestSpec(new URL(url), { allowed: false, loopback: true }, 30_000);
 * ```
 */
export function requestSpec(
  url: URL,
  policy: LookupPolicy,
  timeoutMs: number,
): Promise<SpecAnswer> {
  const bare = url.hostname.replace(/^\[|\]$/g, "");
  if (isIP(bare) !== 0 && !literalPermitted(bare, policy))
    return Promise.reject(SpecFetchError.privateHost(url.hostname));
  return new Promise<SpecAnswer>((resolve, reject) => {
    const https = url.protocol === "https:";
    const request = (https ? httpsRequest : httpRequest)(url, {
      agent: https ? new HttpsAgent({ keepAlive: false }) : new HttpAgent({ keepAlive: false }),
      lookup: guardedLookup(policy),
      headers: {
        accept: "application/json, application/yaml, */*",
        "accept-encoding": "gzip, deflate, br",
        "user-agent": "courier-studio",
      },
    });
    const deadline = setTimeout(() => {
      request.destroy(
        new SpecFetchError(
          "SPEC_TIMEOUT",
          `${url.href} did not answer within ${timeoutMs / 1000} s.`,
        ),
      );
    }, timeoutMs);
    request.on("response", (response) =>
      answer(response, url)
        .then(resolve, reject)
        .finally(() => clearTimeout(deadline)),
    );
    request.on("error", (error) => {
      clearTimeout(deadline);
      reject(error instanceof SpecFetchError ? error : unreachable(url, error));
    });
    request.end();
  });
}

function literalPermitted(address: string, { allowed, loopback }: LookupPolicy): boolean {
  if (allowed) return true;
  const kind = specAddressKind(address);
  return kind === "public" || (kind === "loopback" && loopback);
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
