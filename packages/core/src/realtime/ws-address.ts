/**
 * Where a channel is: its WebSocket address and the topic it is multiplexed
 * under. Kept apart from the connection pool, so code that only addresses a
 * channel does not carry the WebSocket client.
 */

/** Build a direct WS URL: wsURL/prefix/method */
export function buildDirectWSUrl(baseURL: string, prefix: string, method: string): string {
  const base = toWSScheme(baseURL).replace(/\/$/, "");
  const groupPath = prefix ? `/${prefix.replace(/^\//, "")}` : "";
  return `${base}${groupPath}/${method}`;
}

/**
 * Convert an HTTP(S) URL to its WebSocket equivalent:
 * - `http://`  → `ws://`
 * - `https://` → `wss://`
 *
 * Non-HTTP URLs (e.g. already `ws://` / `wss://`, relative paths) are
 * returned unchanged so callers can pass any reasonable input.
 */
export function toWSScheme(url: string): string {
  if (url.startsWith("https://")) return `wss://${url.slice(8)}`;
  if (url.startsWith("http://")) return `ws://${url.slice(7)}`;
  return url;
}

/** Build a WS topic string for multiplexed connections */
export function buildWSTopic(source: string, group: string, method: string): string {
  return group ? `${source}.${group}.${method}` : `${source}.${method}`;
}
