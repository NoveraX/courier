import type { RequestFailureCause } from "@/store/types";

const DNS_CODES: ReadonlySet<string> = new Set(["ENOTFOUND", "EAI_AGAIN"]);

const CONNECTION_CODES: ReadonlySet<string> = new Set([
  "ECONNREFUSED",
  "ECONNRESET",
  "ETIMEDOUT",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_SOCKET",
]);

const CERTIFICATE_CODES: ReadonlySet<string> = new Set([
  "DEPTH_ZERO_SELF_SIGNED_CERT",
  "SELF_SIGNED_CERT_IN_CHAIN",
  "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
  "UNABLE_TO_GET_ISSUER_CERT_LOCALLY",
  "CERT_HAS_EXPIRED",
  "ERR_TLS_CERT_ALTNAME_INVALID",
]);

/* What a browser's fetch says, and nothing else does, when it fails without an answer. */
const BROWSER_TEXTS: ReadonlySet<string> = new Set([
  "Failed to fetch",
  "Load failed",
  "NetworkError when attempting to fetch resource.",
]);

const GENERAL =
  "No answer came back: Courier could not reach the API. Check that it runs, and that the source's baseURL points at it.";

const UNCODED =
  "No answer came back, and the platform gave no error code. Its text above says why when it is the platform's own: fetch refuses a URL that carries a user and password, and some ports, before it sends; a proxy the request goes through may refuse it. When the app's own fetch or transport failed, its text is not shown here: the error the call rejected with has it.";

/**
 * What usually fixes a request that got no answer, told from the code the
 * system gave: a host name that did not resolve, a connection that failed,
 * a certificate that was not trusted. A code outside these gets the general
 * advice and is named. With no code, a browser's fetch — which says only
 * that it failed — gets the general advice and what a browser hides behind
 * it; any other runtime, what fails a request before it is answered.
 *
 * @param cause - Why the request got no answer, when the runtime said
 * @returns The advice
 * @example
 * ```ts
 * networkHint({ code: "ENOTFOUND", message: "getaddrinfo ENOTFOUND api.test" });
 * // "The API's host name did not resolve (ENOTFOUND). …"
 * ```
 */
export function networkHint(cause: RequestFailureCause | undefined): string {
  if (cause === undefined) return GENERAL;
  const { code } = cause;
  if (code === undefined) {
    return BROWSER_TEXTS.has(cause.message)
      ? `${GENERAL} In a browser, a request refused by CORS or blocked as mixed content fails the same way; the browser's console says which.`
      : UNCODED;
  }
  if (DNS_CODES.has(code)) {
    return `The API's host name did not resolve (${code}). Check the host in the source's baseURL for a typo, and that this machine's network can resolve it: a host only a VPN or an internal DNS knows needs that network.`;
  }
  if (CONNECTION_CODES.has(code)) {
    return `The host was found, but the connection to it failed (${code}). Check that the API runs and listens on the port the baseURL names, and that no firewall or proxy in between drops the connection.`;
  }
  if (CERTIFICATE_CODES.has(code)) {
    return `The API's TLS certificate was not trusted (${code}). A self-signed certificate, or one from a private authority, needs that authority given to Node.js through NODE_EXTRA_CA_CERTS; an expired certificate, or one issued for another host name, needs fixing on the server.`;
  }
  return `${GENERAL} The system reported ${code}.`;
}
