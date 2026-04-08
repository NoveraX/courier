/**
 * Extract auth token from a WebSocket upgrade request.
 * Checks (in order): Sec-WebSocket-Protocol header, ?token= query param, cookie.
 */
export function extractWSAuth(request: Request): string | undefined {
  // 1. Sec-WebSocket-Protocol — used as auth transport in browsers
  const protocol = request.headers.get("Sec-WebSocket-Protocol");
  if (protocol) return protocol;

  // 2. Query param ?token=
  const url = new URL(request.url);
  const token = url.searchParams.get("token");
  if (token) return token;

  // 3. Cookie — extract first auth-like cookie value
  const cookie = request.headers.get("Cookie");
  if (cookie) return extractTokenFromCookie(cookie);

  return undefined;
}

/**
 * Validate the request Origin header against allowed origins.
 * In production: rejects all if allowedOrigins is not configured (secure-by-default).
 * In development: allows all if allowedOrigins is not configured.
 * Supports wildcard patterns: "*.example.com" matches "api.example.com".
 *
 * # Studio Playground escape hatch
 *
 * The Studio Playground proxy WS executor runs inside the user-app's Node
 * process and opens `new WebSocket(url)` against the configured `proxyPath.ws`.
 * Node's global `WebSocket` (undici) does NOT send an `Origin` header — it's
 * a browser-only concept and Node has no "page" to identify. The result is
 * that any user with `allowedOrigins` configured (the demo server uses
 * `["http://localhost:3000"]`) sees their playground WS Subscribe hang
 * forever because the upgrade request is rejected with `4403`.
 *
 * Recognize the playground correlation sigil (`?_playground_rid=…` query
 * param, attached by `createProxyWSChannelFactory`) AND require the absence
 * of an Origin header to scope the bypass to non-browser requests:
 * browsers ALWAYS send Origin per the WebSocket protocol spec, so this
 * combination cannot be triggered from a malicious page. Trusted Studio
 * Playground proxy execution is the only consumer.
 */
export function validateOrigin(request: Request, allowedOrigins?: string[]): boolean {
  const origin = request.headers.get("Origin");

  if (!origin && hasPlaygroundRid(request)) return true;

  if (!allowedOrigins?.length) {
    return process.env.NODE_ENV !== "production";
  }

  if (!origin) return false;

  return allowedOrigins.some((pattern) => matchOrigin(origin, pattern));
}

function hasPlaygroundRid(request: Request): boolean {
  try {
    return new URL(request.url).searchParams.has("_playground_rid");
  } catch {
    return false;
  }
}

/** Case-insensitive origin matching with wildcard support */
function matchOrigin(origin: string, pattern: string): boolean {
  const o = origin.toLowerCase();
  const p = pattern.toLowerCase();
  if (o === p) return true;
  // Wildcard: *.example.com matches sub.example.com but not example.com
  if (p.startsWith("*.")) return o.endsWith(`.${p.slice(2)}`);
  return false;
}

const AUTH_COOKIE_NAMES = ["token", "authorization", "session"];

/** Extract token from cookie header (looks for "token" or "authorization" cookie) */
function extractTokenFromCookie(cookie: string): string | undefined {
  const pairs = cookie.split(";");

  for (const pair of pairs) {
    const eqIdx = pair.indexOf("=");
    if (eqIdx === -1) continue;
    const name = pair.slice(0, eqIdx).trim().toLowerCase();
    if (AUTH_COOKIE_NAMES.includes(name)) return pair.slice(eqIdx + 1).trim();
  }

  return undefined;
}
