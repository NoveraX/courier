import type { RequestFailureCause } from "@/store/types";
import { certificateTrust } from "./certificate-trust";
import { type NetworkFailure, networkFailureOf } from "./network-failure";

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

/* The advice for Courier's own request to the API, which the source's definition sends. */
const ADVICE: Readonly<Record<NetworkFailure, (code: string) => string>> = {
  dns: (code) =>
    `The API's host name did not resolve (${code}). Check the host in the source's baseURL for a typo, and that this machine's network can resolve it: a host only a VPN or an internal DNS knows needs that network.`,
  "broken-answer": (code) =>
    `An answer began to come back, but it broke before it was whole (${code}): it was cut off, or its compression did not read. Check the API's server, and any proxy in between that rewrites or compresses its answers.`,
  "no-headers": (code) =>
    `The API took the connection but sent no headers in time (${code}): it is slow to answer, or hangs. Look at what the API does for this call, or give the endpoint a longer timeout.`,
  connection: (code) =>
    `The host was found, but the connection to it failed (${code}). Check that the API runs and listens on the port the baseURL names, and that no firewall, VPN or proxy in between drops the connection.`,
  certificate: (code) =>
    `The API's TLS certificate was not trusted (${code}). ${certificateTrust("the server")}`,
  redirects: () => REDIRECTS,
};

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
  if (REDIRECT_TEXT.test(cause.message)) return REDIRECTS;
  if (code === undefined) {
    return BROWSER_TEXTS.has(cause.message)
      ? `${GENERAL} In a browser, a request refused by CORS or blocked as mixed content fails the same way; the browser's console says which.`
      : UNCODED;
  }
  const failure = networkFailureOf(code);
  return failure === undefined ? `${GENERAL} The system reported ${code}.` : ADVICE[failure](code);
}
