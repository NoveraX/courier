import { LIMITS } from "../adapter/limits";
import { createLogger } from "../logger";
import { ConnectionError, RealtimeError } from "./errors";
import { createWSConnection } from "./ws/ws-connection";
import type { WSConnection, WSConnectionConfig } from "./ws/ws-types";

/** A pooled connection, and how many subscriptions use it. */
interface PooledConnection {
  connection: WSConnection;
  users: number;
  idleTimer?: ReturnType<typeof setTimeout> | undefined;
  /** Stops listening for a drop while the connection sits idle. */
  unwatch?: (() => void) | undefined;
}

/** A pooled connection taken by one subscription, released when it ends. */
export interface ConnectionLease {
  readonly connection: WSConnection;
  /** Give the connection back. The last user's release closes it once it has sat idle. */
  release(): void;
}

const log = createLogger("WS");

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
function poolKey(url: string, config: Partial<WSConnectionConfig> | undefined): string {
  if (config === undefined) return url;
  if (config.shareKey !== undefined) return `${config.shareKey} ${url}`;
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
 * The last release closes the connection once it has sat idle for
 * `LIMITS.WS_IDLE_CLOSE_MS`, so it neither stays open with no subscription —
 * heartbeats and all, counted against the server's per-address cap, and
 * keeping a Node process from exiting — nor closes under a subscription
 * opened straight after another closed, as when a component remounts.
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
  pooled.unwatch?.();
  pooled.unwatch = undefined;
  pooled.users++;
  let released = false;

  return {
    connection: pooled.connection,
    release() {
      if (released) return;
      released = true;
      if (--pooled.users > 0) return;
      const retire = (): void => {
        clearTimeout(pooled.idleTimer);
        pooled.idleTimer = undefined;
        pooled.unwatch?.();
        pooled.unwatch = undefined;
        if (pool.get(key) === pooled) pool.delete(key);
        pooled.connection.close();
      };
      pooled.idleTimer = setTimeout(retire, LIMITS.WS_IDLE_CLOSE_MS);
      /* Nobody is subscribed while it waits to be reused: a socket that drops
         then is not worth reopening, and the next subscription opens anew. */
      pooled.unwatch = pooled.connection.onStatusChange((status) => {
        if (status === "reconnecting" || status === "disconnected") retire();
      });
    },
  };
}

/**
 * Take the shared connection once its options are found — on a server,
 * whose session the socket opens with. Options that cannot be found, or a
 * URL no connection opens, are what the subscription fails with.
 *
 * @param url - The WebSocket URL
 * @param config - The options, still being found
 * @returns The lease, or why there is none
 * @example
 * ```ts
 * const taken = await leaseWhenFound(url, options);
 * if (taken instanceof RealtimeError) finish(taken);
 * ```
 */
export async function leaseWhenFound(
  url: string,
  config: Promise<Partial<WSConnectionConfig> | undefined>,
): Promise<ConnectionLease | RealtimeError> {
  try {
    return acquireConnection(url, await config);
  } catch (error) {
    log.warn("A socket could not be opened", error);
    if (error instanceof RealtimeError) return error;
    const reason = error instanceof Error ? error.message : String(error);
    return new ConnectionError(`The socket could not be opened: ${reason}`);
  }
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
    pooled.unwatch?.();
    pooled.connection.close();
  }
  pool.clear();
}
