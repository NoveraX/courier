import { neededHeaders } from "./needed-headers";

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

export const getRequestHeaders = (
  incomingHeaders?: HeadersInput,
  validHeaders: string[] = [],
): Headers => {
  const allValidHeaders = new Set<string>([...neededHeaders, ...validHeaders]);
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
  kyHeaders: HeadersInput = {},
  requestHeaders?: HeadersInput,
  validHeaders?: string[],
): Headers => {
  const merged = toHeaders(kyHeaders);

  if (!requestHeaders) return merged;

  const filtered = getRequestHeaders(requestHeaders, validHeaders);

  filtered.forEach((value, key) => {
    merged.set(key, value);
  });

  return merged;
};
