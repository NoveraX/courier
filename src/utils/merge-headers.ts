type KyHeadersInit = NonNullable<RequestInit["headers"]> | Record<string, string | undefined>;

import { isHeaders } from "./helpers";
import neededHeaders from "./needed-headers";

export const getRequestHeaders = (
  incomingHeaders?: RequestHeaders,
  validHeaders: string[] = [],
): Record<(typeof neededHeaders)[number], string> => {
  const allValidHeaders = new Set([...neededHeaders, ...validHeaders]);

  const objectHeaders =
    incomingHeaders instanceof Headers
      ? Object.fromEntries(incomingHeaders.entries())
      : incomingHeaders;

  return Object.fromEntries(
    Object.keys(objectHeaders || {})
      .map((key) => {
        const value = (objectHeaders as Record<string, string | undefined>)?.[key];

        if (value && allValidHeaders.has(key.toLowerCase() as (typeof neededHeaders)[number])) {
          return [key, value];
        }

        return [];
      })
      .filter((value) => value.length > 0),
  );
};

const mergeHeaders = (
  kyHeaders: KyHeadersInit = {},
  requestHeaders?: RequestHeaders,
  validHeaders?: string[],
): KyHeadersInit => {
  const newHeaders = kyHeaders;

  if (!requestHeaders) return newHeaders;

  const headers = getRequestHeaders(requestHeaders, validHeaders);

  for (const key in headers) {
    if (Object.hasOwn(headers, key)) {
      const value = headers[key as keyof typeof headers];

      if (!value) continue;

      if (isHeaders(newHeaders)) {
        newHeaders.set(key, value);
        continue;
      }

      if (Array.isArray(newHeaders)) {
        newHeaders.push([key, value]);
        continue;
      }

      newHeaders[key] = value;
    }
  }

  return newHeaders;
};

export default mergeHeaders;

type RequestHeaders = Headers | KyHeadersInit;
