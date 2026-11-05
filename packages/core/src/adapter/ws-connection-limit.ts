import type { RefusalLog } from "../logger/refusal-log";
import type { ConnectionLeaseStore, LeaseGrant, LeaseRule } from "../realtime/adapters";
import { withinDeadline } from "../utils/within-deadline";
import { LIMITS } from "./limits";
import type { ConnectionLimitRule } from "./ws-types";

const encoder = new TextEncoder();

/** A connection under the limits: who `onConnect` said it is, and the address the handler counts it against. */
export interface LimitedConnection {
  readonly connectionId: string;
  readonly meta: Readonly<Record<string, unknown>>;
  readonly clientIp: string;
}

/** The limits on the connections of keys, as a handler applies them. */
export interface ConnectionLimiter {
  /**
   * Take the leases of a connection `onConnect` admitted, one for each rule that gives it a key.
   * @returns The connections given up for it, wherever they are held; undefined when a rule refuses it
   */
  admit(connection: LimitedConnection): Promise<readonly string[] | undefined>;
  /** Give up the leases of a connection that closed, or was never registered */
  release(connectionId: string): void;
  /** Stop renewing the leases held */
  destroy(): void;
}

export interface ConnectionLimiterOptions {
  readonly rules: readonly ConnectionLimitRule[];
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
 * Limits on the connections of keys — a user's tabs and devices, an
 * address's — counted in a lease store, so that every replica sharing it
 * counts them all. Over a rule's limit, the oldest connections of the key
 * are given up for the new one, or the new one is refused. The rules that
 * refuse are applied first, so a connection refused has given nothing up.
 * Keys reach the store hashed, each rule's apart from every other's, never
 * as they are. A store that cannot decide in time is not waited on: the
 * connection is let in, by this replica's own count of the key's
 * connections, and why is logged — a limit guards against abuse, and an
 * outage of Redis must not lock users out.
 *
 * @param options - The rules, the store, the secret and the log
 * @returns The limiter
 *
 * @example
 * ```ts
 * const limiter = createConnectionLimiter({ rules, store, secret, refusals });
 * const evicted = await limiter.admit({ connectionId, meta, clientIp });
 * ```
 */
export function createConnectionLimiter(options: ConnectionLimiterOptions): ConnectionLimiter {
  const { store, refusals } = options;
  const timeoutMs = options.timeoutMs ?? LIMITS.WS_LEASE_TIMEOUT_MS;
  const renewEveryMs = options.renewEveryMs ?? LIMITS.WS_LEASE_RENEW_MS;
  const hashKey = keyHasher(options.secret);
  /* Each rule with its place in the list, which keeps its keys apart; those that refuse first. */
  const rules = options.rules
    .map((rule, place) => ({ rule, place, lease: leaseRuleOf(rule) }))
    .sort((a, b) => Number(b.lease.onExceed === "reject") - Number(a.lease.onExceed === "reject"));
  /* This replica's leases: each connection's scopes, and each scope's connections in the order they came. */
  const scopesOf = new Map<string, string[]>();
  const byScope = new Map<string, Set<string>>();
  let renewal: ReturnType<typeof setInterval> | undefined;

  function renew(): void {
    const leases = [...scopesOf].flatMap(([lease, scopes]) =>
      scopes.map((scope) => ({ scope, lease })),
    );
    store.renew(leases).catch((error: unknown) => {
      refusals.warn({ event: "connection leases not renewed", code: "LEASES_UNAVAILABLE" }, error);
    });
  }

  function hold(lease: string, scope: string): void {
    scopesOf.set(lease, [...(scopesOf.get(lease) ?? []), scope]);
    byScope.set(scope, (byScope.get(scope) ?? new Set()).add(lease));
    if (renewal) return;
    renewal = setInterval(renew, renewEveryMs);
    (renewal as { unref?: () => void }).unref?.();
  }

  /* This replica's own decision, by the connections of the key it holds. */
  function decideAlone(scope: string, rule: LeaseRule): LeaseGrant {
    const mine = [...(byScope.get(scope) ?? [])];
    if (mine.length < rule.max) return { admitted: true, evict: [] };
    if (rule.onExceed === "reject") return { admitted: false };
    return { admitted: true, evict: mine.slice(0, mine.length - rule.max + 1) };
  }

  async function decide(scope: string, lease: string, rule: LeaseRule): Promise<LeaseGrant> {
    try {
      return await withinDeadline(store.acquire(scope, lease, rule), timeoutMs);
    } catch (error) {
      refusals.warn({ event: "connection leases unavailable", code: "LEASES_UNAVAILABLE" }, error);
      return decideAlone(scope, rule);
    }
  }

  function release(connectionId: string): void {
    const scopes = scopesOf.get(connectionId) ?? [];
    scopesOf.delete(connectionId);
    for (const scope of scopes) {
      const mine = byScope.get(scope);
      mine?.delete(connectionId);
      if (mine?.size === 0) byScope.delete(scope);
      store.release(scope, connectionId).catch((error: unknown) => {
        refusals.warn(
          { event: "connection lease not released", code: "LEASES_UNAVAILABLE" },
          error,
        );
      });
    }
    if (scopesOf.size > 0) return;
    clearInterval(renewal);
    renewal = undefined;
  }

  return {
    async admit({ connectionId, meta, clientIp }) {
      const evict = new Set<string>();
      for (const { rule, place, lease } of rules) {
        const key = rule.key(meta, { clientIp });
        if (key === undefined) continue;
        const scope = `key:${await hashKey(`${place}\u0000${key}`)}`;
        const grant = await decide(scope, connectionId, lease);
        if (!grant.admitted) {
          release(connectionId);
          return undefined;
        }
        hold(connectionId, scope);
        for (const given of grant.evict) if (given !== connectionId) evict.add(given);
      }
      return [...evict];
    },
    release,
    destroy() {
      clearInterval(renewal);
      renewal = undefined;
    },
  };
}

function leaseRuleOf(rule: ConnectionLimitRule): LeaseRule {
  return { max: rule.max, onExceed: rule.onExceed ?? "evict-oldest" };
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
