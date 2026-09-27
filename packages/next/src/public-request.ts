/**
 * The request as its client addressed it.
 *
 * Next.js builds a route handler's `request.url` from the host it was started
 * with — `http://localhost:<port>` under `next start` — whatever `Host` the
 * browser sent. Anything that compares a page's `Origin` with that URL then
 * refuses the app's own pages. Next records what the client used in
 * `X-Forwarded-Host` and `X-Forwarded-Proto`, filling them from `Host` and the
 * socket when no proxy in front already did, and its own Server Actions trust
 * them for the same comparison; this reads them the same way.
 *
 * A page cannot use them to pass for another site: a browser refuses to send
 * either on a cross-origin request unless a preflight allowed it, and the
 * proxy decides from `Sec-Fetch-Site` wherever the browser sends it.
 *
 * @param request - The request Next handed to the route
 * @returns A request whose URL carries the addressed origin, or the same
 *   request when it already does or no usable host was sent
 *
 * @example
 * ```ts
 * handlePost(publicRequest(request));
 * ```
 */
export function publicRequest(request: Request): Request {
  const url = new URL(request.url);
  const host = firstValue(request.headers.get("x-forwarded-host")) ?? request.headers.get("host");
  if (!host) return request;

  const proto = firstValue(request.headers.get("x-forwarded-proto"))?.toLowerCase();
  const scheme = proto === "https" || proto === "http" ? proto : url.protocol.slice(0, -1);
  const origin = `${scheme}://${host}`;
  /* A host that does not parse names no site; the request keeps the URL Next
     gave it and is judged against that. */
  if (!URL.canParse(origin)) return request;

  const addressed = new URL(`${url.pathname}${url.search}`, origin);
  if (addressed.origin === url.origin) return request;

  const init: RequestInit & { duplex?: "half" } = {
    method: request.method,
    headers: request.headers,
    body: request.body,
    signal: request.signal,
  };
  if (request.body) init.duplex = "half";
  return new Request(addressed, init);
}

/** The client-facing value of a forwarded header: the first of a chain. */
function firstValue(header: string | null): string | undefined {
  return header?.split(",")[0]?.trim() || undefined;
}
