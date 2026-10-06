/* The reason phrases of the error statuses the IANA registry names (RFC 9110 and its extensions). */
const REASONS: ReadonlyMap<number, string> = new Map([
  [400, "Bad Request"],
  [401, "Unauthorized"],
  [402, "Payment Required"],
  [403, "Forbidden"],
  [404, "Not Found"],
  [405, "Method Not Allowed"],
  [406, "Not Acceptable"],
  [407, "Proxy Authentication Required"],
  [408, "Request Timeout"],
  [409, "Conflict"],
  [410, "Gone"],
  [411, "Length Required"],
  [412, "Precondition Failed"],
  [413, "Content Too Large"],
  [414, "URI Too Long"],
  [415, "Unsupported Media Type"],
  [416, "Range Not Satisfiable"],
  [417, "Expectation Failed"],
  [421, "Misdirected Request"],
  [422, "Unprocessable Content"],
  [423, "Locked"],
  [424, "Failed Dependency"],
  [425, "Too Early"],
  [426, "Upgrade Required"],
  [428, "Precondition Required"],
  [429, "Too Many Requests"],
  [431, "Request Header Fields Too Large"],
  [451, "Unavailable For Legal Reasons"],
  [500, "Internal Server Error"],
  [501, "Not Implemented"],
  [502, "Bad Gateway"],
  [503, "Service Unavailable"],
  [504, "Gateway Timeout"],
  [505, "HTTP Version Not Supported"],
  [506, "Variant Also Negotiates"],
  [507, "Insufficient Storage"],
  [508, "Loop Detected"],
  [511, "Network Authentication Required"],
]);

/** How long an injected 429 or 503 asks the client to wait before it tries again, in seconds. */
export const FAULT_RETRY_AFTER_SECONDS = 5;

/**
 * The reason phrase of an error status, as the registry names it.
 *
 * @param status - A 4xx or 5xx status
 * @returns Its phrase, or `undefined` for a status the registry does not name
 * @example
 * ```ts
 * reasonPhrase(413); // "Content Too Large"
 * ```
 */
export function reasonPhrase(status: number): string | undefined {
  return REASONS.get(status);
}

/**
 * Whether a value is an error status: a whole number from 400 to 599.
 *
 * @param status - The value
 * @returns Whether it is one
 * @example
 * ```ts
 * isErrorStatus(429); // true
 * isErrorStatus(302); // false
 * ```
 */
export function isErrorStatus(status: number): boolean {
  return Number.isInteger(status) && status >= 400 && status <= 599;
}

/**
 * The headers a server sends with an error status of its own accord: the
 * challenge RFC 9110 requires with a 401 — a bearer one, which no browser
 * answers with a sign-in prompt — and when to try again with a 429 or a
 * 503.
 *
 * @param status - The error status
 * @returns Its headers; none for most statuses
 * @example
 * ```ts
 * statusHeaders(429); // { "Retry-After": "5" }
 * ```
 */
export function statusHeaders(status: number): Record<string, string> {
  if (status === 401) return { "WWW-Authenticate": 'Bearer realm="mock"' };
  if (status === 429 || status === 503) {
    return { "Retry-After": String(FAULT_RETRY_AFTER_SECONDS) };
  }
  return {};
}
