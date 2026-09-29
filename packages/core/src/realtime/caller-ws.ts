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

/** Shared WS connection pool — one connection per URL and caller options */
const pool = new Map<string, PooledConnection>();

/** A number for each options object connections were opened with, so each has its own. */
const optionsIds = new WeakMap<object, number>();
let lastOptionsId = 0;

/**
 * The pool entry a connection to `url` with `config` belongs to. Connections
 * opened without options share one per URL; options — a caller's `ws` —
 * have their own beside it, so a second caller's are not ignored for the
 * socket the first one opened.
 */
function poolKey(url: string, config: object | undefined): string {
  if (config === undefined) return url;
  let id = optionsIds.get(config);
  if (id === undefined) {
    id = ++lastOptionsId;
    optionsIds.set(config, id);
  }
  return `${id} ${url}`;
}

/**
 * Take the shared connection for a URL and options, opening it when there is none.
 *
 * The connection used to stay open after the last subscription on it had
 * ended — heartbeats and all, counted against the server's per-address cap,
 * and keeping a Node process from exiting. Now the last release closes it
 * once it has sat idle for `LIMITS.WS_IDLE_CLOSE_MS`, so a subscription
 * opened straight after another closed, as when a component remounts,
 * reuses it.
 *
 * @param url - The WebSocket URL
 * @param config - Options of the connection; the same object shares its socket
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
  const key = poolKey(url, config);
  const pooled = poolEntry(key, url, config);
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
        if (pool.get(key) === pooled) pool.delete(key);
        pooled.connection.close();
      }, LIMITS.WS_IDLE_CLOSE_MS);
    },
  };
}

/** The live pooled connection for a pool key; one that closed for good is replaced. */
function poolEntry(
  key: string,
  url: string,
  config?: Partial<WSConnectionConfig>,
): PooledConnection {
  const existing = pool.get(key);
  if (existing && existing.connection.status !== "disconnected") return existing;
  if (existing) {
    clearTimeout(existing.idleTimer);
    existing.connection.close();
  }
  const created: PooledConnection = {
    connection: createWSConnection({ url, ...config }),
    users: 0,
  };
  pool.set(key, created);
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
