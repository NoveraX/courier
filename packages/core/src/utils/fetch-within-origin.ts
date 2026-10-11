/** As many redirects as `fetch` follows before it gives up. */
const MAX_REDIRECTS = 20;

const REDIRECT_STATUSES: ReadonlySet<number> = new Set([301, 302, 303, 307, 308]);

/** Headers that describe a body, dropped with the body when a redirect turns a request into a GET. */
const BODY_HEADERS = [
  "content-encoding",
  "content-language",
  "content-length",
  "content-location",
  "content-type",
] as const;

/**
 * Fetch, following redirects only while they stay on the request's origin.
 *
 * `fetch` follows every redirect and, when one leaves the origin, drops only
 * `Authorization` and `Cookie`. A request carrying a key some other header
 * holds — one a server-side middleware added — took it to whatever host the
 * upstream named. Here a redirect to another origin is not followed: its
 * answer is returned as it came, so the key never leaves the host it was
 * meant for. A redirect on the same origin is followed as `fetch` would,
 * except that a body sent as a stream cannot be sent twice, so a redirect
 * that would repeat it is returned instead.
 *
 * @param url - Where to send the request
 * @param init - The request, as it would be given to `fetch`
 * @param send - What sends each hop: the platform's `fetch`, or the source's own
 * @returns The first answer that is not a redirect this may follow
 *
 * @example
 * ```ts
 * const response = await fetchWithinOrigin("https://api.example.com/users", { headers });
 * ```
 */
export async function fetchWithinOrigin(
  url: string,
  init: RequestInit,
  send: (url: string, init: RequestInit) => Promise<Response> = fetch,
): Promise<Response> {
  const origin = new URL(url).origin;
  let target = url;
  let request: RequestInit = { ...init, redirect: "manual" };

  for (let hops = 0; ; hops += 1) {
    const response = await send(target, request);
    const next = hops < MAX_REDIRECTS ? sameOriginLocation(response, target, origin) : undefined;
    const replay = next ? redirected(request, response.status) : undefined;
    if (!next || !replay) return response;

    /* The redirect's own body is never read; releasing it frees the socket. */
    await response.body?.cancel();
    target = next;
    request = replay;
  }
}

/** Where a redirect points, when it is one and stays on the origin. */
function sameOriginLocation(response: Response, from: string, origin: string): string | undefined {
  if (!REDIRECT_STATUSES.has(response.status)) return undefined;
  const location = response.headers.get("location");
  if (!location || !URL.canParse(location, from)) return undefined;
  const next = new URL(location, from);
  return next.origin === origin ? next.href : undefined;
}

/**
 * The request to send after a redirect, as the Fetch standard rewrites it: a
 * 303, or a 301 or 302 answering a POST, becomes a GET without a body.
 */
function redirected(request: RequestInit, status: number): RequestInit | undefined {
  const method = (request.method ?? "GET").toUpperCase();
  const toGet =
    (status === 303 && method !== "GET" && method !== "HEAD") ||
    ((status === 301 || status === 302) && method === "POST");

  if (toGet) {
    const headers = new Headers(request.headers);
    for (const name of BODY_HEADERS) headers.delete(name);
    return { ...request, method: "GET", body: null, headers };
  }
  return request.body instanceof ReadableStream ? undefined : request;
}
