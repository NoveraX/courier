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

/* zlib's and Node's streams' own: as often the app's own decompression or stream as an answer's. */
const LOCAL_CODES: ReadonlySet<string> = new Set([
  "Z_DATA_ERROR",
  "Z_BUF_ERROR",
  "ERR_STREAM_PREMATURE_CLOSE",
]);

const CERTIFICATE_CODES: ReadonlySet<string> = new Set([
  "DEPTH_ZERO_SELF_SIGNED_CERT",
  "SELF_SIGNED_CERT_IN_CHAIN",
  "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
  "UNABLE_TO_GET_ISSUER_CERT_LOCALLY",
  "UNABLE_TO_GET_ISSUER_CERT",
  "CERT_HAS_EXPIRED",
  "CERT_NOT_YET_VALID",
  "CERT_REVOKED",
  "HOSTNAME_MISMATCH",
  "ERR_TLS_CERT_ALTNAME_INVALID",
]);

/* undici's own failures and the TLS layer's: a request that got no answer, whatever the advice. */
const NETWORK_FAMILY = /^(?:UND_ERR_|ERR_(?:SSL|TLS)_)/;

/** What went wrong with a request that got no answer, as its code tells it. */
export type NetworkFailure =
  | "dns"
  | "connection"
  | "broken-answer"
  | "no-headers"
  | "certificate"
  | "redirects";

/**
 * What went wrong with a request that got no answer, told from the code
 * the system gave: a host name that did not resolve, a connection that
 * failed, an answer that broke as it arrived, an API that sent no headers
 * in time, a certificate that was not trusted, redirects with no end.
 *
 * @param code - The code the system gave
 * @returns The failure, or `undefined` for a code none of these is
 * @example
 * ```ts
 * networkFailureOf("ENOTFOUND"); // "dns"
 * networkFailureOf("EPROTO"); // undefined
 * ```
 */
export function networkFailureOf(code: string): NetworkFailure | undefined {
  if (DNS_CODES.has(code)) return "dns";
  if (BROKEN_ANSWER_CODES.has(code)) return "broken-answer";
  if (code === "UND_ERR_HEADERS_TIMEOUT") return "no-headers";
  if (CONNECTION_CODES.has(code)) return "connection";
  if (CERTIFICATE_CODES.has(code)) return "certificate";
  return code === "TooManyRedirects" ? "redirects" : undefined;
}

/**
 * Whether a code says a request got no answer: one {@link networkFailureOf}
 * tells, or any of undici's and the TLS layer's own. A failure of the app's
 * own code with such a code is a request it made that got no answer. zlib's
 * and Node's streams' codes are not among them: the app's own code raises
 * them as often, decompressing or piping data of its own.
 *
 * @param code - The code the system gave
 * @returns Whether it is a network failure's
 * @example
 * ```ts
 * isNetworkCode("UND_ERR_CONNECT_TIMEOUT"); // true
 * isNetworkCode("ENOENT"); // false: a file, not a request
 * isNetworkCode("Z_DATA_ERROR"); // false: the app's own data may not inflate
 * ```
 */
export function isNetworkCode(code: string): boolean {
  if (LOCAL_CODES.has(code)) return false;
  return networkFailureOf(code) !== undefined || NETWORK_FAMILY.test(code);
}
