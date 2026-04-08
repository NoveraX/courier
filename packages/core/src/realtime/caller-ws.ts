import { createWSConnection } from "./ws/ws-connection";
import type { WSConnection, WSConnectionConfig } from "./ws/ws-types";

/** Shared WS connection pool — one connection per URL */
const connections = new Map<string, WSConnection>();

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

/** Get or create a shared WSConnection for a given URL */
export function getConnection(url: string, config?: Partial<WSConnectionConfig>): WSConnection {
  const existing = connections.get(url);
  if (existing && existing.status !== "disconnected") return existing;

  // Close stale disconnected connection before replacing
  if (existing) existing.close();

  const conn = createWSConnection({ url, ...config });
  connections.set(url, conn);
  return conn;
}

/** Clear the shared connection pool (for testing) */
export function clearWSConnectionPool(): void {
  for (const conn of connections.values()) conn.close();
  connections.clear();
}
