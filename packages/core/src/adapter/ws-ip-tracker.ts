/** Per-IP connection counter for DDoS/abuse protection */
export interface IPTracker {
  /** Check limit and increment count. Returns true if allowed. */
  acquire(ip: string): boolean;
  /** Decrement count on disconnect */
  release(ip: string): void;
}

/** Names the caller's address when the application can do better than a header. */
export type ClientIPResolver = (request: Request) => string | undefined;

/**
 * Work out which address a connection should be counted against.
 *
 * A `Request` carries no peer address, so without help this can only read
 * headers — and a header is written by whoever is talking to us. The chain
 * matters: a proxy *appends*, so in `1.2.3.4, 203.0.113.7` the left entry is
 * whatever the caller sent and the right one is what the nearest proxy
 * observed. Reading from the right therefore costs a forger the proxy
 * itself, while reading from the left costs nothing at all.
 *
 * That still only holds for one proxy deep. Behind two, the rightmost entry
 * is the inner proxy and every caller collapses into one bucket. An
 * application that knows its own topology should say so with `resolve`,
 * which is then the whole answer; everything else here is a default that
 * degrades honestly rather than a guarantee.
 *
 * @param request - The upgrade request
 * @param resolve - Supplied by the application when it knows the real address
 * @returns The address to count this connection against
 *
 * @example
 * ```ts
 * // Node, where the socket knows who is calling:
 * createWSHandler({ clientIp: (req) => socketOf(req)?.remoteAddress });
 * ```
 */
export function extractClientIP(request: Request, resolve?: ClientIPResolver): string {
  const named = resolve?.(request);
  if (named) return named;

  const forwarded = request.headers.get("X-Forwarded-For");
  if (forwarded) {
    /* Walking past empty entries keeps a chain with a trailing separator from
       collapsing into the unknown bucket, where it would share a quota with
       every caller that sends no address at all. */
    const hops = forwarded.split(",");
    for (let i = hops.length - 1; i >= 0; i -= 1) {
      const hop = hops[i]?.trim();
      if (hop) return hop;
    }
  }

  const cfIP = request.headers.get("CF-Connecting-IP");
  if (cfIP) return cfIP;

  const realIP = request.headers.get("X-Real-IP");
  if (realIP) return realIP;

  return "0.0.0.0";
}

/**
 * Create a per-IP connection tracker for DDoS/abuse protection.
 * Maintains a Map<ip, count> — increment on connect, decrement on disconnect.
 * When a single IP exceeds `maxPerIP`, new connections are rejected.
 *
 * @param maxPerIP - Maximum concurrent connections allowed per IP (e.g. 50)
 * @returns Tracker with acquire/release methods
 *
 * @example
 * const tracker = createIPTracker(50);
 * if (!tracker.acquire("192.168.1.1")) {
 *   ws.close(4429, "Too many connections");
 * }
 * // On disconnect:
 * tracker.release("192.168.1.1");
 */
export function createIPTracker(maxPerIP: number): IPTracker {
  const counts = new Map<string, number>();

  return {
    acquire(ip) {
      const current = counts.get(ip) ?? 0;
      if (current >= maxPerIP) return false;
      counts.set(ip, current + 1);
      return true;
    },
    release(ip) {
      const current = counts.get(ip) ?? 0;
      if (current <= 1) {
        counts.delete(ip);
      } else {
        counts.set(ip, current - 1);
      }
    },
  };
}
