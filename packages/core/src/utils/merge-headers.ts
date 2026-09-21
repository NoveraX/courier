import { ALLOWED_HEADERS, RESPONSE_HEADERS, STREAMED_RESPONSE_HEADERS } from "./allowed-headers";

type HeadersInput = HeadersInit | Record<string, string | undefined>;

const toHeaders = (input: HeadersInput): Headers => {
  if (input instanceof Headers) {
    return new Headers(input);
  }

  if (Array.isArray(input)) {
    return new Headers(input);
  }

  const headers = new Headers();
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined) {
      headers.set(key, value);
    }
  }
  return headers;
};

export const filterHeaders = (
  incomingHeaders?: HeadersInput,
  validHeaders: string[] = [],
): Headers => {
  const allValidHeaders = new Set<string>([...ALLOWED_HEADERS, ...validHeaders]);
  const source = incomingHeaders ? toHeaders(incomingHeaders) : new Headers();
  const result = new Headers();

  source.forEach((value, key) => {
    if (allValidHeaders.has(key.toLowerCase())) {
      result.set(key, value);
    }
  });

  return result;
};

export const mergeHeaders = (
  baseHeaders: HeadersInput = {},
  requestHeaders?: HeadersInput,
  validHeaders?: string[],
): Headers => {
  const merged = toHeaders(baseHeaders);

  if (!requestHeaders) return merged;

  const filtered = filterHeaders(requestHeaders, validHeaders);

  filtered.forEach((value, key) => {
    merged.set(key, value);
  });

  return merged;
};

/**
 * Keep only the upstream response headers the browser may see.
 *
 * @param headers - Headers as the upstream sent them
 * @param options - `streamed` when the body passes through unchanged
 * @returns A new Headers carrying only what is allowed back
 *
 * @example
 * ```ts
 * filterResponseHeaders(upstream.headers); // buffered answer
 * filterResponseHeaders(upstream.headers, { streamed: true });
 * ```
 */
export const filterResponseHeaders = (
  headers?: HeadersInput,
  options?: { streamed?: boolean },
): Headers => {
  const allowed = new Set<string>([
    ...RESPONSE_HEADERS,
    ...(options?.streamed ? STREAMED_RESPONSE_HEADERS : []),
  ]);
  const source = headers ? toHeaders(headers) : new Headers();
  const result = new Headers();

  source.forEach((value, key) => {
    if (allowed.has(key.toLowerCase())) result.set(key, value);
  });

  return result;
};
