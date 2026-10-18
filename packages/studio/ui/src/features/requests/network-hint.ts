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
  "ConnectionRefused",
  "ConnectionClosed",
  "FailedToOpenSocket",
]);

/* An answer that began to arrive and broke before it was whole. */
const BROKEN_ANSWER_CODES: ReadonlySet<string> = new Set([
  "Z_DATA_ERROR",
  "Z_BUF_ERROR",
  "UND_ERR_RES_CONTENT_LENGTH_MISMATCH",
  "ERR_STREAM_PREMATURE_CLOSE",
  "UND_ERR_BODY_TIMEOUT",
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
  "No answer came back, and the platform gave no error code: its text above says why. fetch refuses a URL that carries a user and password, and some ports, before it sends; a proxy the request goes through may refuse it; and the app's own fetch or transport may fail in words of its own.";

const REDIRECTS =
  "The API answered with redirects that never reached an answer: one points back to another, or each to the next. Check where the API's Location headers point, and the address in the source's baseURL.";

const REDIRECT_TEXT = /redirect count exceeded|redirected too many times/i;

/**
 * What usually fixes a request that got no answer, told from the code the
 * system gave: a host name that did not resolve, a connection that failed,
 * an answer that broke as it arrived, an API that sent no headers in time,
 * a certificate that was not trusted, redirects with no end. A code
 * outside these gets the general advice and is named. With no code, a
 * browser's fetch — which says only that it failed — gets the general
 * advice and what a browser hides behind it; any other runtime, what fails
 * a request before it is answered.
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
  if (REDIRECT_TEXT.test(cause.message) || code === "TooManyRedirects") return REDIRECTS;
  if (code === undefined) {
    return BROWSER_TEXTS.has(cause.message)
      ? `${GENERAL} In a browser, a request refused by CORS or blocked as mixed content fails the same way; the browser's console says which.`
      : UNCODED;
  }
  if (DNS_CODES.has(code)) {
    return `The API's host name did not resolve (${code}). Check the host in the source's baseURL for a typo, and that this machine's network can resolve it: a host only a VPN or an internal DNS knows needs that network.`;
  }
  if (BROKEN_ANSWER_CODES.has(code)) {
    return `An answer began to come back, but it broke before it was whole (${code}): it was cut off, or its compression did not read. Check the API's server, and any proxy in between that rewrites or compresses its answers.`;
  }
  if (code === "UND_ERR_HEADERS_TIMEOUT") {
    return `The API took the connection but sent no headers in time (${code}): it is slow to answer, or hangs. Look at what the API does for this call, or give the endpoint a longer timeout.`;
  }
  if (CONNECTION_CODES.has(code)) {
    return `The host was found, but the connection to it failed (${code}). Check that the API runs and listens on the port the baseURL names, and that no firewall or proxy in between drops the connection.`;
  }
  if (CERTIFICATE_CODES.has(code)) {
    return `The API's TLS certificate was not trusted (${code}). A self-signed certificate, or one from a private authority, needs that authority given to Node.js through NODE_EXTRA_CA_CERTS; an expired certificate, or one issued for another host name, needs fixing on the server.`;
  }
  return `${GENERAL} The system reported ${code}.`;
}
