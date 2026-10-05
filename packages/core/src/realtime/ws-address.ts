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

/** Build a WS topic string for multiplexed connections: `source.group.method`, the group a path at any depth */
export function buildWSTopic(source: string, group: string, method: string): string {
  return group ? `${source}.${group}.${method}` : `${source}.${method}`;
}

/** The endpoint a topic names, read back from what `buildWSTopic` wrote. */
export interface TopicEndpoint {
  source: string;
  /** The group's path, `billing.invoices`; empty for an endpoint the source holds itself */
  group: string;
  method: string;
}

/**
 * Read the endpoint a topic's base names: the source first, the endpoint
 * last, and the group's path between them, however deep.
 *
 * @param base - The topic without its key: `shop.billing.invoices.watch`
 * @returns The endpoint, or `undefined` when the topic names no source and endpoint
 * @example
 * ```ts
 * parseWSTopic("shop.billing.invoices.watch"); // → { source: "shop", group: "billing.invoices", method: "watch" }
 * parseWSTopic("shop.watch"); // → { source: "shop", group: "", method: "watch" }
 * ```
 */
export function parseWSTopic(base: string): TopicEndpoint | undefined {
  const [source, ...rest] = base.split(".");
  const method = rest.pop();
  if (!source || !method || rest.some((name) => name === "")) return undefined;
  return { source, group: rest.join("."), method };
}
