import type { RefusalLog } from "../logger/refusal-log";
import type { ConnectionLeaseStore, LeaseGrant, LeaseRule } from "../realtime/adapters";
import { LIMITS } from "./limits";
import type { ConnectionLimitRule } from "./ws-types";

const encoder = new TextEncoder();

/** A limit on the connections of one key, as a handler applies it. */
export interface ConnectionLimiter {
  /**
   * Take the lease of a connection `onConnect` admitted.
   * @returns The connections given up for it, wherever they are held; undefined when it is refused
   */
  admit(
    connectionId: string,
    meta: Readonly<Record<string, unknown>>,
  ): Promise<readonly string[] | undefined>;
  /** Give up the lease of a connection that closed, or was never registered */
  release(connectionId: string): void;
  /** Stop renewing the leases held */
  destroy(): void;
}

export interface ConnectionLimiterOptions {
  readonly rule: ConnectionLimitRule;
  readonly store: ConnectionLeaseStore;
  /** The cluster's secret: with it, a key is hashed with HMAC, so the store holds nothing a guess could be checked against */
  readonly secret: string | undefined;
  readonly refusals: RefusalLog;
  /** How long the store has to decide before this replica decides alone (default 2 s) */
  readonly timeoutMs?: number | undefined;
  /** How often the leases held are renewed (default 20 s) */
  readonly renewEveryMs?: number | undefined;
}

/**
 * A limit on the connections of one key — a user's tabs and devices —
 * counted in a lease store, so that every replica sharing it counts them
 * all. A connection over the limit has the oldest of its key given up for
 * it, or is refused. Keys reach the store hashed, never as they are. A store
 * that cannot decide in time is not waited on: the connection is let in, by
 * this replica's own count of the key's connections, and why is logged — a
 * limit guards against abuse, and an outage of Redis must not lock users
 * out.
 *
 * @param options - The rule, the store, the secret and the log
 * @returns The limiter
 *
 * @example
 * ```ts
 * const limiter = createConnectionLimiter({ rule, store, secret, refusals });
 * const evicted = await limiter.admit(connectionId, meta);
 * ```
 */
export function createConnectionLimiter(options: ConnectionLimiterOptions): ConnectionLimiter {
  const { rule, store, refusals } = options;
  const leaseRule: LeaseRule = { max: rule.max, onExceed: rule.onExceed ?? "evict-oldest" };
  const timeoutMs = options.timeoutMs ?? LIMITS.WS_LEASE_TIMEOUT_MS;
  const renewEveryMs = options.renewEveryMs ?? LIMITS.WS_LEASE_RENEW_MS;
  const hashKey = keyHasher(options.secret);
  /* This replica's leases: each connection's scope, and each scope's connections in the order they came. */
  const scopeOf = new Map<string, string>();
  const byScope = new Map<string, Set<string>>();
  let renewal: ReturnType<typeof setInterval> | undefined;

  function renew(): void {
    const leases = [...scopeOf].map(([lease, scope]) => ({ scope, lease }));
    store.renew(leases).catch((error: unknown) => {
      refusals.warn({ event: "connection leases not renewed", code: "LEASES_UNAVAILABLE" }, error);
    });
  }

  function hold(lease: string, scope: string): void {
    scopeOf.set(lease, scope);
    byScope.set(scope, (byScope.get(scope) ?? new Set()).add(lease));
    if (renewal) return;
    renewal = setInterval(renew, renewEveryMs);
    (renewal as { unref?: () => void }).unref?.();
  }

  /* This replica's own decision, by the connections of the key it holds. */
  function decideAlone(scope: string): LeaseGrant {
    const mine = [...(byScope.get(scope) ?? [])];
    if (mine.length < leaseRule.max) return { admitted: true, evict: [] };
    if (leaseRule.onExceed === "reject") return { admitted: false };
    return { admitted: true, evict: mine.slice(0, mine.length - leaseRule.max + 1) };
  }

  return {
    async admit(connectionId, meta) {
      const key = rule.key(meta);
      if (key === undefined) return [];
      const scope = `key:${await hashKey(key)}`;
      let grant: LeaseGrant;
      try {
        grant = await withinDeadline(store.acquire(scope, connectionId, leaseRule), timeoutMs);
      } catch (error) {
        refusals.warn(
          { event: "connection leases unavailable", code: "LEASES_UNAVAILABLE" },
          error,
        );
        grant = decideAlone(scope);
      }
      if (!grant.admitted) return undefined;
      hold(connectionId, scope);
      return grant.evict.filter((given) => given !== connectionId);
    },
    release(connectionId) {
      const scope = scopeOf.get(connectionId);
      if (scope === undefined) return;
      scopeOf.delete(connectionId);
      const mine = byScope.get(scope);
      mine?.delete(connectionId);
      if (mine?.size === 0) byScope.delete(scope);
      if (scopeOf.size === 0) {
        clearInterval(renewal);
        renewal = undefined;
      }
      store.release(scope, connectionId).catch((error: unknown) => {
        refusals.warn(
          { event: "connection lease not released", code: "LEASES_UNAVAILABLE" },
          error,
        );
      });
    },
    destroy() {
      clearInterval(renewal);
      renewal = undefined;
    },
  };
}

/* 64 bits of SHA-256 — of HMAC-SHA-256 with the cluster's secret, when there is one — in hex. */
function keyHasher(secret: string | undefined): (key: string) => Promise<string> {
  const hmac =
    secret === undefined
      ? undefined
      : crypto.subtle.importKey(
          "raw",
          encoder.encode(secret),
          { name: "HMAC", hash: "SHA-256" },
          false,
          ["sign"],
        );
  return async (key) => {
    const data = encoder.encode(key);
    const digest = hmac
      ? await crypto.subtle.sign("HMAC", await hmac, data)
      : await crypto.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(digest).subarray(0, 8), (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join("");
  };
}

function withinDeadline<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expired = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`no answer within ${timeoutMs} ms`)), timeoutMs);
  });
  return Promise.race([promise, expired]).finally(() => clearTimeout(timer));
}
