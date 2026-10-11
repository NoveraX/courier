/* The module itself: http.setGlobalProxyFromEnv() replaces its global agent. */
import https from "node:https";
import { errnoCode } from "./errno-code";
import { SpecFetchError } from "./spec-fetch-error";
import type { SpecProxy } from "./spec-proxy";

const PROXY_VARIABLES = ["HTTPS_PROXY", "HTTP_PROXY", "https_proxy", "http_proxy"];

/* Codes Node gives a certificate it cannot trace to an authority it trusts. */
const UNTRUSTED: ReadonlySet<string> = new Set([
  "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
  "UNABLE_TO_GET_ISSUER_CERT",
  "UNABLE_TO_GET_ISSUER_CERT_LOCALLY",
  "SELF_SIGNED_CERT_IN_CHAIN",
  "DEPTH_ZERO_SELF_SIGNED_CERT",
  "CERT_UNTRUSTED",
]);

/**
 * The error for a host a request for a specification could not reach, with
 * what the developer can do about it: start Studio so that Node uses the
 * proxy the environment names, or make Node trust the authority that signs
 * the host's certificate. A proxy is named by its origin alone, never with
 * the credentials its URL may carry.
 *
 * @param url - Where the request went
 * @param cause - Why it could not
 * @param proxy - The proxy it went through, when it did
 * @returns The error
 * @example
 * ```ts
 * request.on("error", (error) => reject(specUnreachable(url, error, route.proxy)));
 * ```
 */
export function specUnreachable(
  url: URL,
  cause: Error,
  proxy: SpecProxy | undefined,
): SpecFetchError {
  const code = errnoCode(cause) ?? cause.message;
  const where =
    proxy === undefined
      ? `${url.host} could not be reached (${reasonOf(code, cause)}).`
      : `${url.host} could not be reached through the proxy at ${proxy.origin} (${reasonOf(code, cause)}).`;
  return new SpecFetchError(
    "SPEC_UNREACHABLE",
    `${where}${credentialsHint(code, cause)}${hintFor(code, proxy)}`,
    {
      cause,
      url: url.href,
    },
  );
}

/**
 * The error for a request a proxy refused with `407`: only a proxy answers
 * it, so it is the proxy's answer, not the host's, whatever the request's
 * scheme. The proxy is named by its origin alone.
 *
 * @param url - Where the request went
 * @param proxy - The proxy that answered
 * @param statusText - The answer's reason phrase
 * @returns The error
 * @example
 * ```ts
 * if (route.proxy && status === 407) throw proxyRefused(url, route.proxy, response.statusMessage);
 * ```
 */
export function proxyRefused(
  url: URL,
  proxy: SpecProxy,
  statusText: string | undefined,
): SpecFetchError {
  const reason = statusText ? `407 ${statusText}` : "407";
  return new SpecFetchError(
    "SPEC_UNREACHABLE",
    `${url.host} could not be reached through the proxy at ${proxy.origin} (the proxy answered ${reason}). Give the proxy's credentials in its URL, as http://user:password@proxy:port.`,
    { url: url.href },
  );
}

/* A proxy that refused the tunnel says why in its status line; nothing else of Node's message is repeated. */
function reasonOf(code: string, cause: Error): string {
  if (code !== "ERR_PROXY_TUNNEL") return code;
  const status = /HTTP\/\d(?:\.\d)? (\d{3}[^\r\n]*)/.exec(cause.message)?.[1];
  return status === undefined ? code : `the proxy answered ${status}`;
}

function credentialsHint(code: string, cause: Error): string {
  return code === "ERR_PROXY_TUNNEL" && / 407\b/.test(cause.message)
    ? " Give the proxy's credentials in its URL, as http://user:password@proxy:port."
    : "";
}

function hintFor(code: string, proxy: SpecProxy | undefined): string {
  if (UNTRUSTED.has(code)) {
    return " Node does not trust the authority that signed its certificate: name that authority's certificate in NODE_EXTRA_CA_CERTS, or start Studio with NODE_USE_SYSTEM_CA=1 to trust the ones this machine trusts.";
  }
  const proxied = PROXY_VARIABLES.some((name) => process.env[name]);
  if (proxy !== undefined || !proxied || https.globalAgent.options.proxyEnv !== undefined)
    return "";
  return " A proxy is set in the environment, and Node sends requests through it only when started with NODE_USE_ENV_PROXY=1: start Studio with it to fetch through the proxy, or download the file and import it from disk.";
}
