import { isRequestId, REQUEST_ID_HEADER } from "../session/request-id";
import { keepBrowserCredentials } from "./keep-browser-credentials";
import { filterHeaders } from "./merge-headers";

type HeadersInput = HeadersInit | Record<string, string | undefined>;

/* A header's name, as HTTP spells one: `Headers.delete` throws on anything else. */
const HEADER_NAME = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;

/**
 * The headers a call carries from the request it is made for: those the
 * allowlist and the API name, short of the ones the API sets itself in its
 * `headers` — a service token, the `Referer` its upstream checks — which
 * reach the upstream as the API wrote them, whatever the request carried.
 * A request id goes on only when it is one, so a page cannot write what it
 * likes into the upstream's logs; the credentials a browser sends by
 * itself, only where the API or the endpoint names `authorization`.
 *
 * @param incoming - The request's headers
 * @param named - The header names the API and the endpoint carry
 * @param own - The API's own `headers`
 * @param source - The API's name, for the log line about held-back credentials
 * @returns The headers to carry, a set of its own
 * @example
 * ```ts
 * forwardedRequestHeaders(
 *   { authorization: "Bearer page", referer: "https://shop.example/" },
 *   undefined,
 *   { authorization: "Bearer service" },
 *   "api",
 * ); // → referer: https://shop.example/
 * ```
 */
export function forwardedRequestHeaders(
  incoming: HeadersInput,
  named: string[] | undefined,
  own: HeadersInit | undefined,
  source: string,
): Headers {
  const headers = filterHeaders(incoming, named);
  keepBrowserCredentials(headers, named, source);
  for (const name of headerNames(own)) if (HEADER_NAME.test(name)) headers.delete(name);
  const id = headers.get(REQUEST_ID_HEADER);
  if (id !== null && !isRequestId(id)) headers.delete(REQUEST_ID_HEADER);
  return headers;
}

/* The names a header set gives values to, however it is written: as Headers, as pairs, as a record. */
function headerNames(init: HeadersInit | undefined): string[] {
  if (init === undefined) return [];
  if (Array.isArray(init)) return init.map(([name = ""]) => name);
  if (isHeadersLike(init)) {
    const names: string[] = [];
    init.forEach((_value, name) => {
      names.push(name);
    });
    return names;
  }
  return Object.entries(init)
    .filter(([, value]) => value !== undefined)
    .map(([name]) => name);
}

/* A Headers of any realm: one a library or another fetch made is not this runtime's. */
function isHeadersLike(init: object): init is Headers {
  return (
    typeof Reflect.get(init, "forEach") === "function" &&
    typeof Reflect.get(init, "get") === "function"
  );
}
