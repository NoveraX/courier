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
