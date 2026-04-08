/**
 * Build a WebSocket URL with an optional auth token appended as a
 * `?token=...` query parameter. Works synchronously when `getAuthToken`
 * is missing or returns a string, asynchronously when it returns a
 * Promise.
 *
 * Returns either a `string` or a `Promise<string>` so the caller can
 * stay synchronous in the common case (no auth) and only opt into async
 * when the token must be fetched.
 */
export function resolveAuthUrl(
  url: string,
  getAuthToken?: () => string | Promise<string>,
): string | Promise<string> {
  if (!getAuthToken) return url;
  const result = getAuthToken();
  return typeof result === "string"
    ? appendToken(url, result)
    : result.then((t) => appendToken(url, t));
}

function appendToken(url: string, token: string): string {
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}token=${encodeURIComponent(token)}`;
}
