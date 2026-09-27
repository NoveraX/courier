import { LIMITS } from "../adapter/limits";
import { createWSConnection } from "./ws/ws-connection";
import type { WSConnection, WSConnectionConfig } from "./ws/ws-types";

/** A pooled connection, and how many subscriptions use it. */
interface PooledConnection {
  connection: WSConnection;
  users: number;
  idleTimer?: ReturnType<typeof setTimeout>;
}

/** A pooled connection taken by one subscription, released when it ends. */
export interface ConnectionLease {
  readonly connection: WSConnection;
  /** Give the connection back. The last user's release closes it once it has sat idle. */
  release(): void;
}

/** Shared WS connection pool — one connection per URL */
const pool = new Map<string, PooledConnection>();

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

/**
 * Take the shared connection for a URL, opening it when there is none.
 *
 * The connection used to stay open after the last subscription on it had
 * ended — heartbeats and all, counted against the server's per-address cap,
 * and keeping a Node process from exiting. Now the last release closes it
 * once it has sat idle for `LIMITS.WS_IDLE_CLOSE_MS`, so a subscription
 * opened straight after another closed, as when a component remounts,
 * reuses it.
 *
 * @param url - The WebSocket URL
 * @param config - Options for a connection this call opens; an open one keeps its own
 * @returns The lease on the connection
 *
 * @example
 * const lease = acquireConnection("wss://api.example.com/ws");
 * const stop = lease.connection.subscribe("api.chat.room", onMessage);
 * stop();
 * lease.release();
 */
export function acquireConnection(
  url: string,
  config?: Partial<WSConnectionConfig>,
): ConnectionLease {
  const pooled = poolEntry(url, config);
  clearTimeout(pooled.idleTimer);
  pooled.idleTimer = undefined;
  pooled.users++;
  let released = false;

  return {
    connection: pooled.connection,
    release() {
      if (released) return;
      released = true;
      if (--pooled.users > 0) return;
      pooled.idleTimer = setTimeout(() => {
        if (pool.get(url) === pooled) pool.delete(url);
        pooled.connection.close();
      }, LIMITS.WS_IDLE_CLOSE_MS);
    },
  };
}

/** The live pooled connection for a URL; one that closed for good is replaced. */
function poolEntry(url: string, config?: Partial<WSConnectionConfig>): PooledConnection {
  const existing = pool.get(url);
  if (existing && existing.connection.status !== "disconnected") return existing;
  if (existing) {
    clearTimeout(existing.idleTimer);
    existing.connection.close();
  }
  const created: PooledConnection = {
    connection: createWSConnection({ url, ...config }),
    users: 0,
  };
  pool.set(url, created);
  return created;
}

/** Close every pooled connection and empty the pool (for testing) */
export function clearWSConnectionPool(): void {
  for (const pooled of pool.values()) {
    clearTimeout(pooled.idleTimer);
    pooled.connection.close();
  }
  pool.clear();
}
